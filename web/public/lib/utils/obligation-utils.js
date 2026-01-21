// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/public/lib/utils/obligation-utils.js

/**
 * Obligation formatting utilities for UI display (client-side version)
 * HMRC requirement: Period keys must NOT be shown to users
 * Per Software Developer Checklist Q9
 */

/**
 * Format obligation for display to user
 * HMRC requirement: Period keys should not be visible to users
 * @param {Object} obligation - Raw obligation from HMRC API
 * @returns {Object} Formatted obligation with hidden period key
 */
export function formatObligationForDisplay(obligation) {
  const startDate = new Date(obligation.start);
  const endDate = new Date(obligation.end);
  const dueDate = obligation.due ? new Date(obligation.due) : null;

  const dateOptions = { day: "numeric", month: "short", year: "numeric" };

  return {
    // Internal use only - NOT for display to users
    _periodKey: obligation.periodKey,

    // User-visible fields
    id: obligation.periodKey, // Used as key for selection, but displayed as date range
    displayName: `${startDate.toLocaleDateString("en-GB", dateOptions)} to ${endDate.toLocaleDateString("en-GB", dateOptions)}`,
    startDate: obligation.start,
    endDate: obligation.end,
    dueDate: obligation.due,
    dueDateFormatted: dueDate ? dueDate.toLocaleDateString("en-GB", dateOptions) : null,
    status: obligation.status, // 'O' (open) or 'F' (fulfilled)
    statusDisplay: obligation.status === "O" ? "Open" : "Submitted",
    receivedDate: obligation.received,
  };
}

/**
 * Format list of obligations for UI dropdown/selection
 * Returns array sorted by end date (most recent first)
 * @param {Array} obligations - Raw obligations from HMRC API
 * @returns {Array} Formatted obligations sorted by end date descending
 */
export function formatObligationsForSelection(obligations) {
  if (!Array.isArray(obligations)) {
    return [];
  }
  return obligations.map(formatObligationForDisplay).sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
}

/**
 * Filter obligations to show only open (unfulfilled) periods
 * Use for submitVat.html - only show periods that haven't been submitted yet
 * @param {Array} formattedObligations - Already formatted obligations
 * @returns {Array} Only open obligations
 */
export function filterOpenObligations(formattedObligations) {
  return formattedObligations.filter((o) => o.status === "O");
}

/**
 * Filter obligations to show only fulfilled (submitted) periods
 * Use for viewVatReturn.html - only show periods that have been submitted
 * @param {Array} formattedObligations - Already formatted obligations
 * @returns {Array} Only fulfilled obligations
 */
export function filterFulfilledObligations(formattedObligations) {
  return formattedObligations.filter((o) => o.status === "F");
}

/**
 * Get period key from formatted obligation (for API submission)
 * This extracts the hidden period key when user selects an obligation
 * @param {Object} formattedObligation - Formatted obligation object
 * @returns {string} The period key for HMRC API submission
 */
export function getPeriodKeyFromSelection(formattedObligation) {
  return formattedObligation._periodKey;
}

/**
 * Build dropdown option text with due date if available
 * @param {Object} formattedObligation - Formatted obligation
 * @returns {string} Display text for dropdown option
 */
export function getDropdownOptionText(formattedObligation) {
  if (formattedObligation.dueDateFormatted) {
    return `${formattedObligation.displayName} (Due: ${formattedObligation.dueDateFormatted})`;
  }
  return formattedObligation.displayName;
}

/**
 * Format a date range from start and end dates
 * @param {string} start - Start date in ISO format
 * @param {string} end - End date in ISO format
 * @returns {string} Formatted date range like "1 Jan 2024 to 31 Mar 2024"
 */
export function formatDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const dateOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${startDate.toLocaleDateString("en-GB", dateOptions)} to ${endDate.toLocaleDateString("en-GB", dateOptions)}`;
}
