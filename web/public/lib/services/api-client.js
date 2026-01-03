/**
 * HTTP client and API interaction service.
 */

import { getIdToken, ensureSession, handle403Error, getAccessToken } from "./auth-service.js";
import { generateRequestId } from "../utils/correlation-utils.js";
import { getLocalStorageItem, setLocalStorageItem } from "../utils/storage-utils.js";
import { showStatus } from "../utils/dom-utils.js";

/**
 * Client request correlation helper that adds X-Client-Request-Id and hmrcAccount headers.
 */
export function fetchWithId(url, opts = {}) {
  const headers = opts.headers instanceof Headers ? opts.headers : new Headers(opts.headers || {});
  try {
    const rid = generateRequestId();
    headers.set("X-Client-Request-Id", rid);
  } catch (error) {
    console.warn("Failed to generate X-Client-Request-Id:", error);
  }

  // Add hmrcAccount header if present in URL or localStorage
  const urlParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const hmrcAccountFromUrl = urlParams.get("hmrcAccount");
  if (hmrcAccountFromUrl) {
    setLocalStorageItem("hmrcAccount", hmrcAccountFromUrl);
  }
  const hmrcAccount = hmrcAccountFromUrl || getLocalStorageItem("hmrcAccount");
  if (hmrcAccount) {
    headers.set("hmrcAccount", hmrcAccount);
  }

  return fetch(url, { ...opts, headers });
}

/**
 * Fetch wrapper that handles token injection and 401/403 error guidance.
 */
export async function authorizedFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  const accessToken = getAccessToken();
  if (accessToken) {
    headers.set("X-Authorization", `Bearer ${accessToken}`);
  }
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
    if (typeof window !== "undefined" && typeof window.handle403Error === "function") {
      await window.handle403Error(first);
    } else {
      await handle403Error(first);
    }
    return first;
  }

  // Handle 401 Unauthorized - token expired or invalid
  if (first.status !== 401) return first;

  // One-time retry after forcing refresh
  console.log("Received 401, attempting token refresh...");
  try {
    const refreshed = await (typeof window !== "undefined" && typeof window.ensureSession === "function"
      ? window.ensureSession({ force: true })
      : ensureSession({ force: true }));
    if (!refreshed) {
      console.warn("Token refresh failed, user needs to re-authenticate");
      const sStatus = typeof window !== "undefined" && typeof window.showStatus === "function" ? window.showStatus : showStatus;
      sStatus("Your session has expired. Please log in again.", "warning");
      if (typeof window !== "undefined") {
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
 * High-level fetcher that ensures a fresh ID token is used.
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
    if (typeof window !== "undefined" && typeof window.handle403Error === "function") {
      await window.handle403Error(response);
    } else {
      await handle403Error(response);
    }
    return response;
  }

  // Handle 401 Unauthorized - token expired or invalid
  if (response.status !== 401) return response;

  // One-time retry after forcing refresh
  console.log("Received 401, attempting token refresh...");
  try {
    const refreshed = await (typeof window !== "undefined" && typeof window.ensureSession === "function"
      ? window.ensureSession({ force: true })
      : ensureSession({ force: true }));
    if (!refreshed) {
      console.warn("Token refresh failed, user needs to re-authenticate");
      const sStatus = typeof window !== "undefined" && typeof window.showStatus === "function" ? window.showStatus : showStatus;
      sStatus("Your session has expired. Please log in again.", "warning");
      if (typeof window !== "undefined") {
        setTimeout(() => {
          window.location.href = "/auth/login.html";
        }, 2000);
      }
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

  const lastRequestId = headers.get("x-request-id");
  if (lastRequestId) {
    headers2.set("x-request-id", lastRequestId);
    headers2.delete("x-initial-request");
  }

  return executeFetch(headers2);
}

/**
 * Polls for completion of an asynchronous request (202 Accepted).
 */
export async function executeAsyncRequestPolling(res, input, init, currentHeaders) {
  if (init.fireAndForget) return res;

  currentHeaders.delete("x-initial-request");

  const method = (init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
  let urlPath = typeof input === "string" ? input : input.url || input.toString();
  try {
    const parsedUrl = new URL(urlPath, typeof window !== "undefined" ? window.location.origin : undefined);
    urlPath = parsedUrl.pathname + parsedUrl.search;
  } catch (error) {
    console.error(`Failed to parse URL for async request: ${urlPath}.`);
  }
  const requestDesc = `[${method} ${urlPath}]`;

  let timeoutMs = 60000;
  if (urlPath.includes("/hmrc/vat/return") && method === "POST") {
    timeoutMs = 960000;
  } else if (urlPath.includes("/hmrc/vat/obligation") || (urlPath.includes("/hmrc/vat/return") && method === "GET")) {
    timeoutMs = 420000;
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
    const delay = urlPath.includes("/hmrc/") ? Math.min(Math.pow(2, pollCount - 1) * 1000, 4000) : 1000;

    const sStatus = typeof window !== "undefined" && typeof window.showStatus === "function" ? window.showStatus : showStatus;
    if (typeof window !== "undefined") {
      sStatus(init.pollPendingMessage || `Still processing... (poll #${pollCount})`, "info");
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
  const sStatus = typeof window !== "undefined" && typeof window.showStatus === "function" ? window.showStatus : showStatus;
  if (typeof window !== "undefined") {
    if (res.ok && init.pollSuccessMessage) {
      sStatus(init.pollSuccessMessage, "success");
    } else if (!res.ok && init.pollErrorMessage) {
      sStatus(init.pollErrorMessage, "error");
    }
  }
  return res;
}
