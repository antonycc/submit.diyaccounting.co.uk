// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/obligations.js
// Gov-Test-Scenario handlers for VAT obligations endpoint

/**
 * Default obligations array (from captured test data)
 */
const defaultObligations = [
  {
    periodKey: "18A1",
    start: "2017-01-01",
    end: "2017-03-31",
    due: "2017-05-07",
    status: "F",
    received: "2017-05-06",
  },
  {
    periodKey: "18A2",
    start: "2017-04-01",
    end: "2017-06-30",
    due: "2017-08-07",
    status: "O",
  },
];

/**
 * Scenario-specific obligation sets
 */
const scenarioObligations = {
  // Quarterly obligations with none fulfilled
  QUARTERLY_NONE_MET: [
    { periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "O" },
    { periodKey: "18A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "O" },
    { periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", due: "2017-11-07", status: "O" },
    { periodKey: "18A4", start: "2017-10-01", end: "2017-12-31", due: "2018-02-07", status: "O" },
  ],

  // Quarterly obligations with one fulfilled
  QUARTERLY_ONE_MET: [
    { periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-06" },
    { periodKey: "18A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "O" },
    { periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", due: "2017-11-07", status: "O" },
    { periodKey: "18A4", start: "2017-10-01", end: "2017-12-31", due: "2018-02-07", status: "O" },
  ],

  // Quarterly obligations with two fulfilled
  QUARTERLY_TWO_MET: [
    { periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-06" },
    { periodKey: "18A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "F", received: "2017-08-05" },
    { periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", due: "2017-11-07", status: "O" },
    { periodKey: "18A4", start: "2017-10-01", end: "2017-12-31", due: "2018-02-07", status: "O" },
  ],

  // Quarterly obligations with three fulfilled
  QUARTERLY_THREE_MET: [
    { periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-06" },
    { periodKey: "18A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "F", received: "2017-08-05" },
    { periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", due: "2017-11-07", status: "F", received: "2017-11-05" },
    { periodKey: "18A4", start: "2017-10-01", end: "2017-12-31", due: "2018-02-07", status: "O" },
  ],

  // Quarterly obligations with all fulfilled
  QUARTERLY_FOUR_MET: [
    { periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-06" },
    { periodKey: "18A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "F", received: "2017-08-05" },
    { periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", due: "2017-11-07", status: "F", received: "2017-11-05" },
    { periodKey: "18A4", start: "2017-10-01", end: "2017-12-31", due: "2018-02-07", status: "F", received: "2018-02-05" },
  ],

  // Monthly obligations
  MONTHLY_ONE_MET: [
    { periodKey: "18AA", start: "2017-01-01", end: "2017-01-31", due: "2017-03-07", status: "F", received: "2017-03-05" },
    { periodKey: "18AB", start: "2017-02-01", end: "2017-02-28", due: "2017-04-07", status: "O" },
    { periodKey: "18AC", start: "2017-03-01", end: "2017-03-31", due: "2017-05-07", status: "O" },
  ],

  MONTHLY_TWO_MET: [
    { periodKey: "18AA", start: "2017-01-01", end: "2017-01-31", due: "2017-03-07", status: "F", received: "2017-03-05" },
    { periodKey: "18AB", start: "2017-02-01", end: "2017-02-28", due: "2017-04-07", status: "F", received: "2017-04-05" },
    { periodKey: "18AC", start: "2017-03-01", end: "2017-03-31", due: "2017-05-07", status: "O" },
  ],

  MONTHLY_THREE_MET: [
    { periodKey: "18AA", start: "2017-01-01", end: "2017-01-31", due: "2017-03-07", status: "F", received: "2017-03-05" },
    { periodKey: "18AB", start: "2017-02-01", end: "2017-02-28", due: "2017-04-07", status: "F", received: "2017-04-05" },
    { periodKey: "18AC", start: "2017-03-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-05" },
  ],
};

/**
 * Error scenarios
 */
const errorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: {
      code: "NOT_FOUND",
      message: "The requested resource could not be found",
    },
  },
  INSOLVENT_TRADER: {
    status: 403,
    body: {
      code: "INSOLVENT_TRADER",
      message: "The trader is insolvent",
    },
  },
  VRN_INVALID: {
    status: 400,
    body: {
      code: "VRN_INVALID",
      message: "The provided VRN is invalid",
    },
  },
  INVALID_DATE_FROM: {
    status: 400,
    body: {
      code: "INVALID_DATE_FROM",
      message: "Invalid date from",
    },
  },
  INVALID_DATE_TO: {
    status: 400,
    body: {
      code: "INVALID_DATE_TO",
      message: "Invalid date to",
    },
  },
  DATE_RANGE_TOO_LARGE: {
    status: 400,
    body: {
      code: "DATE_RANGE_TOO_LARGE",
      message: "The date range is too large",
    },
  },
};

/**
 * Get obligations based on Gov-Test-Scenario header
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {Object} - {obligations: [...]} or {status: number, body: {...}} for errors
 */
export function getObligationsForScenario(scenario) {
  if (!scenario) {
    return { obligations: defaultObligations };
  }

  const scenarioUpper = scenario.toUpperCase();

  // Check for error scenarios
  if (errorScenarios[scenarioUpper]) {
    console.log(`[http-simulator:scenarios] Applying error scenario: ${scenario}`);
    return errorScenarios[scenarioUpper];
  }

  // Check for obligation-specific scenarios
  if (scenarioObligations[scenarioUpper]) {
    console.log(`[http-simulator:scenarios] Applying obligation scenario: ${scenario}`);
    return { obligations: scenarioObligations[scenarioUpper] };
  }

  // Default
  return { obligations: defaultObligations };
}
