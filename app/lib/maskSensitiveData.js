// app/lib/maskSensitiveData.js
/**
 * Utility functions for masking sensitive data in logs to comply with GDPR.
 *
 * These functions ensure that personally identifiable information (PII) such as
 * IP addresses and device IDs are not logged in plain text.
 */

/**
 * Mask an IPv4 address by showing only the first two octets.
 * Example: "192.168.1.100" → "192.168.xxx.xxx"
 *
 * @param {string} ip - The IP address to mask
 * @returns {string} The masked IP address, or the original if not a valid IPv4
 */
export function maskIPAddress(ip) {
  if (!ip || typeof ip !== "string") {
    return ip;
  }

  // Check if it looks like an IPv4 address
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4Pattern);

  if (match) {
    // Show first two octets, mask the rest
    return `${match[1]}.${match[2]}.xxx.xxx`;
  }

  // For IPv6 or other formats, show first segment and mask the rest
  if (ip.includes(":")) {
    const segments = ip.split(":");
    if (segments.length > 0) {
      return `${segments[0]}:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx`;
    }
  }

  // If unrecognized format, mask most of it
  if (ip.length > 8) {
    return ip.substring(0, 4) + "xxx..." + ip.substring(ip.length - 2);
  }

  return ip;
}

/**
 * Mask a device ID by showing only the first and last 3 characters.
 * Example: "abc123xyz789" → "abc***789"
 *
 * @param {string} deviceId - The device ID to mask
 * @returns {string} The masked device ID, or the original if too short
 */
export function maskDeviceID(deviceId) {
  if (!deviceId || typeof deviceId !== "string") {
    return deviceId;
  }

  // If device ID is short, don't mask it (likely not sensitive)
  if (deviceId.length <= 8) {
    return deviceId;
  }

  // Show first 3 and last 3 characters, mask the middle
  const prefix = deviceId.substring(0, 3);
  const suffix = deviceId.substring(deviceId.length - 3);
  return `${prefix}***${suffix}`;
}

/**
 * Mask Gov-Client headers that may contain sensitive information.
 * This function masks specific headers while preserving their structure.
 *
 * @param {object} headers - The headers object to mask
 * @returns {object} A new object with masked sensitive headers
 */
export function maskGovClientHeaders(headers) {
  if (!headers || typeof headers !== "object") {
    return headers;
  }

  const masked = { ...headers };

  // Mask IP-related headers
  if (masked["Gov-Client-Public-IP"]) {
    masked["Gov-Client-Public-IP"] = maskIPAddress(masked["Gov-Client-Public-IP"]);
  }
  if (masked["Gov-Vendor-Public-IP"]) {
    masked["Gov-Vendor-Public-IP"] = maskIPAddress(masked["Gov-Vendor-Public-IP"]);
  }

  // Mask device ID
  if (masked["Gov-Client-Device-ID"]) {
    masked["Gov-Client-Device-ID"] = maskDeviceID(masked["Gov-Client-Device-ID"]);
  }

  // Mask user IDs if they contain emails or other PII
  if (masked["Gov-Client-User-IDs"]) {
    const userIds = masked["Gov-Client-User-IDs"];
    if (typeof userIds === "string" && userIds.includes("@")) {
      // Mask email addresses in user IDs
      // Use a safer regex without backtracking issues
      // eslint-disable-next-line sonarjs/slow-regex
      masked["Gov-Client-User-IDs"] = userIds.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => {
        const atIndex = match.indexOf("@");
        const localPart = match.substring(0, atIndex);
        const domain = match.substring(atIndex);
        const maskedLocal = localPart.length > 2 ? localPart.substring(0, 2) + "***" : localPart;
        return maskedLocal + domain;
      });
    }
  }

  return masked;
}

/**
 * Mask sensitive data in a log context object.
 * This is a general-purpose function that can be used to mask various types of sensitive data.
 *
 * @param {object} logContext - The log context object
 * @returns {object} A new object with masked sensitive data
 */
export function maskLogContext(logContext) {
  if (!logContext || typeof logContext !== "object") {
    return logContext;
  }

  const masked = { ...logContext };

  // Mask common sensitive fields
  let ipField = null;
  if (masked.clientIP) {
    ipField = "clientIP";
  } else if (masked.client_ip) {
    ipField = "client_ip";
  } else if (masked.ip) {
    ipField = "ip";
  }

  if (ipField) {
    masked[ipField] = maskIPAddress(masked[ipField]);
  }

  let deviceField = null;
  if (masked.deviceId) {
    deviceField = "deviceId";
  } else if (masked.device_id) {
    deviceField = "device_id";
  } else if (masked.deviceID) {
    deviceField = "deviceID";
  }

  if (deviceField) {
    masked[deviceField] = maskDeviceID(masked[deviceField]);
  }

  // Mask headers if present
  if (masked.headers && typeof masked.headers === "object") {
    masked.headers = maskGovClientHeaders(masked.headers);
  }

  if (masked.govClientHeaders && typeof masked.govClientHeaders === "object") {
    masked.govClientHeaders = maskGovClientHeaders(masked.govClientHeaders);
  }

  return masked;
}
