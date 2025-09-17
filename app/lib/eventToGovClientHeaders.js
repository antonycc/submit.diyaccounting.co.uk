// app/lib/eventToGovClientHeaders.js

import logger from "./logger.js";

/**
 * Extracts and validates Gov-Client and Gov-Vendor headers from request event
 * Implements HMRC fraud prevention guidance requirements
 */
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

  // Validation of required headers per HMRC guidance
  const govClientErrorMessages = [];
  
  // Generate dynamic Gov-Vendor headers from environment
  const govVendorForwarded = process.env.DIY_SUBMIT_GOV_VENDOR_FORWARDED || 
    `by=${process.env.DIY_SUBMIT_SERVER_IP || '203.0.113.6'}&for=${detectedIP || '198.51.100.0'}`;
  
  const govVendorLicenseIDs = process.env.DIY_SUBMIT_GOV_VENDOR_LICENSE_IDS || 
    `${process.env.DIY_SUBMIT_SOFTWARE_NAME || 'my-licensed-software'}=${process.env.DIY_SUBMIT_SOFTWARE_LICENSE_HASH || '8D7963490527D33716835EE7C195516D5E562E03B224E9B359836466EE40CDE1'}`;
  
  const govVendorProductName = process.env.DIY_SUBMIT_GOV_VENDOR_PRODUCT_NAME || 
    "DIY Accounting Submit";
  
  const govVendorVersion = process.env.DIY_SUBMIT_GOV_VENDOR_VERSION || 
    process.env.npm_package_name + "-" + process.env.npm_package_version ||
    "web-submit-diyaccounting-co-uk-0.0.2-4";

  // Enhanced validation based on HMRC fraud prevention guidance
  if (process.env.DIY_SUBMIT_VALIDATE_GOV_HEADERS === "true") {
    // Validate required client headers
    if (!govClientPublicIPHeader || govClientPublicIPHeader === "unknown") {
      govClientErrorMessages.push("Gov-Client-Public-IP is required and must be a valid IP address");
    }
    
    if (!govClientPublicIPTimestampHeader) {
      govClientErrorMessages.push("Gov-Client-Public-IP-Timestamp is required");
    }
    
    if (!govClientBrowserJSUserAgentHeader) {
      govClientErrorMessages.push("Gov-Client-Browser-JS-User-Agent is required for web applications");
    }
    
    if (!govClientScreensHeader) {
      govClientErrorMessages.push("Gov-Client-Screens is required");
    }
    
    if (!govClientWindowSizeHeader) {
      govClientErrorMessages.push("Gov-Client-Window-Size is required");
    }
    
    if (!govClientTimezoneHeader) {
      govClientErrorMessages.push("Gov-Client-Timezone is required");
    }
  }

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
      "Gov-Vendor-Forwarded": govVendorForwarded,
      "Gov-Vendor-License-IDs": govVendorLicenseIDs,
      "Gov-Vendor-Product-Name": govVendorProductName,
      "Gov-Vendor-Public-IP": govVendorPublicIPHeader,
      "Gov-Vendor-Version": govVendorVersion,
    },
    govClientErrorMessages,
  };
}
