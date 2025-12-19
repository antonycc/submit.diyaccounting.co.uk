// app/lib/validationHelpers.js
/**
 * Validation helper functions for HMRC API inputs.
 * These functions provide consistent validation across all handlers.
 */

/**
 * Period key regex pattern matching HMRC formats.
 * HMRC uses formats like:
 * - "24A1" (2-digit year + letter + digit for quarterly returns)
 * - "#001" (quarterly period markers)
 */
export const PERIOD_KEY_PATTERN = /^(#\d{3}|\d{2}[A-Z]\d)$/i;

/**
 * VAT Registration Number (VRN) pattern - must be exactly 9 digits.
 */
export const VRN_PATTERN = /^\d{9}$/;

/**
 * ISO date format pattern - YYYY-MM-DD.
 */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a period key against HMRC formats.
 *
 * @param {string} periodKey - The period key to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidPeriodKey(periodKey) {
  if (!periodKey || typeof periodKey !== "string") {
    return false;
  }
  return PERIOD_KEY_PATTERN.test(periodKey);
}

/**
 * Validate a VRN (VAT Registration Number).
 *
 * @param {string} vrn - The VRN to validate
 * @returns {boolean} True if valid (9 digits), false otherwise
 */
export function isValidVRN(vrn) {
  if (!vrn) {
    return false;
  }
  return VRN_PATTERN.test(String(vrn));
}

/**
 * Validate a date string in ISO format (YYYY-MM-DD).
 * Checks both format and that the date actually exists.
 *
 * @param {string} dateString - The date string to validate
 * @returns {object} Object with isValid boolean and error message if invalid
 */
export function validateISODate(dateString) {
  if (!dateString || typeof dateString !== "string") {
    return { isValid: false, error: "Date is required" };
  }

  // Check format first
  if (!ISO_DATE_PATTERN.test(dateString)) {
    return { isValid: false, error: "Invalid date format - must be YYYY-MM-DD" };
  }

  // Check if date is actually valid (not like 2024-02-30)
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return { isValid: false, error: "Invalid date - date does not exist" };
  }

  // Verify the date string round-trips correctly
  // This catches cases like "2024-02-30" which JavaScript may parse as "2024-03-02"
  const roundTrip = date.toISOString().split("T")[0];
  if (roundTrip !== dateString) {
    return { isValid: false, error: "Invalid date - date does not exist (e.g., 2024-02-30)" };
  }

  return { isValid: true };
}

/**
 * Validate a date range (from <= to).
 *
 * @param {string} fromDate - The start date (ISO format)
 * @param {string} toDate - The end date (ISO format)
 * @returns {object} Object with isValid boolean and error message if invalid
 */
export function validateDateRange(fromDate, toDate) {
  // First validate individual dates
  const fromValidation = validateISODate(fromDate);
  if (!fromValidation.isValid) {
    return { isValid: false, error: `Invalid from date: ${fromValidation.error}` };
  }

  const toValidation = validateISODate(toDate);
  if (!toValidation.isValid) {
    return { isValid: false, error: `Invalid to date: ${toValidation.error}` };
  }

  // Check from <= to
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (from > to) {
    return { isValid: false, error: "Invalid date range - from date cannot be after to date" };
  }

  return { isValid: true };
}
