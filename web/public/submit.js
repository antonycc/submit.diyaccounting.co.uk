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

// Auth API functions
async function getAuthUrl(state, provider = "hmrc") {
  const url = `/api/${provider}/authUrl-get?state=${encodeURIComponent(state)}`;
  console.log(`Getting auth URL. Remote call initiated: GET ${url}`);

  const response = await fetch(url);
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
  const url = "/api/submit-vat";
  const response = await fetch(url, {
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
  const url = "/api/log-receipt";
  const response = await fetch(url, {
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
}
