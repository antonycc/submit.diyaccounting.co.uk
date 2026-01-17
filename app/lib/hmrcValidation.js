// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/hmrcValidation.js

/**
 * Validation utilities for HMRC API input parameters.
 * Provides regex patterns and validation functions for VRN, period keys, dates, etc.
 */

/**
 * Validates VAT Registration Number (VRN).
 * Must be exactly 9 digits.
 * @param {string|number} vrn - The VRN to validate
 * @returns {boolean} True if valid
 */
export function isValidVrn(vrn) {
  return /^\d{9}$/.test(String(vrn));
}

/**
 * Validates HMRC period key format.
 * Accepts:
 * - YYXN format: 2-digit year + letter + number (e.g., 24A1, 25A1, 24B1)
 * - #NNN format: # followed by 3 digits (e.g., #001, #012)
 *
 * @param {string} periodKey - The period key to validate
 * @returns {boolean} True if valid
 */
export function isValidPeriodKey(periodKey) {
  return /^(\d{2}[A-Z]\d|#\d{3})$/.test(String(periodKey).toUpperCase());
}

/**
 * Validates ISO date format (YYYY-MM-DD) and ensures it's a real date.
 * @param {string} date - The date to validate
 * @returns {boolean} True if valid
 */
export function isValidIsoDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  // Parse the date components
  const [year, month, day] = date.split("-").map(Number);

  // Check month is valid
  if (month < 1 || month > 12) {
    return false;
  }

  // Check day is valid for the given month
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    return false;
  }

  // Additional check: ensure it's a valid date
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

/**
 * Validates that fromDate is not after toDate.
 * Both dates must be valid ISO dates.
 * @param {string} fromDate - ISO date string
 * @param {string} toDate - ISO date string
 * @returns {boolean} True if both are valid dates and fromDate <= toDate
 */
export function isValidDateRange(fromDate, toDate) {
  // Validate both dates first
  if (!isValidIsoDate(fromDate) || !isValidIsoDate(toDate)) {
    return false;
  }

  // Compare dates
  return new Date(fromDate) <= new Date(toDate);
}

/**
 * Masks an IP address for GDPR compliance.
 * Replaces the last octet/segment with 'xxx'.
 * Examples:
 * - 192.168.1.100 -> 192.168.1.xxx
 * - 2001:db8::1 -> 2001:db8::xxx
 * - ::1 -> ::xxx
 *
 * @param {string} ip - The IP address to mask
 * @returns {string} Masked IP address
 */
export function maskIpAddress(ip) {
  if (!ip || typeof ip !== "string") {
    return "unknown";
  }

  // IPv4
  if (ip.includes(".") && !ip.includes(":")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  }

  // IPv6 - Handle both expanded and compressed formats
  if (ip.includes(":")) {
    // Handle compressed IPv6 (e.g., ::1, ::ffff:192.0.2.1)
    if (ip.startsWith("::")) {
      return "::xxx";
    }
    if (ip.endsWith("::")) {
      const parts = ip.split(":");
      return `${parts.slice(0, -2).join(":")}::xxx`;
    }

    // For regular IPv6, mask the last segment
    const parts = ip.split(":");
    if (parts.length >= 2) {
      return `${parts.slice(0, -1).join(":")}:xxx`;
    }
  }

  // Fallback for unknown format
  return "xxx.xxx.xxx.xxx";
}

/**
 * Masks a device ID for GDPR compliance.
 * Shows first 8 characters followed by '...'.
 * @param {string} deviceId - The device ID to mask
 * @returns {string} Masked device ID
 */
export function maskDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== "string") {
    return "unknown";
  }

  if (deviceId.length <= 8) {
    return "***";
  }

  return `${deviceId.substring(0, 8)}...`;
}

/**
 * Masks sensitive fraud prevention headers for logging.
 * @param {Object} headers - Headers object
 * @returns {Object} Headers with sensitive values masked
 */
export function maskSensitiveHeaders(headers) {
  if (!headers || typeof headers !== "object") {
    return {};
  }

  const masked = { ...headers };

  // Mask IP addresses
  if (masked["Gov-Client-Public-IP"]) {
    masked["Gov-Client-Public-IP"] = maskIpAddress(masked["Gov-Client-Public-IP"]);
  }
  if (masked["Gov-Vendor-Public-IP"]) {
    masked["Gov-Vendor-Public-IP"] = maskIpAddress(masked["Gov-Vendor-Public-IP"]);
  }

  // Mask device ID
  if (masked["Gov-Client-Device-ID"]) {
    masked["Gov-Client-Device-ID"] = maskDeviceId(masked["Gov-Client-Device-ID"]);
  }

  return masked;
}

/**
 * Maps HMRC error codes to user-friendly messages.
 * @param {string} code - HMRC error code
 * @returns {Object} Object with userMessage and actionAdvice
 */
export function getHmrcErrorMessage(code) {
  const errorMap = {
    INVALID_VRN: {
      userMessage: "The VAT registration number (VRN) is not valid",
      actionAdvice: "Please check the VRN and try again",
    },
    VRN_NOT_FOUND: {
      userMessage: "The VAT registration number (VRN) was not found",
      actionAdvice: "Please verify the VRN is correct and registered with HMRC",
    },
    INVALID_PERIODKEY: {
      userMessage: "The period key is not valid",
      actionAdvice: "Please check the period key format and try again",
    },
    PERIOD_KEY_INVALID: {
      userMessage: "The period key is not valid",
      actionAdvice: "Please check the period key format and try again",
    },
    NOT_FOUND: {
      userMessage: "The requested resource was not found",
      actionAdvice: "Please check the VRN and period key are correct",
    },
    DATE_RANGE_TOO_LARGE: {
      userMessage: "The date range is too large",
      actionAdvice: "Please reduce the date range to less than 365 days",
    },
    INSOLVENT_TRADER: {
      userMessage: "This VAT registration is for an insolvent trader",
      actionAdvice: "VAT returns cannot be submitted for insolvent traders. Please contact HMRC",
    },
    DUPLICATE_SUBMISSION: {
      userMessage: "This VAT return has already been submitted",
      actionAdvice: "You cannot submit the same return twice. If you need to make changes, please contact HMRC",
    },
    INVALID_SUBMISSION: {
      userMessage: "The VAT return submission is not valid",
      actionAdvice: "Please check all values are correct and try again",
    },
    TAX_PERIOD_NOT_ENDED: {
      userMessage: "The tax period has not ended yet",
      actionAdvice: "You can only submit a return after the tax period has ended",
    },
    INVALID_ORIGINATOR_ID: {
      userMessage: "The software vendor ID is not valid",
      actionAdvice: "Please contact the software vendor for support",
    },
    INVALID_CREDENTIALS: {
      userMessage: "The authentication credentials are not valid",
      actionAdvice: "Please sign in again to refresh your credentials",
    },
    CLIENT_OR_AGENT_NOT_AUTHORISED: {
      userMessage: "You are not authorized to access this VAT registration",
      actionAdvice: "Please ensure you have the correct permissions and try again",
    },
    BUSINESS_ERROR: {
      userMessage: "A business rule validation failed",
      actionAdvice: "Please check all values are correct and try again",
    },
    SERVER_ERROR: {
      userMessage: "HMRC service is experiencing technical difficulties",
      actionAdvice: "Please try again later",
    },
    SERVICE_UNAVAILABLE: {
      userMessage: "HMRC service is temporarily unavailable",
      actionAdvice: "Please try again later",
    },
  };

  return (
    errorMap[code] || {
      userMessage: "An unexpected error occurred",
      actionAdvice: "Please try again or contact support if the problem persists",
    }
  );
}

/**
 * Extracts HMRC error code from response body.
 * @param {Object} responseBody - HMRC API response body
 * @returns {string|null} Error code or null if not found
 */
export function extractHmrcErrorCode(responseBody) {
  if (!responseBody) {
    return null;
  }

  // Direct code field
  if (responseBody.code) {
    return responseBody.code;
  }

  // Nested in errors array
  if (Array.isArray(responseBody.errors) && responseBody.errors.length > 0) {
    return responseBody.errors[0].code;
  }

  return null;
}
