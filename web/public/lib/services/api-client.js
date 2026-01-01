// API client service for making HTTP requests with authentication and correlation
import { generateRequestId } from "../utils/correlation-utils.js";
import { getAccessToken, getIdToken, ensureSession, handle403Error } from "./auth-service.js";
import { getLocalStorage, setLocalStorage } from "../utils/storage-utils.js";
import { showStatus } from "../utils/dom-utils.js";

/**
 * Fetch with client request ID and HMRC account headers
 * @param {string} url - Request URL
 * @param {Object} opts - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithId(url, opts = {}) {
  const headers = opts.headers instanceof Headers ? opts.headers : new Headers(opts.headers || {});
  
  try {
    const rid = generateRequestId();
    headers.set("X-Client-Request-Id", rid);
  } catch (error) {
    console.warn("Failed to generate X-Client-Request-Id:", error);
  }

  // Add hmrcAccount header if present in URL or localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const hmrcAccountFromUrl = urlParams.get("hmrcAccount");
  if (hmrcAccountFromUrl) {
    setLocalStorage("hmrcAccount", hmrcAccountFromUrl);
  }
  const hmrcAccount = hmrcAccountFromUrl || getLocalStorage("hmrcAccount");
  if (hmrcAccount) {
    headers.set("hmrcAccount", hmrcAccount);
  }

  return fetch(url, { ...opts, headers });
}

/**
 * Execute async request polling for 202 Accepted responses
 * @param {Response} res - Initial response
 * @param {string|Request} input - Original request input
 * @param {Object} init - Original request init
 * @param {Headers} currentHeaders - Current headers object
 * @returns {Promise<Response>} Final response
 */
export async function executeAsyncRequestPolling(res, input, init, currentHeaders) {
  if (init.fireAndForget) return res;

  // Remove the initial request signal for subsequent polls
  currentHeaders.delete("x-initial-request");

  const method = (init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
  let urlPath = typeof input === "string" ? input : input.url || input.toString();
  try {
    const parsedUrl = new URL(urlPath, window.location.origin);
    urlPath = parsedUrl.pathname + parsedUrl.search;
  } catch (error) {
    console.error(`Failed to parse URL for async request: ${urlPath}. Using original URL. Error: ${JSON.stringify(error)}`);
  }
  const requestDesc = `[${method} ${urlPath}]`;

  // 1. Set dynamic timeout based on request type
  let timeoutMs = 60000; // Default changed from 90s to 60s
  if (urlPath.includes("/hmrc/vat/return") && method === "POST") {
    timeoutMs = 960000; // 3 x 320s (Submit VAT)
  } else if (urlPath.includes("/hmrc/vat/obligation") || (urlPath.includes("/hmrc/vat/return") && method === "GET")) {
    timeoutMs = 420000; // 3 x 140s (Get VAT and Obligations)
  }

  console.log(`waiting async request ${requestDesc} (timeout: ${timeoutMs}ms)...`);
  const requestId = res.headers.get("x-request-id");
  if (requestId) {
    currentHeaders.set("x-request-id", requestId);
  }

  let pollCount = 0;
  const startTime = Date.now();

  while (res.status === 202) {
    const elapsed = Date.now() - startTime;
    if (init.signal?.aborted) {
      console.log(`aborted async request ${requestDesc} (poll #${pollCount}, elapsed: ${elapsed}ms)`);
      return res;
    }

    if (elapsed > timeoutMs) {
      console.error(`timed out async request ${requestDesc} (poll #${pollCount}, elapsed: ${elapsed}ms, timeout: ${timeoutMs}ms)`);
      return res;
    }

    pollCount++;
    // 2. Set check frequency: 1s, 2s, 4s, 4s...
    // Only applied to HMRC calls as requested
    const delay = urlPath.includes("/hmrc/") ? Math.min(Math.pow(2, pollCount - 1) * 1000, 4000) : 1000;

    if (typeof window !== "undefined" && window.showStatus) {
      window.showStatus(init.pollPendingMessage || `Still processing... (poll #${pollCount})`, "info");
    }

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, delay);
      if (init.signal) {
        init.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            const abortElapsed = Date.now() - startTime;
            console.log(`aborted async request ${requestDesc} (poll #${pollCount}, elapsed: ${abortElapsed}ms)`);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }
    });

    if (init.signal?.aborted) continue;

    console.log(
      `re-trying async request ${requestDesc} (poll #${pollCount}, elapsed: ${Date.now() - startTime}ms, timeout: ${timeoutMs}ms, last status: ${res.status})...`,
    );
    res = await fetch(input, { ...init, headers: currentHeaders });
  }

  console.log(`finished async request ${requestDesc} (poll #${pollCount}, elapsed: ${Date.now() - startTime}ms, status: ${res.status})`);
  if (typeof window !== "undefined" && window.showStatus) {
    if (res.ok && init.pollSuccessMessage) {
      window.showStatus(init.pollSuccessMessage, "success");
    } else if (!res.ok && init.pollErrorMessage) {
      window.showStatus(init.pollErrorMessage, "error");
    }
  }
  return res;
}

/**
 * Authorized fetch with Cognito access token and 401/403 handling
 * @param {string|Request} input - Request URL or Request object
 * @param {Object} init - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function authorizedFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  const accessToken = getAccessToken();
  // TODO: Does this still need X-Authorization instead of Authorization? - Retest when otherwise stable.
  if (accessToken) headers.set("X-Authorization", `Bearer ${accessToken}`);
  if (init.fireAndForget) headers.set("x-wait-time-ms", "0");
  headers.set("x-initial-request", "true");

  let first = await fetchWithId(input, { ...init, headers });

  // Handle async polling for 202 Accepted
  if (first.status === 202) {
    const rid = first.headers.get("x-request-id");
    if (rid) headers.set("x-request-id", rid);
    first = await executeAsyncRequestPolling(first, input, init, headers);
  }

  // Handle 403 Forbidden - likely missing bundle entitlement
  if (first.status === 403) {
    await handle403Error(first);
    return first; // Return the 403 response for caller to handle
  }

  // Handle 401 Unauthorized - token expired or invalid
  if (first.status !== 401) return first;

  // One-time retry after forcing refresh
  console.log("Received 401, attempting token refresh...");
  try {
    const refreshed = await ensureSession({ force: true });
    if (!refreshed) {
      // Refresh failed, guide user to re-authenticate
      console.warn("Token refresh failed, user needs to re-authenticate");
      if (typeof window !== "undefined" && window.showStatus) {
        window.showStatus("Your session has expired. Please log in again.", "warning");
        setTimeout(() => {
          window.location.href = "/auth/login.html";
        }, 2000);
      }
      return first;
    }
  } catch (e) {
    console.warn("Token refresh error:", e);
    return first;
  }

  const headers2 = new Headers(init.headers || {});
  const at2 = getAccessToken();
  if (at2) headers2.set("X-Authorization", `Bearer ${at2}`);
  headers2.set("x-initial-request", "true");

  // Carry over requestId if we had one from a previous 202 poll
  const lastRequestId = headers.get("x-request-id");
  if (lastRequestId) {
    headers2.set("x-request-id", lastRequestId);
    headers2.delete("x-initial-request");
  }

  let second = await fetchWithId(input, { ...init, headers: headers2 });

  if (second.status === 202) {
    const rid = second.headers.get("x-request-id");
    if (rid) headers2.set("x-request-id", rid);
    second = await executeAsyncRequestPolling(second, input, init, headers2);
  }

  return second;
}

/**
 * Fetch with ID token and automatic 401/403 handling
 * @param {string|Request} input - Request URL or Request object
 * @param {Object} init - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithIdToken(input, init = {}) {
  const headers = new Headers(init.headers || {});
  const idToken = getIdToken();
  if (idToken) headers.set("Authorization", `Bearer ${idToken}`);
  if (init.fireAndForget) headers.set("x-wait-time-ms", "0");
  headers.set("x-initial-request", "true");

  const executeFetch = async (currentHeaders) => {
    let res = await fetch(input, { ...init, headers: currentHeaders });

    if (res.status === 202) {
      res = await executeAsyncRequestPolling(res, input, init, currentHeaders);
    }
    return res;
  };

  const response = await executeFetch(headers);

  // Handle 403 Forbidden - likely missing bundle entitlement
  if (response.status === 403) {
    if (typeof handle403Error === "function") {
      await handle403Error(response);
    }
    return response;
  }

  // Handle 401 Unauthorized - token expired or invalid
  if (response.status !== 401) return response;

  // One-time retry after forcing refresh
  console.log("Received 401, attempting token refresh...");
  try {
    if (typeof ensureSession === "function") {
      const refreshed = await ensureSession({ force: true });
      if (!refreshed) {
        console.warn("Token refresh failed, user needs to re-authenticate");
        if (typeof window !== "undefined" && window.showStatus) {
          window.showStatus("Your session has expired. Please log in again.", "warning");
          setTimeout(() => {
            window.location.href = "/auth/login.html";
          }, 2000);
        }
        return response;
      }
    } else {
      return response;
    }
  } catch (e) {
    console.warn("Token refresh error:", e);
    return response;
  }

  const headers2 = new Headers(init.headers || {});
  const idToken2 = getIdToken();
  if (idToken2) headers2.set("Authorization", `Bearer ${idToken2}`);
  if (init.fireAndForget) headers2.set("x-wait-time-ms", "0");
  headers2.set("x-initial-request", "true");

  // Carry over requestId if we had one from a previous 202 poll
  const lastRequestId = headers.get("x-request-id");
  if (lastRequestId) {
    headers2.set("x-request-id", lastRequestId);
    headers2.delete("x-initial-request");
  }

  return executeFetch(headers2);
}
