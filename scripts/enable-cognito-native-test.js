#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Enable Cognito native auth and create a test user for local behaviour testing
//
// Usage: node scripts/enable-cognito-native-test.js [environment-name]
// Example: node scripts/enable-cognito-native-test.js ci
//
// Prerequisites: AWS credentials must be assumed first:
//   . ./scripts/aws-assume-submit-deployment-role.sh
//
// This script:
//   1. Enables COGNITO on the Hosted UI (toggle-cognito-native-auth.js enable)
//   2. Creates a test user (create-cognito-test-user.js)
//   3. Saves credentials to target/cognito-native-test-credentials.json
//   4. Prints export commands for running behaviour tests

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);
const environmentName = process.argv[2] || "ci";
const credentialsFile = path.resolve("target", "cognito-native-test-credentials.json");

async function main() {
  // Check AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    console.error("ERROR: No AWS credentials found.");
    console.error("Run: . ./scripts/aws-assume-submit-deployment-role.sh");
    process.exit(1);
  }

  // Check for existing credentials file
  if (fs.existsSync(credentialsFile)) {
    console.log(`Credentials file already exists: ${credentialsFile}`);
    console.log("Run 'npm run test:disableCognitoNative' first to clean up.");
    process.exit(1);
  }

  // Ensure target directory exists
  fs.mkdirSync(path.dirname(credentialsFile), { recursive: true });

  // Step 1: Enable native auth
  console.log(`=== Enabling Cognito native auth for ${environmentName} ===`);
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      ["scripts/toggle-cognito-native-auth.js", "enable", environmentName]
    );
    if (stdout) console.log(stdout.trimEnd());
    if (stderr) console.error(stderr.trimEnd());
  } catch (error) {
    console.error(`Failed to enable native auth: ${error.message}`);
    if (error.stdout) console.log(error.stdout.trimEnd());
    if (error.stderr) console.error(error.stderr.trimEnd());
    process.exit(1);
  }

  // Step 2: Create test user
  console.log("");
  console.log(`=== Creating test user for ${environmentName} ===`);
  let username = null;
  let password = null;
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      ["scripts/create-cognito-test-user.js", environmentName]
    );
    if (stdout) console.log(stdout.trimEnd());
    if (stderr) console.error(stderr.trimEnd());

    // Parse credentials from stdout (format: TEST_AUTH_USERNAME=... and TEST_AUTH_PASSWORD=...)
    for (const line of stdout.split("\n")) {
      const usernameMatch = line.match(/^TEST_AUTH_USERNAME=(.+)$/);
      if (usernameMatch) username = usernameMatch[1];
      const passwordMatch = line.match(/^TEST_AUTH_PASSWORD=(.+)$/);
      if (passwordMatch) password = passwordMatch[1];
    }
  } catch (error) {
    console.error(`Failed to create test user: ${error.message}`);
    if (error.stdout) console.log(error.stdout.trimEnd());
    if (error.stderr) console.error(error.stderr.trimEnd());
    process.exit(1);
  }

  if (!username || !password) {
    console.error("ERROR: Could not parse credentials from create-cognito-test-user.js output");
    process.exit(1);
  }

  // Step 3: Save credentials
  const credentials = {
    environment: environmentName,
    username,
    password,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2) + "\n");
  console.log("");
  console.log(`Credentials saved to: ${credentialsFile}`);

  // Step 4: Print usage instructions
  console.log("");
  console.log("=== Ready for local testing ===");
  console.log("");
  console.log("Run the auth behaviour test:");
  console.log("");
  console.log(`  TEST_AUTH_USERNAME='${username}' TEST_AUTH_PASSWORD='${password}' npm run test:authBehaviour-${environmentName}`);
  console.log("");
  console.log("When done, clean up:");
  console.log("");
  console.log("  npm run test:disableCognitoNative");
  console.log("");
}

main();
