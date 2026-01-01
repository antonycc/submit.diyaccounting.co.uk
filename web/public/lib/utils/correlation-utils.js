/**
 * Correlation and tracing utilities, including fetch interceptor for request IDs and traceparents.
 */

import { getSessionStorageItem, setSessionStorageItem, removeSessionStorageItem } from "./storage-utils.js";

// Internal state for last seen request ID
let lastXRequestId = getSessionStorageItem("lastXRequestId") || "";
let lastXRequestIdSeenAt = getSessionStorageItem("lastXRequestIdSeenAt") || "";

/**
 * Generates a random hex string of specified length.
 * @param {number} bytes
 * @returns {string}
 */
export function randomHex(bytes) {
  try {
    if (typeof window !== "undefined" && window.crypto && typeof window.crypto.getRandomValues === "function") {
      const arr = new Uint8Array(bytes);
      window.crypto.getRandomValues(arr);
      return Array.from(arr)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch (err) {
    console.warn("randomHex: crypto.getRandomValues failed, using fallback:", err.message);
  }
  // Fallback to time-based shards when crypto is unavailable
  const now = Date.now()
    .toString(16)
    .padStart(bytes * 2, "0");
  return now.slice(-bytes * 2);
}

/**
 * Generates a W3C traceparent header value.
 * @returns {string}
 */
export function generateTraceparent() {
  const version = "00";
  const traceId = randomHex(16); // 16 bytes = 32 hex
  const parentId = randomHex(8); // 8 bytes = 16 hex
  const flags = "01"; // sampled
  return `${version}-${traceId}-${parentId}-${flags}`;
}

/**
 * Gets the current traceparent from sessionStorage or generates a new one.
 * @returns {string}
 */
export function getOrCreateTraceparent() {
  let tp = getSessionStorageItem("traceparent");
  if (!tp) {
    tp = generateTraceparent();
    setSessionStorageItem("traceparent", tp);
  }
  return tp;
}

/**
 * Generates a high-entropy request ID.
 * @returns {string}
 */
export function generateRequestId() {
  try {
    if (typeof window !== "undefined" && window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
  } catch (err) {
    console.warn("generateRequestId: crypto.randomUUID failed, using fallback:", err.message);
  }
  // Fallback to 32-hex entropy
  return randomHex(16) + randomHex(16);
}

/**
 * Gets and clears a carried request ID from sessionStorage.
 * @returns {string|null}
 */
export function nextRedirectRequestId() {
  const carried = getSessionStorageItem("redirectXRequestId");
  if (carried) {
    removeSessionStorageItem("redirectXRequestId");
    return carried;
  }
  return null;
}

/**
 * Updates the last seen request ID and dispatches an update event.
 * @param {string} v
 */
export function setLastXRequestId(v) {
  lastXRequestId = v || "";
  if (v) setSessionStorageItem("lastXRequestId", v);

  lastXRequestIdSeenAt = new Date().toISOString();
  setSessionStorageItem("lastXRequestIdSeenAt", lastXRequestIdSeenAt);

  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("correlation:update", {
          detail: { lastXRequestId, seenAt: lastXRequestIdSeenAt },
        }),
      );
    }
  } catch (err) {
    console.warn("Failed to dispatch correlation:update event:", err.message);
  }
}

export function getLastXRequestId() {
  return lastXRequestId;
}

export function getLastXRequestIdSeenAt() {
  return lastXRequestIdSeenAt;
}

/**
 * Installs the fetch interceptor.
 */
export function installCorrelation() {
  try {
    if (typeof window === "undefined") return;
    if (window.__fetchInterceptorInstalled) return;

    // Expose lightweight API on window for backward compatibility
    window.getTraceparent = getOrCreateTraceparent;
    window.getLastXRequestId = getLastXRequestId;
    window.__correlation = Object.assign(window.__correlation || {}, {
      prepareRedirect() {
        const id = generateRequestId();
        setSessionStorageItem("redirectXRequestId", id);
        return id;
      },
      getTraceparent: getOrCreateTraceparent,
      getLastXRequestId: getLastXRequestId,
      getLastXRequestIdSeenAt: getLastXRequestIdSeenAt,
    });

    // Install fetch wrapper
    const originalFetch = window.fetch?.bind(window);
    if (typeof originalFetch !== "function") return;

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
        headerObject["traceparent"] = getOrCreateTraceparent();
        const existingRid = headerObject["x-request-id"] || headerObject["X-Request-Id"];
        if (!existingRid) {
          let requestId = nextRedirectRequestId();
          if (!requestId) requestId = generateRequestId();
          headerObject["x-request-id"] = requestId;
        }
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
    console.log("Correlation fetch interceptor installed");
  } catch (e) {
    console.warn("Failed to install correlation fetch interceptor", e);
  }
}

// Replicate behaviour: install on load
if (typeof window !== "undefined") {
  installCorrelation();
}
