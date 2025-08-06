// app/lib/eventToGovClientHeaders.js

import logger from "./logger.js";

export default function eventToGovClientHeaders(event, detectedIP) {
  const govClientBrowserJSUserAgentHeader = (event.headers || {})["Gov-Client-Browser-JS-User-Agent"];
  const govClientDeviceIDHeader = (event.headers || {})["Gov-Client-Device-ID"];
  const govClientMultiFactorHeader = (event.headers || {})["Gov-Client-Multi-Factor"];

  // Handle IP detection - if browser sent "SERVER_DETECT", extract IP from request headers
  let govClientPublicIPHeader = (event.headers || {})["Gov-Client-Public-IP"];
  const govVendorPublicIPHeader = (event.headers || {})["Gov-Vendor-Public-IP"];

  if (govClientPublicIPHeader === "SERVER_DETECT" || !govClientPublicIPHeader) {
    logger.info({
      message: "Server detected client IP from request headers but overwrote them with a detected address",
      govClientPublicIPHeader,
      detectedIP,
    });
    govClientPublicIPHeader = detectedIP;
  }

  const govClientPublicIPTimestampHeader = (event.headers || {})["Gov-Client-Public-IP-Timestamp"];
  const govClientPublicPortHeader = (event.headers || {})["Gov-Client-Public-Port"];
  const govClientScreensHeader = (event.headers || {})["Gov-Client-Screens"];
  const govClientTimezoneHeader = (event.headers || {})["Gov-Client-Timezone"];
  const govClientUserIDsHeader = (event.headers || {})["Gov-Client-User-IDs"];
  const govClientWindowSizeHeader = (event.headers || {})["Gov-Client-Window-Size"];

  // TODO: Also gather system defined values here and validate, failing the request if they are not present.

  return {
    govClientHeaders: {
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
    },
    govClientErrorMessages: [],
  };
}
