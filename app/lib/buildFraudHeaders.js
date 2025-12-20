// app/lib/buildFraudHeaders.js

import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/buildFraudHeaders.js" });

/**
 * Build Gov-Client and Gov-Vendor fraud prevention headers from the incoming API Gateway event.
 * Follows HMRC's fraud prevention header specifications for WEB_APP_VIA_SERVER connection method.
 *
 * @param {object} event – Lambda proxy event containing headers and request context
 * @returns {object} – An object containing all required fraud prevention headers
 */
export function buildFraudHeaders(event) {
  const headers = {};
  const eventHeaders = event.headers || {};

  // Helper to get header case-insensitively
  const getHeader = (name) => {
    const lowerName = name.toLowerCase();
    return eventHeaders[name] ?? eventHeaders[lowerName] ?? eventHeaders[name.toUpperCase()];
  };

  // 1. Client public IP – extract the first non-private IP from X-Forwarded-For header
  const xff = getHeader("x-forwarded-for") || "";
  const clientIps = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Find first public IP (excluding private IP ranges)
  const publicClientIp = clientIps.find((ip) => {
    // Exclude private IP ranges: 10.x.x.x, 192.168.x.x, 172.16-31.x.x, and localhost
    return (
      !ip.startsWith("10.") &&
      !ip.startsWith("192.168.") &&
      !ip.match(/^172\.(1\d|2\d|3[0-1])\./) &&
      !ip.startsWith("127.") &&
      !ip.startsWith("::1") &&
      !ip.startsWith("fe80:")
    );
  });

  if (publicClientIp) {
    headers["Gov-Client-Public-IP"] = publicClientIp;
    logger.debug({ message: "Detected public client IP", publicClientIp, xff });
  } else {
    logger.warn({ message: "No public client IP detected in X-Forwarded-For", xff });
  }

  // 2. Client device ID – from custom header sent by browser
  const deviceId = getHeader("x-device-id") || getHeader("Gov-Client-Device-ID");
  if (deviceId && deviceId !== "unknown-device") {
    headers["Gov-Client-Device-ID"] = deviceId;
  }

  // 3. Client user IDs – from authenticated user (Cognito sub) or anonymous
  const userId = event.requestContext?.authorizer?.claims?.sub || event.requestContext?.authorizer?.sub || "anonymous";
  headers["Gov-Client-User-IDs"] = `server=${encodeURIComponent(userId)}`;

  // 4. Connection method – WEB_APP_VIA_SERVER for both client and vendor
  headers["Gov-Client-Connection-Method"] = "WEB_APP_VIA_SERVER";
  headers["Gov-Vendor-Connection-Method"] = "WEB_APP_VIA_SERVER";

  // 5. Vendor public IP – use detected client IP or SERVER_PUBLIC_IP from environment
  const serverPublicIp = process.env.SERVER_PUBLIC_IP || publicClientIp;
  if (serverPublicIp) {
    headers["Gov-Vendor-Public-IP"] = serverPublicIp;
  }

  // 6. Vendor forwarded chain – build from X-Forwarded-For
  // Format: Array of objects with 'by' and 'for' keys
  if (serverPublicIp && clientIps.length > 0) {
    const forwardedChain = clientIps.map((ip) => ({ by: serverPublicIp, for: ip }));
    headers["Gov-Vendor-Forwarded"] = JSON.stringify(forwardedChain);
  }

  // 7. Vendor licence IDs – from environment variable
  const vendorLicenseIds = process.env.FRAUD_VENDOR_LICENSE_IDS;
  if (vendorLicenseIds) {
    headers["Gov-Vendor-License-IDs"] = vendorLicenseIds;
  } else {
    logger.warn({ message: "FRAUD_VENDOR_LICENSE_IDS environment variable not set" });
  }

  // 8. Vendor product name – from environment variable (must be percent-encoded)
  const vendorProductName = process.env.FRAUD_VENDOR_PRODUCT_NAME;
  if (vendorProductName) {
    headers["Gov-Vendor-Product-Name"] = encodeURIComponent(vendorProductName);
  } else {
    logger.warn({ message: "FRAUD_VENDOR_PRODUCT_NAME environment variable not set" });
  }

  // 9. Vendor version – from environment variable (must be key-value structure)
  const vendorVersion = process.env.FRAUD_VENDOR_VERSION;
  if (vendorVersion) {
    // Format as key-value structure with server version
    headers["Gov-Vendor-Version"] = JSON.stringify({ server: vendorVersion });
  } else {
    logger.warn({ message: "FRAUD_VENDOR_VERSION environment variable not set" });
  }

  // 10. Pass through any client-side headers from the browser
  const clientHeaderNames = [
    "Gov-Client-Browser-JS-User-Agent",
    "Gov-Client-Multi-Factor",
    "Gov-Client-Public-IP-Timestamp",
    "Gov-Client-Public-Port",
    "Gov-Client-Screens",
    "Gov-Client-Timezone",
    "Gov-Client-Window-Size",
    "Gov-Client-Browser-Do-Not-Track",
  ];

  for (const headerName of clientHeaderNames) {
    const value = getHeader(headerName);
    if (value && value !== "undefined" && value !== "null") {
      headers[headerName] = value;
    }
  }

  logger.debug({ message: "Built fraud prevention headers", headers });
  return headers;
}
