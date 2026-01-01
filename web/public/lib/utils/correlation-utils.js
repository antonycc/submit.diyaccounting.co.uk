// Correlation and tracing utilities for request tracking
import { randomHex } from "./crypto-utils.js";

/**
 * Generate W3C traceparent header value
 * @returns {string} Traceparent header value (format: 00-{traceId}-{parentId}-01)
 */
export function generateTraceparent() {
  const version = "00";
  const traceId = randomHex(16); // 16 bytes = 32 hex
  const parentId = randomHex(8); // 8 bytes = 16 hex
  const flags = "01"; // sampled
  return `${version}-${traceId}-${parentId}-${flags}`;
}

/**
 * Get or create traceparent from session storage
 * @returns {string} Traceparent value
 */
export function getOrCreateTraceparent() {
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

/**
 * Generate a unique request ID
 * @returns {string} Request ID (UUID format or 64-character hex)
 */
export function generateRequestId() {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch (err) {
    console.warn("Failed to use crypto.randomUUID for request ID generation:", err.message);
  }
  // Fallback to 32-hex entropy
  return randomHex(16) + randomHex(16);
}

/**
 * Get and consume a redirect request ID from session storage
 * @returns {string|null} Request ID if available, null otherwise
 */
export function nextRedirectRequestId() {
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

/**
 * Prepare a request ID for redirect (store in session storage)
 * @returns {string} Generated request ID
 */
export function prepareRedirectRequestId() {
  const id = generateRequestId();
  try {
    window.sessionStorage?.setItem?.("redirectXRequestId", id);
  } catch (err) {
    console.warn("Failed to save redirectXRequestId to sessionStorage:", err.message);
  }
  return id;
}

/**
 * Set the last seen x-request-id and dispatch update event
 * @param {string} requestId - Request ID value
 */
export function setLastXRequestId(requestId) {
  const v = requestId || "";
  try {
    if (v) window.sessionStorage?.setItem?.("lastXRequestId", v);
  } catch (err) {
    console.warn("Failed to save lastXRequestId to sessionStorage:", err.message);
  }
  // Record the time we last saw an x-request-id so the UI can display it
  try {
    const seenAt = new Date().toISOString();
    window.sessionStorage?.setItem?.("lastXRequestIdSeenAt", seenAt);
    window.dispatchEvent(new CustomEvent("correlation:update", { detail: { lastXRequestId: v, seenAt: seenAt } }));
  } catch (err) {
    console.warn("Failed to save lastXRequestIdSeenAt to sessionStorage:", err.message);
  }
}

/**
 * Get the last seen x-request-id from session storage
 * @returns {string} Last request ID or empty string
 */
export function getLastXRequestId() {
  return (typeof window !== "undefined" && window.sessionStorage?.getItem?.("lastXRequestId")) || "";
}

/**
 * Get the last seen x-request-id timestamp from session storage
 * @returns {string} ISO timestamp or empty string
 */
export function getLastXRequestIdSeenAt() {
  return (typeof window !== "undefined" && window.sessionStorage?.getItem?.("lastXRequestIdSeenAt")) || "";
}

/**
 * Install correlation fetch interceptor that:
 * - Adds W3C traceparent header to backend requests
 * - Generates and adds x-request-id to requests
 * - Captures x-request-id from responses
 */
export function installCorrelationInterceptor() {
  try {
    if (typeof window === "undefined") return;
    if (window.__fetchInterceptorInstalled) return;

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

        // Generate a fresh x-request-id, unless one is already present or carried
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
  } catch (e) {
    console.warn("Failed to install correlation fetch interceptor", e);
  }
}
