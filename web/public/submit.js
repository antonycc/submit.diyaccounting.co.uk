/* eslint-env browser */
// eslint-disable-next-line no-redeclare
/* global RTCPeerConnection */
// Generic utility functions for submit application

// Check authentication status on page load
// eslint-disable-next-line no-unused-vars
function checkAuthStatus() {
  const accessToken = localStorage.getItem("cognitoAccessToken");
  const userInfo = localStorage.getItem("userInfo");

  if (accessToken && userInfo) {
    console.log("User is authenticated");
    // eslint-disable-next-line no-undef
    updateLoginStatus();
  } else {
    console.log("User is not authenticated");
    // eslint-disable-next-line no-undef
    updateLoginStatus();
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
        } catch {}
      }
      return tp;
    }

    function generateRequestId() {
      try {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
      } catch {}
      // Fallback to 32-hex entropy
      return randomHex(16) + randomHex(16);
    }

    function nextRedirectRequestId() {
      const ss = typeof window !== "undefined" ? window.sessionStorage : undefined;
      const carried = ss?.getItem?.("redirectXRequestId");
      if (carried) {
        try {
          ss?.removeItem?.("redirectXRequestId");
        } catch {}
        return carried;
      }
      return null;
    }

    // Expose lightweight API on window
    let lastXRequestId = (typeof window !== "undefined" && window.sessionStorage?.getItem?.("lastXRequestId")) || "";
    function setLastXRequestId(v) {
      lastXRequestId = v || "";
      try {
        if (v) window.sessionStorage?.setItem?.("lastXRequestId", v);
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent("correlation:update", { detail: { lastXRequestId: lastXRequestId } }));
      } catch {}
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
        } catch {}
        return id;
      },
      getTraceparent,
      getLastXRequestId: () => lastXRequestId,
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

  // Add hmrcAccount header if present in URL
  const urlParams = new URLSearchParams(window.location.search);
  const hmrcAccount = urlParams.get("hmrcAccount");
  if (hmrcAccount) {
    headers["hmrcAccount"] = hmrcAccount;
  }

  return fetch(url, { ...opts, headers });
}

// Correlation widget - render to the left of the entitlement status in the header
(function correlationWidget() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function copy(text) {
    try {
      navigator.clipboard?.writeText?.(text);
    } catch {}
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
      ridSpan.textContent = `x-request-id: ${(window.getLastXRequestId && window.getLastXRequestId()) || "-"}`;
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
      window.addEventListener("correlation:update", () => {
        const latest = (window.getLastXRequestId && window.getLastXRequestId()) || "-";
        ridSpan.textContent = `x-request-id: ${latest}`;
      });
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

// Auth API functions
async function getAuthUrl(state, provider = "hmrc") {
  const url = `/api/v1/${provider}/authUrl?state=${encodeURIComponent(state)}`;
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

  const response = await fetchWithId(url, {
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
  const response = await fetchWithId(url, {
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
// eslint-disable-next-line no-unused-vars
async function getGovClientHeaders() {
  // Enhanced IP detection with fallbacks
  const detectedIP = await getClientIP();
  const govClientPublicIPHeader = detectedIP;
  const govVendorPublicIPHeader = detectedIP;

  const govClientBrowserJSUserAgentHeader = navigator.userAgent;
  const govClientDeviceIDHeader = crypto.randomUUID();
  const govClientMultiFactorHeader = "type=OTHER";
  const govClientPublicIPTimestampHeader = new Date().toISOString();
  const govClientPublicPortHeader = "" + (window.location.port || (window.location.protocol === "https:" ? "443" : "80"));
  const govClientScreensHeader = JSON.stringify({
    width: window.screen.width,
    height: window.screen.height,
    colorDepth: window.screen.colorDepth,
    pixelDepth: window.screen.pixelDepth,
  });
  // eslint-disable-next-line new-cap
  const govClientTimezoneHeader = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const govClientUserIDsHeader = "test=1";
  const govClientWindowSizeHeader = JSON.stringify({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const govVendorForwardedHeader = "test=1";

  return {
    "Gov-Client-Browser-JS-User-Agent": govClientBrowserJSUserAgentHeader,
    "Gov-Client-Device-ID": govClientDeviceIDHeader,
    "Gov-Client-Multi-Factor": govClientMultiFactorHeader,
    "Gov-Client-Public-IP": govClientPublicIPHeader,
    "Gov-Client-Public-IP-Timestamp": govClientPublicIPTimestampHeader,
    "Gov-Client-Public-Port": govClientPublicPortHeader,
    "Gov-Client-Screens": govClientScreensHeader,
    "Gov-Client-Timezone": govClientTimezoneHeader,
    "Gov-Client-User-IDs": govClientUserIDsHeader,
    "Gov-Client-Window-Size": govClientWindowSizeHeader,
    "Gov-Vendor-Forwarded": govVendorForwardedHeader,
    "Gov-Vendor-Public-IP": govVendorPublicIPHeader,
  };
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
  const version = "1.16.0";
  const clientUrl = `https://client.rum.${c.region}.amazonaws.com/${version}/cwr.js`;
  try {
    await loadScript(clientUrl);
    if (typeof window.cwr === "function") {
      window.cwr("config", {
        sessionSampleRate: c.sessionSampleRate ?? 1,
        guestRoleArn: c.guestRoleArn,
        identityPoolId: c.identityPoolId,
        endpoint: `https://dataplane.rum.${c.region}.amazonaws.com`,
        telemetries: ["performance", "errors", "http"],
        allowCookies: true,
        enableXRay: true,
        appMonitorId: c.appMonitorId,
        region: c.region,
      });
      window.__RUM_INIT_DONE__ = true;
      rumReady();
      setRumUserIdIfAvailable();
    }
  } catch (e) {
    console.warn("Failed to init RUM:", e);
  }
}

async function sha256Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function setRumUserIdIfAvailable() {
  try {
    const userInfo = localStorage.getItem("userInfo");
    if (!userInfo) return;
    const user = JSON.parse(userInfo);
    const rawId = user.sub || user.username || user.email;
    if (!rawId) return;
    const hashed = await sha256Hex(String(rawId));
    if (window.cwr) {
      window.cwr("setUserId", hashed);
    } else {
      document.addEventListener("rum-ready", () => window.cwr && window.cwr("setUserId", hashed), { once: true });
    }
  } catch (error) {
    console.warn("Failed to set RUM user id:", error);
  }
}

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
      bootstrapRumConfigFromMeta();
      showConsentBannerIfNeeded();
      maybeInitRum();
      setRumUserIdIfAvailable();
    });
  } else {
    ensurePrivacyLink();
    bootstrapRumConfigFromMeta();
    showConsentBannerIfNeeded();
    maybeInitRum();
    setRumUserIdIfAvailable();
  }
  // Update user id on cross-tab login changes
  window.addEventListener("storage", (e) => {
    if (e.key === "userInfo") setRumUserIdIfAvailable();
  });
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
}
