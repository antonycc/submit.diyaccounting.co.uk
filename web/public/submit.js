// Main entry point for submit application
// Imports all modules and exposes them on window for backward compatibility

// Utils layer
import { base64UrlDecode, parseJwtClaims, getJwtExpiryMs } from "./lib/utils/jwt-utils.js";
import { generateRandomState, randomHex, sha256Hex } from "./lib/utils/crypto-utils.js";
import {
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
  getSessionStorageItem,
  setSessionStorageItem,
  removeSessionStorageItem,
  getLocalStorageJson,
  setLocalStorageJson,
} from "./lib/utils/storage-utils.js";
import { showStatus, hideStatus, removeStatusMessage, onDomReady, readMeta } from "./lib/utils/dom-utils.js";
import {
  getTraceparent,
  getLastXRequestId,
  fetchWithId,
  generateTraceparent,
  getOrCreateTraceparent,
  generateRequestId,
  prepareRedirect,
} from "./lib/utils/correlation-utils.js";

// Services layer
import { checkAuthStatus, checkTokenExpiry, ensureSession, getAuthUrl } from "./lib/services/auth-service.js";
import { authorizedFetch, fetchWithIdToken, handle403Error, executeAsyncRequestPolling } from "./lib/services/api-client.js";
import { submitVat, getGovClientHeaders, getClientIP, getIPViaWebRTC } from "./lib/services/hmrc-service.js";
import { bundlesForActivity, activitiesForBundle, isActivityAvailable, fetchCatalogText } from "./lib/services/catalog-service.js";

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
      const tpVal = getTraceparent() || sessionStorage.getItem("traceparent") || "";
      tpSpan.textContent = `traceparent: ${tpVal}`;
      tpSpan.style.cursor = "pointer";
      tpSpan.addEventListener("click", () => copy(tpVal));

      const ridSpan = document.createElement("span");
      ridSpan.title = "last x-request-id (click to copy)";
      const initialRid = getLastXRequestId() || "-";
      const initialSeenAtIso = (window.__correlation && window.__correlation.getLastXRequestIdSeenAt?.()) || "";
      const initialSeenAt = initialSeenAtIso ? new Date(initialSeenAtIso) : null;
      const initialSeenText = initialSeenAt ? ` (seen ${initialSeenAt.toLocaleString()})` : "";
      ridSpan.textContent = `x-request-id: ${initialRid}${initialSeenText}`;
      ridSpan.style.cursor = "pointer";
      ridSpan.addEventListener("click", () => {
        const rid = getLastXRequestId() || "";
        if (rid) copy(rid);
      });

      container.appendChild(tpSpan);
      container.appendChild(ridSpan);

      // Insert as first element inside auth-section
      authSection.insertBefore(container, authSection.firstChild);

      // Update on correlation changes
      window.addEventListener("correlation:update", (evt) => {
        const latest = getLastXRequestId() || "-";
        const seenAtIso = evt?.detail?.seenAt || (window.__correlation && window.__correlation.getLastXRequestIdSeenAt?.());
        const seenAt = seenAtIso ? new Date(seenAtIso) : null;
        const seenText = seenAt ? ` (seen ${seenAt.toLocaleString()})` : "";
        ridSpan.textContent = `x-request-id: ${latest}${seenText}`;
      });

      // Respect debug gating
      try {
        const enabled = !!window.__debugEnabled__;
        container.style.display = enabled ? "inline-flex" : "none";
      } catch (err) {
        console.warn("Failed to check debug enabled flag for correlation widget:", err.message);
      }
    } catch (e) {
      console.warn("Failed to render correlation widget", e);
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    render();
  } else {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  }
})();

// Debug widgets gating
(async function debugWidgetsGating() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  async function userHasTestBundle() {
    try {
      const userInfo = localStorage.getItem("userInfo");
      if (!userInfo) return false;
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
      window.__debugEnabled__ = !!enabled;

      const entitlement = document.querySelector(".entitlement-status");
      setDisplay(entitlement, enabled ? "inline" : "none");

      const corr = document.getElementById("correlationWidget");
      setDisplay(corr, enabled ? "inline-flex" : "none");

      const viewSrc = document.getElementById("viewSourceLink");
      const tests = document.getElementById("latestTestsLink");
      const apiDocs = document.getElementById("apiDocsLink");

      if (viewSrc && !viewSrc.getAttribute("data-href-initialized")) {
        viewSrc.href = viewSrc.href || "#";
        viewSrc.setAttribute("data-href-initialized", "true");
      }
      if (tests) tests.href = "/tests/index.html";
      if (apiDocs) apiDocs.href = "/docs/index.html";

      setDisplay(viewSrc, enabled ? "inline" : "none");
      setDisplay(tests, enabled ? "inline" : "none");
      setDisplay(apiDocs, enabled ? "inline" : "none");

      const localStorageContainer = document.getElementById("localstorageContainer");
      setDisplay(localStorageContainer, enabled ? "block" : "none");
    } catch (e) {
      console.warn("Failed to apply debug widget visibility:", e);
    }
  }

  onDomReady(async () => {
    const enabled = await userHasTestBundle();
    applyVisibility(enabled);
  });

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
  if (document.getElementById("consent-banner")) return;
  const banner = document.createElement("div");
  banner.id = "consent-banner";
  banner.style.cssText =
    "position:fixed;bottom:0;left:0;right:0;background:#ddd;color:#111;padding:12px 16px;z-index:9999;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:center;font-size:14px";
  banner.innerHTML = `
    <span>We use minimal analytics to improve performance (CloudWatch RUM). We'll only start after you consent. See our <a href="/privacy.html" style="color:#369">privacy policy</a>.</span>
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

  try {
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
      };
      z.onerror = function (e) {
        console.warn("Failed to load RUM client:", e);
      };
      document.head.appendChild(z);
    })(
      "cwr",
      c.appMonitorId,
      "0.0.2-4",
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

// Wire up on load
if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensurePrivacyLink();
      bootstrapRumConfigFromMeta();
      maybeInitRum();
      document.addEventListener("consent-granted", (event) => {
        if (event.detail.type === "rum") {
          maybeInitRum();
        }
      });
    });
  } else {
    ensurePrivacyLink();
    bootstrapRumConfigFromMeta();
    maybeInitRum();
    document.addEventListener("consent-granted", (event) => {
      if (event.detail.type === "rum") {
        maybeInitRum();
      }
    });
  }
}

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

// Re-export everything on window for backward compatibility
// (Most are already exported by the individual modules, but we ensure they're all available)
if (typeof window !== "undefined") {
  // JWT utils
  window.base64UrlDecode = base64UrlDecode;
  window.parseJwtClaims = parseJwtClaims;
  window.getJwtExpiryMs = getJwtExpiryMs;

  // Crypto utils
  window.generateRandomState = generateRandomState;
  window.randomHex = randomHex;
  window.sha256Hex = sha256Hex;

  // Storage utils
  window.getLocalStorageItem = getLocalStorageItem;
  window.setLocalStorageItem = setLocalStorageItem;
  window.removeLocalStorageItem = removeLocalStorageItem;
  window.getSessionStorageItem = getSessionStorageItem;
  window.setSessionStorageItem = setSessionStorageItem;
  window.removeSessionStorageItem = removeSessionStorageItem;
  window.getLocalStorageJson = getLocalStorageJson;
  window.setLocalStorageJson = setLocalStorageJson;

  // DOM utils
  window.showStatus = showStatus;
  window.hideStatus = hideStatus;
  window.removeStatusMessage = removeStatusMessage;
  window.onDomReady = onDomReady;
  window.readMeta = readMeta;

  // Correlation utils
  window.getTraceparent = getTraceparent;
  window.getLastXRequestId = getLastXRequestId;
  window.fetchWithId = fetchWithId;
  window.generateTraceparent = generateTraceparent;
  window.getOrCreateTraceparent = getOrCreateTraceparent;
  window.generateRequestId = generateRequestId;

  // Auth service
  window.checkAuthStatus = checkAuthStatus;
  window.checkTokenExpiry = checkTokenExpiry;
  window.ensureSession = ensureSession;
  window.getAuthUrl = getAuthUrl;

  // API client
  window.authorizedFetch = authorizedFetch;
  window.fetchWithIdToken = fetchWithIdToken;
  window.handle403Error = handle403Error;
  window.executeAsyncRequestPolling = executeAsyncRequestPolling;

  // HMRC service
  window.submitVat = submitVat;
  window.getGovClientHeaders = getGovClientHeaders;
  window.getClientIP = getClientIP;
  window.getIPViaWebRTC = getIPViaWebRTC;

  // Catalog service
  window.bundlesForActivity = bundlesForActivity;
  window.activitiesForBundle = activitiesForBundle;
  window.isActivityAvailable = isActivityAvailable;
  window.fetchCatalogText = fetchCatalogText;

  // RUM functions
  window.hasRumConsent = hasRumConsent;
  window.maybeInitRum = maybeInitRum;
  window.loadScript = loadScript;
  window.bootstrapRumConfigFromStorage = bootstrapRumConfigFromStorage;
  window.bootstrapRumConfigFromMeta = bootstrapRumConfigFromMeta;

  // Correlation object
  window.__correlation = Object.assign(window.__correlation || {}, {
    prepareRedirect,
    getTraceparent,
    getLastXRequestId,
  });
}

// Signal that submit.js module is ready
// This is needed because ES modules are deferred and inline scripts may run before the module loads
if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.__submitReady__ = true;
  document.dispatchEvent(new CustomEvent("submit-ready"));
}

// Export for ES module usage
export {
  // JWT utils
  base64UrlDecode,
  parseJwtClaims,
  getJwtExpiryMs,
  // Crypto utils
  generateRandomState,
  randomHex,
  sha256Hex,
  // DOM utils
  showStatus,
  hideStatus,
  removeStatusMessage,
  onDomReady,
  readMeta,
  // Correlation utils
  getTraceparent,
  getLastXRequestId,
  fetchWithId,
  // Auth service
  checkAuthStatus,
  checkTokenExpiry,
  ensureSession,
  getAuthUrl,
  // API client
  authorizedFetch,
  fetchWithIdToken,
  // HMRC service
  submitVat,
  getGovClientHeaders,
  getClientIP,
  getIPViaWebRTC,
  // Catalog service
  bundlesForActivity,
  activitiesForBundle,
  isActivityAvailable,
  fetchCatalogText,
  // RUM
  hasRumConsent,
  maybeInitRum,
};
