// Generic utility functions for submit application

// Import utility and service modules
import { parseJwtClaims, getJwtExpiryMs } from "./lib/utils/jwt-utils.js";
import { generateRandomState } from "./lib/utils/crypto-utils.js";
import { showStatus, hideStatus, removeStatusMessage } from "./lib/utils/dom-utils.js";
import {
  installCorrelationInterceptor,
  getOrCreateTraceparent,
  getLastXRequestId,
  getLastXRequestIdSeenAt,
  prepareRedirectRequestId,
} from "./lib/utils/correlation-utils.js";
import {
  checkAuthStatus as _checkAuthStatus,
  checkTokenExpiry as _checkTokenExpiry,
  ensureSession as _ensureSession,
} from "./lib/services/auth-service.js";
import {
  fetchWithId as _fetchWithId,
  authorizedFetch as _authorizedFetch,
  fetchWithIdToken as _fetchWithIdToken,
} from "./lib/services/api-client.js";

// Re-export functions for backward compatibility
// eslint-disable-next-line no-unused-vars
const checkAuthStatus = _checkAuthStatus;
const checkTokenExpiry = _checkTokenExpiry;
const ensureSession = _ensureSession;
const fetchWithId = _fetchWithId;
const authorizedFetch = _authorizedFetch;
// eslint-disable-next-line no-unused-vars
const fetchWithIdToken = _fetchWithIdToken;

// Status message handling - re-exported from dom-utils
// (Functions are now imported above)

// Loading state management - moved to loading-spinner.js
// Functions are imported globally by loading-spinner.js for backward compatibility

// Install correlation fetch interceptor
installCorrelationInterceptor();

// Expose correlation utilities on window for backward compatibility
window.getTraceparent = getOrCreateTraceparent;
window.getLastXRequestId = getLastXRequestId;
window.__correlation = {
  prepareRedirect: prepareRedirectRequestId,
  getTraceparent: getOrCreateTraceparent,
  getLastXRequestId: getLastXRequestId,
  getLastXRequestIdSeenAt: getLastXRequestIdSeenAt,
};

// Client request correlation helper - removed, now using service module

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

// JWT utility functions - removed, now using utils module
// (parseJwtClaims, getJwtExpiryMs, base64UrlDecode imported from jwt-utils.js)

// Auth service functions - removed, now using service module
// (ensureSession, checkAuthStatus, checkTokenExpiry imported from auth-service.js)

// Handle 403 Forbidden errors - removed, now in auth-service module

// API client functions - removed, now using service module
// (authorizedFetch, fetchWithIdToken, executeAsyncRequestPolling imported from api-client.js)

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
async function fetchCatalogText(url = "/submit.catalogue.toml") {
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
