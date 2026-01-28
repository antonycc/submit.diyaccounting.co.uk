#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Disable Cognito native auth and delete the test user created by enable-cognito-native-test.js
//
// Usage: node scripts/disable-cognito-native-test.js [environment-name]
// Example: node scripts/disable-cognito-native-test.js ci
//
// Prerequisites: AWS credentials must be assumed first:
//   . ./scripts/aws-assume-submit-deployment-role.sh

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

  // Read credentials file
  if (!fs.existsSync(credentialsFile)) {
    console.log(`No credentials file found at: ${credentialsFile}`);
    console.log("Nothing to clean up. Run 'npm run test:enableCognitoNative' first.");
    process.exit(0);
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsFile, "utf-8"));
  console.log(`=== Cleaning up Cognito native auth for ${credentials.environment} ===`);
  console.log(`Test user: ${credentials.username}`);
  console.log(`Created: ${credentials.createdAt}`);
  console.log("");

  // Step 1: Delete test user
  console.log(`=== Deleting test user ===`);
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      ["scripts/delete-cognito-test-user.js", credentials.environment, credentials.username]
    );
    if (stdout) console.log(stdout.trimEnd());
    if (stderr) console.error(stderr.trimEnd());
  } catch (error) {
    console.error(`Failed to delete test user: ${error.message}`);
    if (error.stdout) console.log(error.stdout.trimEnd());
    if (error.stderr) console.error(error.stderr.trimEnd());
    // Continue to disable native auth even if user deletion fails
  }

  // Step 2: Disable native auth
  console.log("");
  console.log(`=== Disabling Cognito native auth ===`);
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      ["scripts/toggle-cognito-native-auth.js", "disable", credentials.environment]
    );
    if (stdout) console.log(stdout.trimEnd());
    if (stderr) console.error(stderr.trimEnd());
  } catch (error) {
    console.error(`Failed to disable native auth: ${error.message}`);
    if (error.stdout) console.log(error.stdout.trimEnd());
    if (error.stderr) console.error(error.stderr.trimEnd());
  }

  // Step 3: Remove credentials file
  fs.unlinkSync(credentialsFile);
  console.log("");
  console.log(`Removed credentials file: ${credentialsFile}`);
  console.log("");
  console.log("=== Cleanup complete ===");
}

main();
