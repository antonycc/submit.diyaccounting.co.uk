// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// test-data-generator.js
// Generates test data for VAT forms in sandbox mode

/**
 * Generate a standard test VRN (VAT Registration Number)
 * Always returns the placeholder value used throughout the application
 * @returns {string} 9-digit VRN
 */
function generateTestVrn() {
  return "176540158";
}

/**
 * Generate a random period key in YYXN format
 * Format: 2-digit year + letter + digit (e.g., 24A1, 25B3)
 * @returns {string} Period key in YYXN format
 */
function generateTestPeriodKey() {
  // eslint-disable-next-line sonarjs/pseudo-random
  const year = String(24 + Math.floor(Math.random() * 2)).padStart(2, "0"); // 24 or 25
  // eslint-disable-next-line sonarjs/pseudo-random
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
  // eslint-disable-next-line sonarjs/pseudo-random
  const number = Math.floor(Math.random() * 9) + 1; // 1-9
  return `${year}${letter}${number}`;
}

/**
 * Generate a random VAT amount suitable for testing
 * Returns a decimal number with 2 decimal places
 * @returns {string} VAT amount as string (e.g., "1000.00")
 */
function generateTestVatAmount() {
  // Generate a random amount between 100 and 10000
  // eslint-disable-next-line sonarjs/pseudo-random
  const amount = Math.floor(Math.random() * 9900) + 100;
  // eslint-disable-next-line sonarjs/pseudo-random
  const cents = Math.floor(Math.random() * 100);
  return `${amount}.${String(cents).padStart(2, "0")}`;
}

/**
 * Generate a valid ISO date string for a date within the current calendar year
 * @returns {string} Date in YYYY-MM-DD format
 */
function generateTestDate() {
  const year = new Date().getFullYear();
  // eslint-disable-next-line sonarjs/pseudo-random
  const month = Math.floor(Math.random() * 12) + 1; // 1-12
  // eslint-disable-next-line sonarjs/pseudo-random
  const day = Math.floor(Math.random() * 28) + 1; // 1-28 (safe for all months)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Generate a date range for VAT obligations
 * Returns from date at start of current year, to date at current date
 * @returns {{from: string, to: string}} Object with from and to dates in YYYY-MM-DD format
 */
function generateTestDateRange() {
  const now = new Date();
  const year = now.getFullYear();
  const from = `${year}-01-01`;
  const to = now.toISOString().split("T")[0]; // Current date in YYYY-MM-DD
  return { from, to };
}

/**
 * Populate the VAT submission form with test data
 * Used in submitVat.html
 */
function populateSubmitVatForm() {
  const vrnInput = document.getElementById("vatNumber");
  const periodKeyInput = document.getElementById("periodKey");
  const vatDueInput = document.getElementById("vatDue");

  if (vrnInput) vrnInput.value = generateTestVrn();
  if (periodKeyInput) periodKeyInput.value = generateTestPeriodKey();
  if (vatDueInput) vatDueInput.value = generateTestVatAmount();

  console.log("[Test Data] Populated VAT submission form with test data");
}

/**
 * Populate the view VAT return form with test data
 * Used in viewVatReturn.html
 */
function populateViewVatReturnForm() {
  const vrnInput = document.getElementById("vrn");
  const periodKeyInput = document.getElementById("periodKey");

  if (vrnInput) vrnInput.value = generateTestVrn();
  if (periodKeyInput) periodKeyInput.value = generateTestPeriodKey();

  console.log("[Test Data] Populated view VAT return form with test data");
}

/**
 * Populate the VAT obligations form with test data
 * Used in vatObligations.html
 */
function populateVatObligationsForm() {
  const vrnInput = document.getElementById("vrn");
  const fromDateInput = document.getElementById("fromDate");
  const toDateInput = document.getElementById("toDate");

  const dateRange = generateTestDateRange();

  if (vrnInput) vrnInput.value = generateTestVrn();
  if (fromDateInput) fromDateInput.value = dateRange.from;
  if (toDateInput) toDateInput.value = dateRange.to;

  console.log("[Test Data] Populated VAT obligations form with test data");
}

// Make functions available globally for inline script usage
if (typeof window !== "undefined") {
  window.testDataGenerator = {
    generateTestVrn,
    generateTestPeriodKey,
    generateTestVatAmount,
    generateTestDate,
    generateTestDateRange,
    populateSubmitVatForm,
    populateViewVatReturnForm,
    populateVatObligationsForm,
  };
}
