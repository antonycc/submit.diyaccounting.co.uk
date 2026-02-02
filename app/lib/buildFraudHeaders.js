// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/buildFraudHeaders.js

import { createLogger } from "./logger.js";
import { readFileSync } from "fs";

const { name: rawPackageName, version: packageVersion } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url)));
// Strip npm scope prefix (e.g., @org/package -> package) for cleaner HMRC product name
const packageName = rawPackageName.startsWith("@") ? rawPackageName.split("/")[1] : rawPackageName;

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
    if (!eventHeaders || !name) return null;
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(eventHeaders)) {
      if (key.toLowerCase() === lowerName) {
        return value;
      }
    }
    return null;
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

  // 5. Vendor public IP – use detected client IP or SERVER_PUBLIC_IP from environment
  const serverPublicIp = process.env.SERVER_PUBLIC_IP || publicClientIp;
  if (serverPublicIp) {
    headers["Gov-Vendor-Public-IP"] = serverPublicIp;
  }

  // 6. Vendor forwarded chain – build from X-Forwarded-For
  // Format: Array of objects with 'by' and 'for' keys
  if (serverPublicIp && clientIps.length > 0) {
    headers["Gov-Vendor-Forwarded"] = clientIps
      .map((ip) => `by=${encodeURIComponent(serverPublicIp)}&for=${encodeURIComponent(ip)}`)
      .join(",");
  }

  // 7. Gov-Vendor-License-IDs is intentionally NOT supplied because:
  // - The software is open-source (no commercial license)
  // - There is no per-device or per-user license key
  // - The application runs in a browser with no installable licensed component
  // This is declared in intentionallyNotSuppliedHeaders in dynamodb-assertions.js

  // 8. Vendor product name – from environment variable (must be percent-encoded)
  headers["Gov-Vendor-Product-Name"] = encodeURIComponent(packageName);

  // 9. Vendor version – from environment variable (must be key-value structure)
  headers["Gov-Vendor-Version"] = `${encodeURIComponent(packageName)}=${encodeURIComponent(packageVersion)}`;

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
    "Gov-Test-Scenario",
  ];

  for (const headerName of clientHeaderNames) {
    const value = getHeader(headerName);
    if (value && value !== "undefined" && value !== "null") {
      headers[headerName] = value;
    }
  }

  logger.debug({ message: "Built fraud prevention headers", headers });
  return { govClientHeaders: headers, govClientErrorMessages: [] };
}
