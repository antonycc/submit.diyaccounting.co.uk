// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/obligationFormatter.js

/**
 * Obligation formatting utilities for UI display
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
 * @param {Array} formattedObligations - Already formatted obligations
 * @returns {Array} Only open obligations
 */
export function filterOpenObligations(formattedObligations) {
  return formattedObligations.filter((o) => o.status === "O");
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
