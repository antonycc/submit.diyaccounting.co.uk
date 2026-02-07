// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/fraud-headers.js
// HMRC Fraud Prevention Headers Validation endpoint
// Handles: GET /test/fraud-prevention-headers/validate

import { randomUUID } from "crypto";

/**
 * Required fraud prevention headers for WEB_APP_VIA_SERVER connection method
 * Note: Network-dependent headers (public IPs) are NOT validated in simulator mode
 * because they require real network context (e.g., ngrok) to be populated properly.
 */
const requiredHeaders = [
  "gov-client-connection-method",
  "gov-client-device-id",
  "gov-client-user-ids",
  "gov-client-timezone",
  "gov-client-screens",
  "gov-client-window-size",
  "gov-client-browser-js-user-agent",
  "gov-vendor-version",
  "gov-vendor-product-name",
];

/**
 * Optional headers that generate warnings if missing
 * Note: Network-dependent headers are completely skipped in simulator validation
 */
const optionalHeaders = ["gov-client-multi-factor", "gov-vendor-license-ids"];

/**
 * Network-dependent headers that are completely skipped in simulator validation
 * These require real network context (ngrok, public IPs) and cannot be tested locally
 */
const skippedNetworkHeaders = ["gov-vendor-public-ip", "gov-vendor-forwarded", "gov-client-public-ip", "gov-client-public-ip-timestamp", "gov-client-public-port"];

/**
 * Validate fraud prevention headers
 * @param {Object} headers - Request headers
 * @returns {Object} - Validation result
 */
function validateFraudHeaders(headers) {
  const errors = [];
  const warnings = [];
  const normalizedHeaders = {};

  // Normalize header names to lowercase
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  // Check required headers
  for (const header of requiredHeaders) {
    if (!normalizedHeaders[header]) {
      errors.push({
        code: "HEADER_MISSING",
        message: `Header missing: ${header}`,
        headers: [header],
      });
    }
  }

  // Check optional headers (generate warnings)
  for (const header of optionalHeaders) {
    if (!normalizedHeaders[header]) {
      warnings.push({
        code: "HEADER_MISSING",
        message: "Header required",
        headers: [header],
      });
    }
  }

  // Determine overall code
  let code;
  if (errors.length === 0 && warnings.length === 0) {
    code = "VALID";
  } else if (errors.length === 0) {
    code = "VALID_WITH_WARNINGS";
  } else {
    code = "INVALID";
  }

  return {
    specVersion: "3.3",
    code,
    message: errors.length > 0 ? "At least 1 header is invalid" : warnings.length > 0 ? "Headers valid with warnings" : "All headers valid",
    errors,
    warnings,
  };
}

export function apiEndpoint(app) {
  // GET /test/fraud-prevention-headers/validate
  app.get("/test/fraud-prevention-headers/validate", (req, res) => {
    console.log("[http-simulator:fraud-headers] GET /test/fraud-prevention-headers/validate");

    const result = validateFraudHeaders(req.headers);

    // Set HMRC-like response headers
    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());

    res.json(result);
  });
}
