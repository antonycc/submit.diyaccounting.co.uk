#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Create a Cognito test user for behavior tests, with TOTP MFA enrollment
//
// Usage: node scripts/create-cognito-test-user.js <environment-name>
// Example: node scripts/create-cognito-test-user.js ci
//
// This script creates a test user in the Cognito user pool for the specified environment,
// enrolls a TOTP device, and sets TOTP as the preferred MFA method.
// It outputs the credentials as environment variables that can be used by behavior tests.

import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  AdminSetUserMFAPreferenceCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import crypto from "crypto";
import fs from "fs";

const environmentName = process.argv[2] || "ci";

async function main() {
  console.log("=== Creating Cognito Test User ===");
  console.log(`Environment: ${environmentName}`);
  console.log(`AWS Region: ${process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "not set"}`);
  console.log("");

  // Get the Cognito User Pool ID and Client ID from CloudFormation stack outputs
  const stackName = `${environmentName}-env-IdentityStack`;
  console.log(`Looking up stack: ${stackName}`);

  const cfnClient = new CloudFormationClient({});
  let userPoolId;
  let userPoolClientId;

  try {
    const response = await cfnClient.send(new DescribeStacksCommand({ StackName: stackName }));

    const stack = response.Stacks?.[0];
    if (!stack) {
      throw new Error(`Stack ${stackName} not found`);
    }

    const userPoolIdOutput = stack.Outputs?.find((o) => o.OutputKey === "UserPoolId");
    if (!userPoolIdOutput?.OutputValue) {
      throw new Error(`UserPoolId output not found in stack ${stackName}`);
    }
    userPoolId = userPoolIdOutput.OutputValue;

    const clientIdOutput = stack.Outputs?.find((o) => o.OutputKey === "UserPoolClientId");
    if (!clientIdOutput?.OutputValue) {
      throw new Error(`UserPoolClientId output not found in stack ${stackName}`);
    }
    userPoolClientId = clientIdOutput.OutputValue;

    console.log(`User Pool ID: ${userPoolId}`);
    console.log(`Client ID: ${userPoolClientId}`);
  } catch (error) {
    console.error(`ERROR: Could not find Cognito User Pool ID for environment: ${environmentName}`);
    console.error(`Looking for stack: ${stackName}, output: UserPoolId`);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  // Generate unique test user credentials
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(4).toString("hex");
  const testEmail = `test-${timestamp}-${randomHex}@test.diyaccounting.co.uk`;
  const testPassword = `Test${crypto.randomBytes(8).toString("hex")}Aa1#`;

  console.log(`Creating test user: ${testEmail}`);

  const cognitoClient = new CognitoIdentityProviderClient({});

  try {
    // Create the user using AdminCreateUser
    await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: testEmail,
        UserAttributes: [
          { Name: "email", Value: testEmail },
          { Name: "email_verified", Value: "true" },
        ],
        MessageAction: "SUPPRESS",
      }),
    );

    console.log("Setting permanent password...");

    // Set permanent password (skip forced password change)
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: testEmail,
        Password: testPassword,
        Permanent: true,
      }),
    );

    // Enroll TOTP MFA device
    console.log("Enrolling TOTP MFA device...");

    // Step 1: Authenticate the user to get an access token
    // Uses InitiateAuth (not AdminInitiateAuth) because the User Pool Client has
    // ALLOW_USER_PASSWORD_AUTH enabled but not ALLOW_ADMIN_USER_PASSWORD_AUTH.
    // MFA is OPTIONAL and user hasn't enrolled yet, so this returns tokens directly.
    const authResponse = await cognitoClient.send(
      new InitiateAuthCommand({
        ClientId: userPoolClientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: testEmail,
          PASSWORD: testPassword,
        },
      }),
    );

    if (!authResponse.AuthenticationResult?.AccessToken) {
      // If we get a challenge instead of tokens, MFA may already be required
      throw new Error(
        `Expected tokens but got challenge: ${authResponse.ChallengeName || "unknown"}. ` +
          `MFA enrollment requires an access token from a non-MFA login.`,
      );
    }

    const accessToken = authResponse.AuthenticationResult.AccessToken;
    console.log("Authenticated user for TOTP enrollment");

    // Step 2: Associate a software token (get the TOTP shared secret)
    const associateResponse = await cognitoClient.send(
      new AssociateSoftwareTokenCommand({
        AccessToken: accessToken,
      }),
    );

    const totpSecret = associateResponse.SecretCode;
    console.log(`TOTP secret received (${totpSecret.length} chars)`);

    // Step 3: Generate a valid TOTP code from the secret
    const { TOTP, Secret } = await import("otpauth");
    const totp = new TOTP({
      secret: Secret.fromBase32(totpSecret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    const totpCode = totp.generate();
    console.log("Generated TOTP verification code");

    // Step 4: Verify the software token
    const verifyResponse = await cognitoClient.send(
      new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: totpCode,
        FriendlyDeviceName: "test-device",
      }),
    );

    if (verifyResponse.Status !== "SUCCESS") {
      throw new Error(`TOTP verification failed: ${verifyResponse.Status}`);
    }
    console.log("TOTP device verified successfully");

    // Step 5: Set TOTP as the preferred MFA method
    await cognitoClient.send(
      new AdminSetUserMFAPreferenceCommand({
        UserPoolId: userPoolId,
        Username: testEmail,
        SoftwareTokenMfaSettings: {
          Enabled: true,
          PreferredMfa: true,
        },
      }),
    );
    console.log("TOTP set as preferred MFA method");

    // Wait for the next TOTP period so the behaviour test doesn't reuse the same code.
    // Cognito rejects a TOTP code that was already consumed (by VerifySoftwareToken above)
    // within the same 30-second window ("Your software token has already been used once").
    const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    console.log(`Waiting ${secondsRemaining}s for next TOTP period...`);
    await new Promise((resolve) => setTimeout(resolve, secondsRemaining * 1000));

    console.log("");
    console.log("=== Test User Created Successfully (with TOTP MFA) ===");
    console.log("");
    console.log("Use these environment variables for behavior tests:");
    console.log("");
    console.log(`export TEST_AUTH_USERNAME='${testEmail}'`);
    console.log(`export TEST_AUTH_PASSWORD='${testPassword}'`);
    console.log(`export TEST_AUTH_TOTP_SECRET='${totpSecret}'`);
    console.log("");

    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      // Test system credentials - intentionally not masked so they appear in job summary
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `test-auth-username=${testEmail}\ntest-auth-password=${testPassword}\ntest-auth-totp-secret=${totpSecret}\n`,
      );
    }

    // Also output as simple key=value format for easy sourcing
    console.log(`TEST_AUTH_USERNAME=${testEmail}`);
    console.log(`TEST_AUTH_PASSWORD=${testPassword}`);
    console.log(`TOTP_SECRET=${totpSecret}`);
  } catch (error) {
    console.error(`ERROR: Failed to create Cognito test user: ${error.message}`);
    process.exit(1);
  }
}

main();
