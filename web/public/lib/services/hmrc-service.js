/**
 * HMRC-specific API services and IP detection utilities.
 */

import { fetchWithId, authorizedFetch } from "./api-client.js";
import { getLocalStorageItem, setLocalStorageItem } from "../utils/storage-utils.js";

/**
 * Gets the HMRC authorization URL.
 */
export async function getAuthUrl(state, provider = "hmrc", scope = undefined) {
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

/**
 * Submits a VAT return to HMRC.
 */
export async function submitVat(vatNumber, periodKey, vatDue, accessToken, govClientHeaders = {}) {
  const url = "/api/v1/hmrc/vat/return";

  const cognitoAccessToken = getLocalStorageItem("cognitoAccessToken");
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
  console.log(`Submitted VAT. Remote call completed successfully: POST ${url}`, responseJson, responseJson.receipt);
  // Return the receipt object when present (production), otherwise return the full body (tests/mocks)
  return responseJson?.receipt ?? responseJson;
}

/**
 * Enhanced IP detection function with multiple fallback methods.
 */
export async function getClientIP() {
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

/**
 * WebRTC-based IP detection (limited effectiveness in modern browsers due to security restrictions)
 */
export function getIPViaWebRTC() {
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

/**
 * Extract the first IPv4 address from a WebRTC ICE candidate without using heavy regex
 */
export function extractIPv4FromCandidate(candidate) {
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

export function isValidIPv4(token) {
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

/**
 * Helper to build Gov-Client headers for HMRC API calls
 * Note: This function only collects client-side information.
 * Vendor headers (Gov-Vendor-*) are generated server-side in buildFraudHeaders.js
 */
export async function getGovClientHeaders() {
  // Try to detect client IP (may be blocked by CSP or fail, server will handle fallback)
  let detectedIP = "SERVER_DETECT"; // Signal server to detect IP
  try {
    detectedIP = await getClientIP();
  } catch (error) {
    console.warn("Client IP detection failed, server will detect:", error.message);
  }

  const govClientPublicIPHeader = detectedIP;
  const govClientBrowserJSUserAgentHeader = navigator.userAgent;
  const govClientDeviceIDHeader = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "unknown-device";

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
  const userInfoRaw = getLocalStorageItem("userInfo");
  const userInfo = userInfoRaw ? JSON.parse(userInfoRaw) : {};
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
  };

  return headers;
}
