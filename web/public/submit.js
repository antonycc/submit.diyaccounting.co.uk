// Generic utility functions for submit application

// Check authentication status on page load and validate token expiry
// eslint-disable-next-line no-unused-vars
function checkAuthStatus() {
  const accessToken = localStorage.getItem("cognitoAccessToken");
  const idToken = localStorage.getItem("cognitoIdToken");
  const userInfo = localStorage.getItem("userInfo");

  if (accessToken && userInfo) {
    console.log("User is authenticated");

    // Check if tokens are expired or about to expire
    checkTokenExpiry(accessToken, idToken);

    // eslint-disable-next-line no-undef
    updateLoginStatus();
  } else {
    console.log("User is not authenticated");
    // eslint-disable-next-line no-undef
    updateLoginStatus();
  }
}

// Check if tokens are expired and notify user
function checkTokenExpiry(accessToken, idToken) {
  try {
    const now = Date.now();
    const accessExpMs = getJwtExpiryMs(accessToken);
    const idExpMs = getJwtExpiryMs(idToken);

    // Check if either token is expired
    const accessExpired = accessExpMs && accessExpMs < now;
    const idExpired = idExpMs && idExpMs < now;

    if (accessExpired || idExpired) {
      console.warn("Token(s) expired on page load", { accessExpired, idExpired });

      // Notify user and offer to refresh
      if (typeof window !== "undefined" && window.showStatus) {
        window.showStatus("Your session has expired. Attempting to refresh...", "info");
      }

      // Attempt to refresh tokens (fire-and-forget)
      ensureSession({ force: true })
        .then((newToken) => {
          if (newToken) {
            console.log("Token refresh successful on page load");
            if (typeof window !== "undefined" && window.showStatus) {
              window.showStatus("Session refreshed successfully.", "success");
            }
          } else {
            console.warn("Token refresh failed on page load");
            if (typeof window !== "undefined" && window.showStatus) {
              window.showStatus("Session expired. Please log in again.", "warning");
              setTimeout(() => {
                window.location.href = "/auth/login.html";
              }, 3000);
            }
          }
          return undefined;
        })
        .catch((err) => {
          console.error("Token refresh error on page load:", err);
          if (typeof window !== "undefined" && window.showStatus) {
            window.showStatus("Session expired. Please log in again.", "warning");
            setTimeout(() => {
              window.location.href = "/auth/login.html";
            }, 3000);
          }
        });
      return;
    }

    // Check if tokens are expiring soon (within 5 minutes)
    const fiveMinutes = 5 * 60 * 1000;
    const accessExpiringSoon = accessExpMs && accessExpMs - now < fiveMinutes && accessExpMs - now > 0;
    const idExpiringSoon = idExpMs && idExpMs - now < fiveMinutes && idExpMs - now > 0;

    if (accessExpiringSoon || idExpiringSoon) {
      console.log("Token(s) expiring soon, attempting preemptive refresh");
      // Silently attempt to refresh tokens before they expire (fire-and-forget)
      ensureSession({ force: false, minTTLms: fiveMinutes })
        .then(() => {
          console.log("Preemptive token refresh successful");
          return undefined;
        })
        .catch((err) => {
          console.warn("Preemptive token refresh failed:", err);
        });
    }
  } catch (error) {
    console.warn("Error checking token expiry:", error);
  }
}

// Status message handling
function showStatus(message, type = "info") {
  console.log("Status message:", message, "Type:", type);
  const statusMessagesContainer = document.getElementById("statusMessagesContainer");
  const msgDiv = document.createElement("div");
  msgDiv.className = `status-message status-${type}`;

  // Create message content container
  const messageContent = document.createElement("span");
  messageContent.textContent = message;
  messageContent.className = "status-message-content";

  // Create close button
  const closeButton = document.createElement("button");
  closeButton.textContent = "×";
  closeButton.className = "status-close-button";
  closeButton.setAttribute("aria-label", "Close message");
  closeButton.addEventListener("click", () => {
    removeStatusMessage(msgDiv);
  });

  // Append content and close button to message div
  msgDiv.appendChild(messageContent);
  msgDiv.appendChild(closeButton);
  statusMessagesContainer.appendChild(msgDiv);

  // Auto-hide info messages after 30 seconds
  if (type === "info") {
    setTimeout(() => {
      removeStatusMessage(msgDiv);
    }, 30000);
  }
}

function removeStatusMessage(msgDiv) {
  if (msgDiv && msgDiv.parentNode) {
    msgDiv.remove();
  }
}

function hideStatus() {
  console.log("Hiding all status messages");
  const statusMessagesContainer = document.getElementById("statusMessagesContainer");
  statusMessagesContainer.innerHTML = "";
}

// Loading state management - moved to loading-spinner.js
// Functions are imported globally by loading-spinner.js for backward compatibility

// Utility functions
function generateRandomState() {
  try {
    // Prefer cryptographically secure random values where available
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      // Remove dashes to keep it compact and URL-safe
      return window.crypto.randomUUID().replace(/-/g, "");
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch (error) {
    console.warn("Failed to generate cryptographic random state:", error);
    // fall through to non-crypto fallback below
  }
  // Last-resort fallback without Math.random to avoid pseudo-random lint warnings
  // Uses high-resolution time if available to ensure uniqueness (not for security)
  const now = Date.now().toString(36);
  const perf = typeof performance !== "undefined" && performance.now ? Math.floor(performance.now() * 1000).toString(36) : "0";
  return `${now}${perf}`;
}

// Correlation and tracing: install a fetch interceptor that
// - Ensures a W3C traceparent header is sent with every backend request
// - Generates a high-entropy x-request-id per request
// - Optionally reuses a carried x-request-id across an auth redirect sequence
// - Captures the last x-request-id from responses for UI display
(function installCorrelation() {
  try {
    if (typeof window === "undefined") return;
    if (window.__fetchInterceptorInstalled) return;

    // Utilities
    function randomHex(bytes) {
      try {
        const arr = new Uint8Array(bytes);
        (window.crypto || {}).getRandomValues?.(arr);
        return Array.from(arr)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      } catch {
        // Fallback to time-based shards when crypto is unavailable
        const now = Date.now()
          .toString(16)
          .padStart(bytes * 2, "0");
        return now.slice(-bytes * 2);
      }
    }

    function generateTraceparent() {
      const version = "00";
      const traceId = randomHex(16); // 16 bytes = 32 hex
      const parentId = randomHex(8); // 8 bytes = 16 hex
      const flags = "01"; // sampled
      return `${version}-${traceId}-${parentId}-${flags}`;
    }

    function getOrCreateTraceparent() {
      const ss = typeof window !== "undefined" ? window.sessionStorage : undefined;
      let tp = ss?.getItem?.("traceparent");
      if (!tp) {
        tp = generateTraceparent();
        try {
          ss?.setItem?.("traceparent", tp);
        } catch (err) {
          console.warn("Failed to save traceparent to sessionStorage:", err.message);
        }
      }
      return tp;
    }

    function generateRequestId() {
      try {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
      } catch (err) {
        console.warn("Failed to use crypto.randomUUID for request ID generation:", err.message);
      }
      // Fallback to 32-hex entropy
      return randomHex(16) + randomHex(16);
    }

    function nextRedirectRequestId() {
      const ss = typeof window !== "undefined" ? window.sessionStorage : undefined;
      const carried = ss?.getItem?.("redirectXRequestId");
      if (carried) {
        try {
          ss?.removeItem?.("redirectXRequestId");
        } catch (err) {
          console.warn("Failed to remove redirectXRequestId from sessionStorage:", err.message);
        }
        return carried;
      }
      return null;
    }

    // Expose lightweight API on window
    let lastXRequestId = (typeof window !== "undefined" && window.sessionStorage?.getItem?.("lastXRequestId")) || "";
    let lastXRequestIdSeenAt = (typeof window !== "undefined" && window.sessionStorage?.getItem?.("lastXRequestIdSeenAt")) || "";
    function setLastXRequestId(v) {
      lastXRequestId = v || "";
      try {
        if (v) window.sessionStorage?.setItem?.("lastXRequestId", v);
      } catch (err) {
        console.warn("Failed to save lastXRequestId to sessionStorage:", err.message);
      }
      // Record the time we last saw an x-request-id so the UI can display it
      try {
        lastXRequestIdSeenAt = new Date().toISOString();
        window.sessionStorage?.setItem?.("lastXRequestIdSeenAt", lastXRequestIdSeenAt);
      } catch (err) {
        console.warn("Failed to save lastXRequestIdSeenAt to sessionStorage:", err.message);
      }
      try {
        window.dispatchEvent(
          new CustomEvent("correlation:update", { detail: { lastXRequestId: lastXRequestId, seenAt: lastXRequestIdSeenAt } }),
        );
      } catch (err) {
        console.warn("Failed to dispatch correlation:update event:", err.message);
      }
    }

    window.getTraceparent = function () {
      return getOrCreateTraceparent();
    };
    window.getLastXRequestId = function () {
      return lastXRequestId;
    };
    window.__correlation = Object.assign(window.__correlation || {}, {
      prepareRedirect() {
        const id = generateRequestId();
        try {
          window.sessionStorage?.setItem?.("redirectXRequestId", id);
        } catch (err) {
          console.warn("Failed to save redirectXRequestId to sessionStorage:", err.message);
        }
        return id;
      },
      // Avoid referencing an undeclared identifier in some test environments
      getTraceparent: () => getOrCreateTraceparent(),
      getLastXRequestId: () => lastXRequestId,
      getLastXRequestIdSeenAt: () => lastXRequestIdSeenAt,
    });

    // Install fetch wrapper
    const originalFetch = window.fetch?.bind(window);
    if (typeof originalFetch !== "function") return; // Defer if fetch not available

    window.fetch = async function (input, init) {
      const req = init || {};
      const url = typeof input === "string" ? input : input?.url || "";
      const isRelative = typeof url === "string" && (url.startsWith("/") || url.startsWith("./") || url.startsWith("../"));
      const isSameOrigin = typeof url === "string" && url.startsWith(window.location.origin);
      const isBackendCall = isRelative || isSameOrigin;

      // Normalize headers
      const existingHeaders = req.headers || (typeof input !== "string" ? input?.headers : undefined) || {};
      let headerObject;
      if (typeof Headers !== "undefined" && existingHeaders instanceof Headers) {
        headerObject = {};
        existingHeaders.forEach((value, key) => {
          headerObject[key] = value;
        });
      } else if (Array.isArray(existingHeaders)) {
        headerObject = Object.fromEntries(existingHeaders);
      } else {
        headerObject = { ...existingHeaders };
      }

      if (isBackendCall) {
        // Always send traceparent for backend calls
        headerObject["traceparent"] = getOrCreateTraceparent();

        // Generate a fresh x-request-id, unless a redirect flow ID is present
        let requestId = nextRedirectRequestId();
        if (!requestId) requestId = generateRequestId();
        headerObject["x-request-id"] = requestId;
      }

      const response = await originalFetch(input, { ...req, headers: headerObject });

      try {
        const rid = response?.headers?.get?.("x-request-id");
        if (rid) setLastXRequestId(rid);
      } catch {
        // ignore header read issues
      }

      return response;
    };

    window.__fetchInterceptorInstalled = true;
  } catch (e) {
    console.warn("Failed to install correlation fetch interceptor", e);
  }
})();

// Client request correlation helper
function fetchWithId(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  try {
    let rid;
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      rid = window.crypto.randomUUID();
    } else if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      rid = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } else {
      // fallback to time-based unique-ish id (not cryptographically secure)
      rid = `${Date.now().toString(36)}-${
        typeof performance !== "undefined" && performance.now ? Math.floor(performance.now() * 1000).toString(36) : "0"
      }`;
    }
    headers.set("X-Client-Request-Id", rid);
  } catch (error) {
    console.warn("Failed to generate X-Client-Request-Id:", error);
  }

  // Add hmrcAccount header if present in URL or localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const hmrcAccountFromUrl = urlParams.get("hmrcAccount");
  if (hmrcAccountFromUrl) {
    localStorage.setItem("hmrcAccount", hmrcAccountFromUrl);
  }
  const hmrcAccount = hmrcAccountFromUrl || localStorage.getItem("hmrcAccount");
  if (hmrcAccount) {
    headers.set("hmrcAccount", hmrcAccount);
  }

  return fetch(url, { ...opts, headers });
}

// Correlation widget - render to the left of the entitlement status in the header
(function correlationWidget() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function copy(text) {
    try {
      navigator.clipboard?.writeText?.(text);
    } catch (err) {
      console.warn("Failed to copy to clipboard:", err.message);
    }
  }

  function render() {
    try {
      const authSection = document.querySelector?.(".auth-section");
      if (!authSection || document.getElementById("correlationWidget")) return;

      const container = document.createElement("span");
      container.id = "correlationWidget";
      container.style.marginRight = "12px";
      container.style.fontSize = "0.8em";
      container.style.color = "#666";
      container.style.display = "inline-flex";
      container.style.gap = "8px";

      const tpSpan = document.createElement("span");
      tpSpan.title = "traceparent (click to copy)";
      const tpVal = (window.getTraceparent && window.getTraceparent()) || sessionStorage.getItem("traceparent") || "";
      tpSpan.textContent = `traceparent: ${tpVal}`;
      tpSpan.style.cursor = "pointer";
      tpSpan.addEventListener("click", () => copy(tpVal));

      const ridSpan = document.createElement("span");
      ridSpan.title = "last x-request-id (click to copy)";
      const initialRid = (window.getLastXRequestId && window.getLastXRequestId()) || "-";
      const initialSeenAtIso = (window.__correlation && window.__correlation.getLastXRequestIdSeenAt?.()) || "";
      const initialSeenAt = initialSeenAtIso ? new Date(initialSeenAtIso) : null;
      const initialSeenText = initialSeenAt ? ` (seen ${initialSeenAt.toLocaleString()})` : "";
      ridSpan.textContent = `x-request-id: ${initialRid}${initialSeenText}`;
      ridSpan.style.cursor = "pointer";
      ridSpan.addEventListener("click", () => {
        const rid = (window.getLastXRequestId && window.getLastXRequestId()) || "";
        if (rid) copy(rid);
      });

      container.appendChild(tpSpan);
      container.appendChild(ridSpan);

      // Insert as first element inside auth-section, to the left of entitlement status
      authSection.insertBefore(container, authSection.firstChild);

      // Update on correlation changes
      window.addEventListener("correlation:update", (evt) => {
        const latest = (window.getLastXRequestId && window.getLastXRequestId()) || "-";
        const seenAtIso = evt?.detail?.seenAt || (window.__correlation && window.__correlation.getLastXRequestIdSeenAt?.());
        const seenAt = seenAtIso ? new Date(seenAtIso) : null;
        const seenText = seenAt ? ` (seen ${seenAt.toLocaleString()})` : "";
        ridSpan.textContent = `x-request-id: ${latest}${seenText}`;
      });

      // Respect debug gating – default hidden until enabled
      try {
        const enabled = !!window.__debugEnabled__;
        container.style.display = enabled ? "inline-flex" : "none";
      } catch (err) {
        console.warn("Failed to check debug enabled flag for correlation widget:", err.message);
      }
    } catch (e) {
      // Non-fatal UI enhancement
      console.warn("Failed to render correlation widget", e);
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    render();
  } else {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  }
})();

// Debug widgets gating – only show on pages when user has the 'test' bundle
(async function debugWidgetsGating() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  async function userHasTestBundle() {
    try {
      const userInfo = localStorage.getItem("userInfo");
      if (!userInfo) return false;
      // Use window.fetchWithIdToken for automatic token refresh and retry on 401
      const resp = await window.fetchWithIdToken("/api/v1/bundle", {});
      if (!resp.ok) return false;
      const data = await resp.json();
      const bundles = Array.isArray(data?.bundles) ? data.bundles : [];
      return bundles.some((b) => (b?.bundleId || b) === "test" || String(b).startsWith("test|"));
    } catch (e) {
      console.warn("Failed to determine debug entitlement:", e);
      return false;
    }
  }

  function setDisplay(el, value) {
    if (el) el.style.display = value;
  }

  function applyVisibility(enabled) {
    try {
      // Flag for other scripts
      window.__debugEnabled__ = !!enabled;

      // entitlement-status span
      const entitlement = document.querySelector(".entitlement-status");
      setDisplay(entitlement, enabled ? "inline" : "none");

      // correlation widget container
      const corr = document.getElementById("correlationWidget");
      setDisplay(corr, enabled ? "inline-flex" : "none");

      // Footer links: view source, tests, api docs
      const viewSrc = document.getElementById("viewSourceLink");
      const tests = document.getElementById("latestTestsLink");
      const apiDocs = document.getElementById("apiDocsLink");

      // Normalize hrefs to absolute so they work from any page
      if (viewSrc && !viewSrc.getAttribute("data-href-initialized")) {
        viewSrc.href = viewSrc.href || "#";
        viewSrc.setAttribute("data-href-initialized", "true");
      }
      if (tests) tests.href = "/tests/index.html";
      if (apiDocs) apiDocs.href = "/docs/index.html";

      setDisplay(viewSrc, enabled ? "inline" : "none");
      setDisplay(tests, enabled ? "inline" : "none");
      setDisplay(apiDocs, enabled ? "inline" : "none");

      // Local storage viewer container
      const localStorageContainer = document.getElementById("localstorageContainer");
      setDisplay(localStorageContainer, enabled ? "block" : "none");
    } catch (e) {
      console.warn("Failed to apply debug widget visibility:", e);
    }
  }

  function onDomReady(cb) {
    if (document.readyState === "complete" || document.readyState === "interactive") cb();
    else document.addEventListener("DOMContentLoaded", cb, { once: true });
  }

  onDomReady(async () => {
    const enabled = await userHasTestBundle();
    applyVisibility(enabled);
  });

  // If user logs in/out in another tab, try to re-evaluate
  window.addEventListener("storage", (e) => {
    if (e.key === "cognitoIdToken" || e.key === "userInfo") {
      userHasTestBundle()
        .then(applyVisibility)
        .catch((err) => {
          console.warn("Failed to apply visibility after storage change:", err.message);
        });
    }
  });
})();

// Auth API functions
// Extended to accept optional scope; kept backward compatible with existing callers
async function getAuthUrl(state, provider = "hmrc", scope = undefined) {
  let url = `/api/v1/${provider}/authUrl?state=${encodeURIComponent(state)}`;
  if (scope) url += `&scope=${encodeURIComponent(scope)}`;
  console.log(`Getting auth URL. Remote call initiated: GET ${url}`);

  const response = await fetchWithId(url);
  const responseJson = await response.json();
  if (!response.ok) {
    const message = `Failed to get auth URL. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
  }

  console.log(`Got auth URL. Remote call completed successfully: GET ${url}`, responseJson);
  return responseJson;
}

// Lightweight JWT helpers for token expiry checks
function base64UrlDecode(str) {
  try {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = str.length % 4;
    if (pad) str += "=".repeat(4 - pad);
    return atob(str);
  } catch {
    return "";
  }
}

function parseJwtClaims(jwt) {
  try {
    if (!jwt || typeof jwt !== "string") return null;
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

function getJwtExpiryMs(jwt) {
  const claims = parseJwtClaims(jwt);
  const exp = claims && claims.exp ? Number(claims.exp) : 0;
  return exp ? exp * 1000 : 0;
}

// Ensure Cognito session freshness (best-effort)
// Attempts a refresh using refresh_token if available. If backend does not support refresh grant yet,
// this will safely no-op.
let __ensureSessionInflight = null;
async function ensureSession({ minTTLms = 30000, force = false } = {}) {
  try {
    const accessToken = localStorage.getItem("cognitoAccessToken");
    const refreshToken = localStorage.getItem("cognitoRefreshToken");
    if (!accessToken) return null;

    // If not forced, and token is fresh enough, skip
    if (!force) {
      const expMs = getJwtExpiryMs(accessToken);
      const now = Date.now();
      if (expMs && expMs - now > minTTLms) return accessToken;
    }

    // No refresh token or already in-flight
    if (!refreshToken) return accessToken;
    if (__ensureSessionInflight) return __ensureSessionInflight;

    // Attempt refresh via backend endpoint
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });

    __ensureSessionInflight = (async () => {
      try {
        const res = await fetchWithId("/api/v1/cognito/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        if (!res.ok) {
          // Backend may not support refresh yet; leave tokens as-is
          return accessToken;
        }
        const json = await res.json();
        const newAccess = json.accessToken || json.access_token || accessToken;
        const newId = json.idToken || json.id_token || localStorage.getItem("cognitoIdToken");
        const newRefresh = json.refreshToken || json.refresh_token || refreshToken;

        const prevAccess = localStorage.getItem("cognitoAccessToken");
        // Persist
        if (newAccess) localStorage.setItem("cognitoAccessToken", newAccess);
        if (newId) localStorage.setItem("cognitoIdToken", newId);
        if (newRefresh) localStorage.setItem("cognitoRefreshToken", newRefresh);

        // If token changed, invalidate request cache
        if (newAccess && newAccess !== prevAccess) {
          try {
            window.requestCache?.invalidate?.("/api/");
          } catch (err) {
            console.warn("Failed to invalidate request cache:", err.message);
          }
          try {
            localStorage.setItem("auth:lastUpdate", String(Date.now()));
          } catch (err) {
            console.warn("Failed to save auth:lastUpdate to localStorage:", err.message);
          }
        }
        return newAccess;
      } catch (err) {
        console.warn("Failed to refresh access token:", err.message, err.stack);
        return accessToken;
      } finally {
        __ensureSessionInflight = null;
      }
    })();

    return __ensureSessionInflight;
  } catch {
    return localStorage.getItem("cognitoAccessToken");
  }
}

// Handle 403 Forbidden errors with user guidance
async function handle403Error(response) {
  try {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody.message || "Access forbidden. You may need to add a bundle to access this feature.";
    console.warn("403 Forbidden:", message);

    // Show user-friendly error and guide to bundles page
    if (typeof window !== "undefined" && window.showStatus) {
      window.showStatus(`${message} Click here to add bundles.`, "error");
      // Add a link to bundles page in the error message
      setTimeout(() => {
        const statusContainer = document.getElementById("statusMessagesContainer");
        if (statusContainer) {
          const lastMessage = statusContainer.lastElementChild;
          if (lastMessage && lastMessage.classList.contains("status-error")) {
            lastMessage.style.cursor = "pointer";
            lastMessage.onclick = () => {
              window.location.href = "/account/bundles.html";
            };
          }
        }
      }, 100);
    }
  } catch (e) {
    console.warn("Failed to handle 403 error:", e);
  }
}

// Centralized fetch with Cognito header injection and 401/403 handling
async function authorizedFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  const accessToken = localStorage.getItem("cognitoAccessToken");
  // TODO: Does this still need X-Authorization instead of Authorization? - Retest when otherwise stable.
  if (accessToken) headers.set("X-Authorization", `Bearer ${accessToken}`);

  const first = await fetchWithId(input, { ...init, headers });

  // Handle 403 Forbidden - likely missing bundle entitlement
  if (first.status === 403) {
    await handle403Error(first);
    return first; // Return the 403 response for caller to handle
  }

  // Handle 401 Unauthorized - token expired or invalid
  if (first.status !== 401) return first;

  // One-time retry after forcing refresh
  // Note: Token refresh only works if backend supports refresh_token grant type
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
  const at2 = localStorage.getItem("cognitoAccessToken");
  if (at2) headers2.set("X-Authorization", `Bearer ${at2}`);
  return fetchWithId(input, { ...init, headers: headers2 });
}

// Expose authorizedFetch globally for HTML usage
window.authorizedFetch = authorizedFetch;

// Fetch with ID token and automatic 401/403 handling
// This is specifically for endpoints that use the Authorization header with idToken
async function fetchWithIdToken(input, init = {}) {
  // Helper to get the current idToken
  const getIdToken = () => {
    try {
      return localStorage.getItem("cognitoIdToken");
    } catch {
      return null;
    }
  };

  const headers = new Headers(init.headers || {});
  const idToken = getIdToken();
  if (idToken) headers.set("Authorization", `Bearer ${idToken}`);

  const executeFetch = async (currentHeaders) => {
    let res = await fetch(input, { ...init, headers: currentHeaders });

    if (res.status === 202) {
      console.log("Waiting for async response..."); // Before the wait starts
      const requestId = res.headers.get("x-request-id");
      if (requestId) {
        currentHeaders.set("x-request-id", requestId);
      }

      let pollCount = 0;
      const startTime = Date.now();
      while (res.status === 202) {
        if (init.signal?.aborted) {
          console.log("Async request aborted");
          return res;
        }

        const elapsed = Date.now() - startTime;
        if (elapsed > 60000) {
          console.error("Async request timed out after 1 minute");
          break;
        }

        pollCount++;
        const delay = pollCount <= 10 ? 10 : 1000;

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, delay);
          if (init.signal) {
            init.signal.addEventListener("abort", () => {
              clearTimeout(timeout);
              console.log("Async request aborted");
              reject(new DOMException("Aborted", "AbortError"));
            });
          }
        });

        const currentElapsed = Date.now() - startTime;
        const method = init.method || (typeof input === "object" && input.method) || "GET";
        let urlPath = typeof input === "string" ? input : input.url || input.toString();
        try {
          const parsedUrl = new URL(urlPath, window.location.origin);
          urlPath = parsedUrl.pathname + parsedUrl.search;
        } catch (e) {
          // Fallback to original urlPath if URL parsing fails
        }

        console.log(
          `re-trying async request [${method.toUpperCase()} ${urlPath}] (poll #${pollCount}, elapsed: ${currentElapsed}ms, timeout: 60000ms, last status: ${res.status})...`,
        ); // Just before each poll attempt
        res = await fetch(input, { ...init, headers: currentHeaders });
      }
      console.log("Async response came back with status: " + res.status); // When response comes back
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

  // Carry over requestId if we had one from a previous 202 poll
  const lastRequestId = headers.get("x-request-id");
  if (lastRequestId) headers2.set("x-request-id", lastRequestId);

  return executeFetch(headers2);
}

// Expose fetchWithIdToken globally for HTML usage
window.fetchWithIdToken = fetchWithIdToken;

// Invalidate request cache across tabs when Cognito token changes
try {
  window.addEventListener?.("storage", (e) => {
    if (e.key === "cognitoAccessToken") {
      try {
        window.requestCache?.invalidate?.("/api/");
      } catch (err) {
        console.warn("Failed to invalidate request cache on storage change:", err.message);
      }
    }
  });
} catch (err) {
  console.warn("Failed to initialize token expiry check:", err.message, err.stack);
}

// VAT submission API function
async function submitVat(vatNumber, periodKey, vatDue, accessToken, govClientHeaders = {}) {
  const url = "/api/v1/hmrc/vat/return";

  // Get Cognito JWT token for custom authorizer
  const cognitoAccessToken = localStorage.getItem("cognitoAccessToken");
  const headers = {
    "Content-Type": "application/json",
    ...govClientHeaders,
  };
  if (cognitoAccessToken) {
    headers["X-Authorization"] = `Bearer ${cognitoAccessToken}`;
  }

  const response = await authorizedFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ vatNumber, periodKey, vatDue, accessToken }),
  });
  const responseJson = await response.json();
  if (!response.ok) {
    const message = `Failed to submit VAT. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
  }
  return responseJson;
}

// Receipt logging API function
async function logReceipt(processingDate, formBundleNumber, chargeRefNumber) {
  const url = "/api/v1/hmrc/receipt";
  const response = await authorizedFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ processingDate, formBundleNumber, chargeRefNumber }),
  });
  const responseJson = await response.json();
  if (!response.ok) {
    const message = `Failed to log receipt. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
  }
  return responseJson;
}

// Enhanced IP detection function with multiple fallback methods
async function getClientIP() {
  // Method 1: Try WebRTC-based IP detection (works for local IPs, limited for public IPs in modern browsers)
  const webRTCIP = await getIPViaWebRTC().catch(() => null);
  if (webRTCIP && !webRTCIP.startsWith("192.168.") && !webRTCIP.startsWith("10.") && !webRTCIP.startsWith("172.")) {
    return webRTCIP;
  }

  // Method 2: Try multiple IP detection services with timeout
  const ipServices = ["https://api.ipify.org", "https://ipapi.co/ip", "https://httpbin.org/ip"];

  for (const service of ipServices) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      let response;
      if (service === "https://httpbin.org/ip") {
        response = await fetch(service, { signal: controller.signal });
        const data = await response.json();
        clearTimeout(timeoutId);
        return data.origin.split(",")[0].trim(); // httpbin returns "ip, ip" format sometimes
      } else {
        response = await fetch(service, { signal: controller.signal });
        const ip = await response.text();
        clearTimeout(timeoutId);
        return ip.trim();
      }
    } catch (error) {
      console.warn(`Failed to get IP from ${service}:`, error.message);
      continue;
    }
  }

  // Method 3: Fallback - let server detect IP from request headers
  console.warn("All IP detection methods failed, server will detect IP from request headers");
  return "SERVER_DETECT";
}

// WebRTC-based IP detection (limited effectiveness in modern browsers due to security restrictions)
function getIPViaWebRTC() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebRTC timeout")), 2000);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      pc.createDataChannel("");
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch((err) => {
          // Ensure we properly handle promise rejections
          clearTimeout(timeout);
          pc.close();
          reject(err);
        });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          const ip = extractIPv4FromCandidate(candidate);
          if (ip) {
            clearTimeout(timeout);
            pc.close();
            resolve(ip);
          }
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timeout);
          pc.close();
          reject(new Error("No IP found via WebRTC"));
        }
      };
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

// Extract the first IPv4 address from a WebRTC ICE candidate without using heavy regex
function extractIPv4FromCandidate(candidate) {
  if (!candidate || typeof candidate !== "string") return "";
  const tokens = [];
  let buf = "";
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    const isDigit = ch >= "0" && ch <= "9";
    if (isDigit || ch === ".") {
      buf += ch;
    } else if (buf) {
      tokens.push(buf);
      buf = "";
    }
  }
  if (buf) tokens.push(buf);

  for (const t of tokens) {
    if (isValidIPv4(t)) return t;
  }
  return "";
}

function isValidIPv4(token) {
  // Quick pre-check: must have exactly 3 dots
  let dotCount = 0;
  for (let i = 0; i < token.length; i++) if (token[i] === ".") dotCount++;
  if (dotCount !== 3) return false;

  const parts = token.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (p.length === 0 || p.length > 3) return false;
    // no leading zeros like "01" unless the number is exactly 0
    if (p.length > 1 && p[0] === "0") return false;
    let num = 0;
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (ch < "0" || ch > "9") return false;
      num = num * 10 + (ch.charCodeAt(0) - 48);
    }
    if (num < 0 || num > 255) return false;
  }
  return true;
}

// Helper to build Gov-Client headers for HMRC API calls
// Note: This function only collects client-side information.
// Vendor headers (Gov-Vendor-*) are generated server-side in buildFraudHeaders.js
// eslint-disable-next-line no-unused-vars
async function getGovClientHeaders() {
  // Try to detect client IP (may be blocked by CSP or fail, server will handle fallback)
  let detectedIP = "SERVER_DETECT"; // Signal server to detect IP
  try {
    detectedIP = await getClientIP();
  } catch (error) {
    console.warn("Client IP detection failed, server will detect:", error.message);
  }

  const govClientPublicIPHeader = detectedIP;
  const govClientBrowserJSUserAgentHeader = navigator.userAgent;
  const govClientDeviceIDHeader = crypto.randomUUID();

  // Gov-Client-Multi-Factor: Must include timestamp and unique-reference
  // TODO: Implement Gov-Client-Multi-Factor for cognito and omit when no MFA present
  let govClientMultiFactorHeader;
  // const mfaTimestamp = new Date().toISOString();
  // const mfaUniqueRef = crypto.randomUUID();
  // govClientMultiFactorHeader = `type=OTHER&timestamp=${encodeURIComponent(mfaTimestamp)}&unique-reference=${encodeURIComponent(mfaUniqueRef)}`;

  const govClientPublicIPTimestampHeader = new Date().toISOString();

  // Gov-Client-Screens: Must be an array of objects with scalingFactor encoded as key values, e.g. width=1920&height=1080&scaling-factor=1&colour-depth=1
  const govClientScreensHeader = [
    { width: window.screen.width },
    { height: window.screen.height },
    { "colour-depth": window.screen.colorDepth },
    { "scaling-factor": window.devicePixelRatio },
  ]
    .map((obj) => Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`))
    .join("&");

  // Gov-Client-Timezone: Must be in UTC±<hh>:<mm> format

  const timezoneOffset = -new Date().getTimezoneOffset(); // minutes, negative getTimezoneOffset means positive = east of UTC
  const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
  const offsetMinutes = Math.abs(timezoneOffset) % 60;
  const offsetSign = timezoneOffset >= 0 ? "+" : "-";
  const govClientTimezoneHeader = `UTC${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;

  // Gov-Client-Window-Size: Must be an object with width and height
  const govClientWindowSizeHeader = [{ width: window.innerWidth }, { height: window.innerHeight }]
    .map((obj) => Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`))
    .join("&");

  // Get current user ID from localStorage if available
  const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
  const userId = userInfo.sub || "browser-unknown";
  const govClientUserIDsHeader = `browser=${encodeURIComponent(userId)}`;

  // Build client headers only (no vendor headers)
  const headers = {
    "Gov-Client-Browser-JS-User-Agent": govClientBrowserJSUserAgentHeader,
    "Gov-Client-Device-ID": govClientDeviceIDHeader,
    "Gov-Client-Public-IP": govClientPublicIPHeader,
    "Gov-Client-Public-IP-Timestamp": govClientPublicIPTimestampHeader,
    "Gov-Client-Screens": govClientScreensHeader,
    "Gov-Client-Timezone": govClientTimezoneHeader,
    "Gov-Client-User-IDs": govClientUserIDsHeader,
    "Gov-Client-Window-Size": govClientWindowSizeHeader,
    // Note: Gov-Vendor-* headers are NOT included here - they're generated server-side
  };
  if (govClientMultiFactorHeader) {
    headers["Gov-Client-Multi-Factor"] = govClientMultiFactorHeader;
  }

  // TODO: Declare no Gov-Client-Public-Port to HMRC
  // The Submit service is a browser-based web application delivered over HTTPS via
  // CloudFront and AWS load balancers. The client TCP source port is not exposed to
  // application code in the browser and is not forwarded through the CDN/load
  // balancer layer.
  // In accordance with HMRC Fraud Prevention guidance, this header is omitted
  // because the data cannot be collected.
  // headers["Gov-Client-Public-Port"] = null;

  return headers;
}

// Catalog helpers (browser-safe; no TOML parsing here to avoid bundling dependencies)
function bundlesForActivity(catalog, activityId) {
  const activity = catalog?.activities?.find((a) => a.id === activityId);
  return activity?.bundles ?? [];
}

function activitiesForBundle(catalog, bundleId) {
  if (!catalog?.activities) return [];
  return catalog.activities.filter((a) => Array.isArray(a.bundles) && a.bundles.includes(bundleId)).map((a) => a.id);
}

function isActivityAvailable(catalog, activityId, bundleId) {
  return bundlesForActivity(catalog, activityId).includes(bundleId);
}

// Fetch raw TOML from the server; parsing to be done by the caller/test if needed
async function fetchCatalogText(url = "/product-catalogue.toml") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.status} ${res.statusText}`);
  return res.text();
}

// RUM consent + init
function hasRumConsent() {
  try {
    return localStorage.getItem("consent.rum") === "granted" || localStorage.getItem("consent.analytics") === "granted";
  } catch (error) {
    console.warn("Failed to read RUM consent from localStorage:", error);
    return false;
  }
}

function showConsentBannerIfNeeded() {
  if (hasRumConsent()) return;
  // Banner is shown regardless of whether RUM is fully configured yet
  if (document.getElementById("consent-banner")) return;
  const banner = document.createElement("div");
  banner.id = "consent-banner";
  banner.style.cssText =
    "position:fixed;bottom:0;left:0;right:0;background:#ddd;color:#111;padding:12px 16px;z-index:9999;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:center;font-size:14px";
  banner.innerHTML = `
    <span>We use minimal analytics to improve performance (CloudWatch RUM). We’ll only start after you consent. See our <a href="/privacy.html" style="color:#369">privacy policy</a>.</span>
    <div style="display:flex;gap:8px">
      <button id="consent-accept" class="btn" style="padding:6px 10px">Accept</button>
      <button id="consent-decline" class="btn" style="padding:6px 10px;background:#555;border-color:#555">Decline</button>
    </div>`;
  document.body.appendChild(banner);
  document.getElementById("consent-accept").onclick = () => {
    try {
      localStorage.setItem("consent.rum", "granted");
    } catch (error) {
      console.warn("Failed to store RUM consent in localStorage:", error);
    }
    document.body.removeChild(banner);
    document.dispatchEvent(new CustomEvent("consent-granted", { detail: { type: "rum" } }));
    maybeInitRum();
  };
  document.getElementById("consent-decline").onclick = () => {
    try {
      localStorage.setItem("consent.rum", "declined");
    } catch (error) {
      console.warn("Failed to store RUM consent in localStorage:", error);
    }
    document.body.removeChild(banner);
  };
}

// eslint-disable-next-line no-unused-vars
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function rumReady() {
  document.dispatchEvent(new CustomEvent("rum-ready"));
}

async function maybeInitRum() {
  if (!window.__RUM_CONFIG__) return;
  if (!hasRumConsent()) {
    showConsentBannerIfNeeded();
    return;
  }
  if (window.__RUM_INIT_DONE__) return;
  const c = window.__RUM_CONFIG__;
  if (!c.appMonitorId || !c.region || !c.identityPoolId || !c.guestRoleArn) return;

  try {
    // Use AWS RUM's proper initialization pattern with self-executing function
    // This creates the command queue and loads the client script
    /* eslint-disable sonarjs/no-parameter-reassignment */
    (function (n, i, v, r, s, config, u, x, z) {
      x = window.AwsRumClient = { q: [], n: n, i: i, v: v, r: r, c: config, u: u };
      window[n] = function (c, p) {
        x.q.push({ c: c, p: p });
      };
      z = document.createElement("script");
      z.async = true;
      z.src = s;
      z.onload = function () {
        window.__RUM_INIT_DONE__ = true;
        rumReady();
        // Note: setUserId is not a supported RUM command - removed
      };
      z.onerror = function (e) {
        console.warn("Failed to load RUM client:", e);
      };
      // Append to head instead of insertBefore to avoid issues with script tag location
      document.head.appendChild(z);
    })(
      "cwr",
      c.appMonitorId,
      "0.0.2-4", // Application version from package.json
      c.region,
      "https://client.rum.us-east-1.amazonaws.com/1.25.0/cwr.js",
      {
        sessionSampleRate: c.sessionSampleRate ?? 1,
        guestRoleArn: c.guestRoleArn,
        identityPoolId: c.identityPoolId,
        endpoint: `https://dataplane.rum.${c.region}.amazonaws.com`,
        telemetries: ["performance", "errors", "http"],
        allowCookies: true,
        enableXRay: true,
      },
    );
    /* eslint-enable sonarjs/no-parameter-reassignment */
  } catch (e) {
    console.warn("Failed to init RUM:", e);
  }
}

// eslint-disable-next-line no-unused-vars
async function sha256Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Note: setUserId is not a supported AWS CloudWatch RUM command
// User identification is handled automatically by RUM via cookies (cwr_u)
// If needed, user attributes can be added via addSessionAttributes command

function ensurePrivacyLink() {
  const anchors = Array.from(document.querySelectorAll('footer a[href$="privacy.html"]'));
  if (anchors.length) return;
  const footer = document.querySelector("footer .footer-left") || document.querySelector("footer");
  if (!footer) return;
  const link = document.createElement("a");
  link.href = "/privacy.html";
  link.textContent = "privacy";
  link.style.marginLeft = "8px";
  footer.appendChild(link);
}

function readMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el && el.content ? el.content.trim() : "";
}
function bootstrapRumConfigFromMeta() {
  if (window.__RUM_CONFIG__) return;
  const appMonitorId = readMeta("rum:appMonitorId");
  const region = readMeta("rum:region");
  const identityPoolId = readMeta("rum:identityPoolId");
  const guestRoleArn = readMeta("rum:guestRoleArn");
  if (appMonitorId && region && identityPoolId && guestRoleArn) {
    window.__RUM_CONFIG__ = { appMonitorId, region, identityPoolId, guestRoleArn, sessionSampleRate: 1 };
    try {
      localStorage.setItem("rum.config", JSON.stringify(window.__RUM_CONFIG__));
    } catch (error) {
      console.warn("Failed to store RUM config in localStorage:", error);
    }
  }
}

// TODO: re-integrate this to get the RUM stuff working
// eslint-disable-next-line no-unused-vars
function bootstrapRumConfigFromStorage() {
  if (window.__RUM_CONFIG__) return;
  try {
    const raw = localStorage.getItem("rum.config");
    if (!raw) return;
    const cfg = JSON.parse(raw);
    if (cfg && cfg.appMonitorId && cfg.region && cfg.identityPoolId && cfg.guestRoleArn) {
      window.__RUM_CONFIG__ = cfg;
    }
  } catch (error) {
    console.warn("Failed to read RUM config from localStorage:", error);
  }
}

// Wire up on load
// Ensure we have a real DOM before touching document in test environments
if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensurePrivacyLink();
      // Initialize RUM on page load
      (function initializeRumOnPageLoad() {
        // Bootstrap RUM configuration from meta tags
        bootstrapRumConfigFromMeta();

        // Attempt to initialize RUM (will show consent banner if needed)
        maybeInitRum();

        // If user consents later, this will handle it
        document.addEventListener("consent-granted", (event) => {
          if (event.detail.type === "rum") {
            maybeInitRum();
          }
        });
      })();
      // Note: User tracking handled automatically by RUM via cookies
    });
  } else {
    ensurePrivacyLink();
    // Initialize RUM on page load
    (function initializeRumOnPageLoad() {
      // Bootstrap RUM configuration from meta tags
      bootstrapRumConfigFromMeta();

      // Attempt to initialize RUM (will show consent banner if needed)
      maybeInitRum();

      // If user consents later, this will handle it
      document.addEventListener("consent-granted", (event) => {
        if (event.detail.type === "rum") {
          maybeInitRum();
        }
      });
    })();
    // Note: User tracking handled automatically by RUM via cookies
  }
  // Note: RUM handles user tracking automatically via cookies (cwr_u)
  // No need to manually sync user info changes
}

// Expose functions to window for use by other scripts and testing
if (typeof window !== "undefined") {
  window.showStatus = showStatus;
  window.hideStatus = hideStatus;
  window.removeStatusMessage = removeStatusMessage;
  // Loading functions are now in loading-spinner.js
  window.generateRandomState = generateRandomState;
  window.getAuthUrl = getAuthUrl;
  window.submitVat = submitVat;
  window.logReceipt = logReceipt;
  window.getClientIP = getClientIP;
  window.getIPViaWebRTC = getIPViaWebRTC;
  // new helpers
  window.bundlesForActivity = bundlesForActivity;
  window.activitiesForBundle = activitiesForBundle;
  window.isActivityAvailable = isActivityAvailable;
  window.fetchCatalogText = fetchCatalogText;
  window.fetchWithId = fetchWithId;
  // token management
  window.checkTokenExpiry = checkTokenExpiry;
  window.ensureSession = ensureSession;
  window.getJwtExpiryMs = getJwtExpiryMs;
  window.parseJwtClaims = parseJwtClaims;
}
