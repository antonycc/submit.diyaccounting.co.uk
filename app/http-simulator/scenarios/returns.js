// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/returns.js
// Gov-Test-Scenario handlers for VAT return endpoints

/**
 * Map of Gov-Test-Scenario values to error responses
 */
const scenarios = {
  INVALID_VRN: {
    status: 400,
    body: {
      code: "VRN_INVALID",
      message: "The provided VRN is invalid",
    },
  },
  VRN_INVALID: {
    status: 400,
    body: {
      code: "VRN_INVALID",
      message: "The provided VRN is invalid",
    },
  },
  INVALID_PERIODKEY: {
    status: 400,
    body: {
      code: "PERIOD_KEY_INVALID",
      message: "The provided period key is invalid",
    },
  },
  DUPLICATE_SUBMISSION: {
    status: 403,
    body: {
      code: "DUPLICATE_SUBMISSION",
      message: "The VAT return was already submitted for the given period.",
    },
  },
  NOT_FOUND: {
    status: 404,
    body: {
      code: "NOT_FOUND",
      message: "The requested resource could not be found",
    },
  },
  TAX_PERIOD_NOT_ENDED: {
    status: 403,
    body: {
      code: "TAX_PERIOD_NOT_ENDED",
      message: "A VAT return cannot be submitted for a tax period that has not ended.",
    },
  },
  INVALID_ARN: {
    status: 400,
    body: {
      code: "INVALID_ARN",
      message: "Invalid ARN.",
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
 * Get scenario response if Gov-Test-Scenario header matches
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @param {string} method - HTTP method (GET, POST)
 * @param {string} vrn - VRN
 * @param {string} periodKey - Period key
 * @returns {Object|null} - Scenario response or null
 */
export function getScenarioResponse(scenario, method, vrn, periodKey) {
  if (!scenario) {
    return null;
  }

  const scenarioUpper = scenario.toUpperCase();
  const scenarioConfig = scenarios[scenarioUpper];

  if (scenarioConfig) {
    console.log(`[http-simulator:scenarios] Applying Gov-Test-Scenario: ${scenario}`);
    return scenarioConfig;
  }

  return null;
}
