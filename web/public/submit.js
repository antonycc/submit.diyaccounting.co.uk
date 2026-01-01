// Generic utility functions for submit application
console.log("submit.js module loading...");
import { generateRandomState } from "./lib/utils/crypto-utils.js";
import { base64UrlDecode, parseJwtClaims, getJwtExpiryMs } from "./lib/utils/jwt-utils.js";
import { showStatus, hideStatus, removeStatusMessage } from "./lib/utils/dom-utils.js";
import {
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
  getSessionStorageItem,
  setSessionStorageItem,
  removeSessionStorageItem,
} from "./lib/utils/storage-utils.js";
import { generateRequestId, getOrCreateTraceparent, getLastXRequestId } from "./lib/utils/correlation-utils.js";
import {
  checkAuthStatus,
  checkTokenExpiry,
  ensureSession,
  getAccessToken,
  getIdToken,
  handle403Error,
} from "./lib/services/auth-service.js";
import { fetchWithId, authorizedFetch, fetchWithIdToken, executeAsyncRequestPolling } from "./lib/services/api-client.js";
import { getAuthUrl, submitVat, getClientIP, getIPViaWebRTC, getGovClientHeaders } from "./lib/services/hmrc-service.js";
import { bundlesForActivity, activitiesForBundle, isActivityAvailable, fetchCatalogText } from "./lib/services/catalog-service.js";

// Check authentication status on page load and validate token expiry

// Status message handling

// Loading state management - moved to loading-spinner.js
// Functions are imported globally by loading-spinner.js for backward compatibility

// Utility functions

// Correlation and tracing: install a fetch interceptor that
// - Ensures a W3C traceparent header is sent with every backend request
// - Generates a high-entropy x-request-id per request
// - Optionally reuses a carried x-request-id across an auth redirect sequence
// - Captures the last x-request-id from responses for UI display

// Client request correlation helper

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
      // Use fetchWithIdToken for automatic token refresh and retry on 401
      const resp = await fetchWithIdToken("/api/v1/bundle", {});
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

// Lightweight JWT helpers for token expiry checks

// Ensure Cognito session freshness (best-effort)

// Handle 403 Forbidden errors with user guidance

// Centralized fetch with Cognito header injection and 401/403 handling

// Expose authorizedFetch globally for HTML usage
window.authorizedFetch = authorizedFetch;

// Helper for polling asynchronous requests (HTTP 202 Accepted)

// Fetch with ID token and automatic 401/403 handling

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

// Enhanced IP detection function with multiple fallback methods

// Catalog helpers (browser-safe; no TOML parsing here to avoid bundling dependencies)

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
  window.base64UrlDecode = base64UrlDecode;
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
  window.checkAuthStatus = checkAuthStatus;
  window.ensureSession = ensureSession;
  window.authorizedFetch = authorizedFetch;
  window.fetchWithIdToken = fetchWithIdToken;
  window.handle403Error = handle403Error;
  window.executeAsyncRequestPolling = executeAsyncRequestPolling;
  window.getGovClientHeaders = getGovClientHeaders;
  window.getJwtExpiryMs = getJwtExpiryMs;
  window.parseJwtClaims = parseJwtClaims;
  console.log("submit.js module loaded and window exports initialized");
}
