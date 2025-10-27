/* eslint-env browser */
/* global RTCPeerConnection */
// Generic utility functions for submit application

// Check authentication status on page load
function checkAuthStatus() {
  const accessToken = localStorage.getItem("cognitoAccessToken");
  const userInfo = localStorage.getItem("userInfo");

  if (accessToken && userInfo) {
    console.log("User is authenticated");
    updateLoginStatus();
  } else {
    console.log("User is not authenticated");
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
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Client request correlation helper
function fetchWithId(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  try {
    const rid = crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    headers.set("X-Client-Request-Id", rid);
  } catch (_) {}
  return fetch(url, { ...opts, headers });
}

// Auth API functions
async function getAuthUrl(state, provider = "hmrc") {
  const url = `/api/${provider}/authUrl-get?state=${encodeURIComponent(state)}`;
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
  const url = "/api/hmrc/vat/return-post";
  const response = await fetchWithId(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...govClientHeaders,
    },
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
  const url = "/api/hmrc/receipt-post";
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
      pc.createOffer().then((offer) => pc.setLocalDescription(offer));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          const ipMatch = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch) {
            clearTimeout(timeout);
            pc.close();
            resolve(ipMatch[1]);
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
  } catch (_) {
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
    "position:fixed;bottom:0;left:0;right:0;background:#111;color:#fff;padding:12px 16px;z-index:9999;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:center;font-size:14px";
  banner.innerHTML = `
    <span>We use minimal analytics to improve performance (CloudWatch RUM). We’ll only start after you consent. See our <a href="/privacy.html" style="color:#9cf">privacy policy</a>.</span>
    <div style="display:flex;gap:8px">
      <button id="consent-accept" class="btn" style="padding:6px 10px">Accept</button>
      <button id="consent-decline" class="btn" style="padding:6px 10px;background:#555;border-color:#555">Decline</button>
    </div>`;
  document.body.appendChild(banner);
  document.getElementById("consent-accept").onclick = () => {
    try {
      localStorage.setItem("consent.rum", "granted");
    } catch (_) {}
    document.body.removeChild(banner);
    document.dispatchEvent(new CustomEvent("consent-granted", { detail: { type: "rum" } }));
    maybeInitRum();
  };
  document.getElementById("consent-decline").onclick = () => {
    try {
      localStorage.setItem("consent.rum", "declined");
    } catch (_) {}
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
  } catch (_) {}
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
    } catch (_) {}
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
  } catch (_) {}
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
