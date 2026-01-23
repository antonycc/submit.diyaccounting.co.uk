// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/test-user.js
// HMRC Create Test User endpoint
// Handles: POST /create-test-user/organisations

import { randomUUID } from "crypto";

/**
 * Generate a random VAT registration number (9 digits)
 */
function generateVrn() {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
}

/**
 * Generate a random user ID
 */
function generateUserId() {
  return Math.floor(100000000000 + Math.random() * 900000000000).toString();
}

/**
 * Generate a random password
 */
function generatePassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/**
 * Generate a random group identifier
 */
function generateGroupIdentifier() {
  return Math.floor(100000000000 + Math.random() * 900000000000).toString();
}

/**
 * Generate mock test user data
 */
function generateTestUser(serviceNames) {
  const firstName = "Test";
  const lastName = "User";
  const today = new Date().toISOString().split("T")[0];

  return {
    userId: generateUserId(),
    password: generatePassword(),
    userFullName: `${firstName} ${lastName}`,
    emailAddress: `test.user.${Date.now()}@example.com`,
    organisationDetails: {
      name: "Test Organisation Ltd",
      address: {
        line1: "123 Test Street",
        line2: "Test Town",
        postcode: "TE1 1ST",
      },
    },
    individualDetails: {
      firstName,
      lastName,
      dateOfBirth: "1980-01-01",
      address: {
        line1: "123 Test Street",
        line2: "Test Town",
        postcode: "TE1 1ST",
      },
    },
    vatRegistrationDate: today,
    groupIdentifier: generateGroupIdentifier(),
    vrn: generateVrn(),
  };
}

export function apiEndpoint(app) {
  // POST /create-test-user/organisations - Create mock HMRC test user
  app.post("/create-test-user/organisations", (req, res) => {
    console.log("[http-simulator:test-user] POST /create-test-user/organisations");

    const { serviceNames } = req.body || {};

    // Generate mock test user
    const testUser = generateTestUser(serviceNames);

    console.log(`[http-simulator:test-user] Created test user with VAT registration number: ${testUser.vrn}`);

    res.status(201).json(testUser);
  });
}
