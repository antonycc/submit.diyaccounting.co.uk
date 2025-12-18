// app/lib/eventToGovClientHeaders.js
// DEPRECATED: This function is maintained for backward compatibility.
// New code should use buildFraudHeaders.js instead.

import { createLogger } from "./logger.js";
import { buildFraudHeaders } from "./buildFraudHeaders.js";

const logger = createLogger({ source: "app/lib/eventToGovClientHeaders.js" });

/**
 * Build fraud prevention headers from Lambda event.
 * @deprecated Use buildFraudHeaders from buildFraudHeaders.js instead
 * @param {object} event - Lambda proxy event
 * @param {string} detectedIP - Detected client IP (optional, will be derived from x-forwarded-for if not provided)
 * @returns {object} Object with govClientHeaders and govClientErrorMessages
 */
export default function eventToGovClientHeaders(event, detectedIP) {
  const headers = event.headers || {};
  // Case-insensitive header getter
  const h = (name) => headers[name] ?? headers[String(name).toLowerCase()] ?? headers[String(name).toUpperCase()];

  // Treat literal strings like "undefined"/"null" and blanks as missing
  const sanitize = (value) => {
    if (value === undefined || value === null) return undefined;
    const str = String(value).trim();
    if (!str) return undefined;
    const lower = str.toLowerCase();
    if (lower === "undefined" || lower === "null") return undefined;
    return str;
  };

  // Use new buildFraudHeaders for vendor headers
  const fraudHeaders = buildFraudHeaders(event);

  // Attempt to populate from incoming values, then fall back to safe defaults if absent
  const govClientBrowserJSUserAgentHeader = sanitize(h("Gov-Client-Browser-JS-User-Agent")) || sanitize(h("user-agent"));
  const govClientDeviceIDHeader = sanitize(h("Gov-Client-Device-ID"));
  const govClientMultiFactorHeader = sanitize(h("Gov-Client-Multi-Factor")) || "type=OTHER";

  // Handle IP detection - if browser sent "SERVER_DETECT", extract IP from request headers
  let govClientPublicIPHeader = sanitize(h("Gov-Client-Public-IP"));
  
  // Use fraudHeaders for vendor IP, or fall back to detected IP
  const govVendorPublicIPHeader = fraudHeaders["Gov-Vendor-Public-IP"] || detectedIP;

  if (govClientPublicIPHeader === "SERVER_DETECT" || !govClientPublicIPHeader) {
    // Use the IP detected by buildFraudHeaders, or fall back to detectedIP parameter
    govClientPublicIPHeader = fraudHeaders["Gov-Client-Public-IP"] || detectedIP;
    logger.info({
      message: "Server detected client IP from request headers",
      govClientPublicIPHeader,
      detectedIP,
    });
  }

  const govClientPublicIPTimestampHeader = sanitize(h("Gov-Client-Public-IP-Timestamp")) || new Date().toISOString();
  const govClientPublicPortHeader = sanitize(h("Gov-Client-Public-Port")) || "443";
  const govClientScreensHeader =
    sanitize(h("Gov-Client-Screens")) || JSON.stringify({ width: 1280, height: 720, colorDepth: 24, pixelDepth: 24 });
  const govClientTimezoneHeader = sanitize(h("Gov-Client-Timezone")) || "UTC";
  const govClientUserIDsHeader = sanitize(h("Gov-Client-User-IDs")) || fraudHeaders["Gov-Client-User-IDs"] || "server=anonymous";
  const govClientWindowSizeHeader = sanitize(h("Gov-Client-Window-Size")) || JSON.stringify({ width: 1280, height: 720 });
  const govTestScenarioHeader = sanitize(h("Gov-Test-Scenario"));

  // Build full header set, merging client and vendor headers from buildFraudHeaders
  const fullGovClientHeaders = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
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
    // Use dynamic vendor headers from buildFraudHeaders
    "Gov-Vendor-Connection-Method": fraudHeaders["Gov-Vendor-Connection-Method"],
    "Gov-Vendor-Forwarded": fraudHeaders["Gov-Vendor-Forwarded"],
    "Gov-Vendor-License-IDs": fraudHeaders["Gov-Vendor-License-IDs"],
    "Gov-Vendor-Product-Name": fraudHeaders["Gov-Vendor-Product-Name"],
    "Gov-Vendor-Public-IP": govVendorPublicIPHeader,
    "Gov-Vendor-Version": fraudHeaders["Gov-Vendor-Version"],
  };

  // Remove any undefined/blank header values – HMRC prefers omission over sending invalid or placeholder strings
  const govClientHeaders = Object.fromEntries(
    Object.entries(fullGovClientHeaders).filter(([, value]) => {
      const v = sanitize(value);
      return v !== undefined;
    }),
  );

  // Forward Gov-Test-Scenario header from client when present (sandbox only)
  if (govTestScenarioHeader) {
    govClientHeaders["Gov-Test-Scenario"] = govTestScenarioHeader;
  }

  return {
    govClientHeaders,
    govClientErrorMessages: [],
  };
}
