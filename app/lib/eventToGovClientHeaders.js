// app/lib/eventToGovClientHeaders.js

import logger from "./logger.js";

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

  // Attempt to populate from incoming values, then fall back to safe defaults if absent
  const govClientBrowserJSUserAgentHeader = sanitize(h("Gov-Client-Browser-JS-User-Agent")) || sanitize(h("user-agent"));
  const govClientDeviceIDHeader = sanitize(h("Gov-Client-Device-ID"));
  const govClientMultiFactorHeader = sanitize(h("Gov-Client-Multi-Factor")) || "type=OTHER";

  // Handle IP detection - if browser sent "SERVER_DETECT", extract IP from request headers
  let govClientPublicIPHeader = sanitize(h("Gov-Client-Public-IP"));
  const govVendorPublicIPHeader = sanitize(h("Gov-Vendor-Public-IP")) || sanitize(h("x-forwarded-for"))?.split(",")[0]?.trim() || detectedIP;

  if (govClientPublicIPHeader === "SERVER_DETECT" || !govClientPublicIPHeader) {
    logger.info({
      message: "Server detected client IP from request headers but overwrote them with a detected address",
      govClientPublicIPHeader,
      detectedIP,
    });
    govClientPublicIPHeader = detectedIP;
  }

  const govClientPublicIPTimestampHeader = sanitize(h("Gov-Client-Public-IP-Timestamp")) || new Date().toISOString();
  const govClientPublicPortHeader = sanitize(h("Gov-Client-Public-Port")) || (event.headers?.host?.endsWith(":443") ? "443" : "443");
  const govClientScreensHeader = sanitize(h("Gov-Client-Screens")) || JSON.stringify({ width: 1280, height: 720, colorDepth: 24, pixelDepth: 24 });
  const govClientTimezoneHeader = sanitize(h("Gov-Client-Timezone")) || "UTC";
  const govClientUserIDsHeader = sanitize(h("Gov-Client-User-IDs")) || "server=1";
  const govClientWindowSizeHeader = sanitize(h("Gov-Client-Window-Size")) || JSON.stringify({ width: 1280, height: 720 });
  const govTestScenarioHeader = sanitize(h("Gov-Test-Scenario"));

  // Build full header set, then remove any that are blank/undefined to satisfy HMRC fraud-prevention rules.
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
    "Gov-Vendor-Forwarded": "by=203.0.113.6&for=198.51.100.0",
    "Gov-Vendor-License-IDs": "my-licensed-software=8D7963490527D33716835EE7C195516D5E562E03B224E9B359836466EE40CDE1",
    "Gov-Vendor-Product-Name": "DIY Accounting Submit",
    "Gov-Vendor-Public-IP": govVendorPublicIPHeader,
    "Gov-Vendor-Version": "web-submit-diyaccounting-co-uk-0.0.2-4",
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
