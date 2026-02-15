#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Create a Cognito test user for behavior tests
//
// Usage: node scripts/create-cognito-test-user.js <environment-name>
// Example: node scripts/create-cognito-test-user.js ci
//
// This script creates a test user in the Cognito user pool for the specified environment.
// It outputs the credentials as environment variables that can be used by behavior tests.

import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import crypto from "crypto";
import fs from "fs";

const environmentName = process.argv[2] || "ci";

async function main() {
  console.log("=== Creating Cognito Test User ===");
  console.log(`Environment: ${environmentName}`);
  console.log(`AWS Region: ${process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "not set"}`);
  console.log("");

  // Get the Cognito User Pool ID from CloudFormation stack outputs
  const stackName = `${environmentName}-env-IdentityStack`;
  console.log(`Looking up stack: ${stackName}`);

  const cfnClient = new CloudFormationClient({});
  let userPoolId;

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
    console.log(`User Pool ID: ${userPoolId}`);
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

    console.log("");
    console.log("=== Test User Created Successfully ===");
    console.log("");
    console.log("Use these environment variables for behavior tests:");
    console.log("");
    console.log(`export TEST_AUTH_USERNAME='${testEmail}'`);
    console.log(`export TEST_AUTH_PASSWORD='${testPassword}'`);
    console.log("");

    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      // Test system password - intentionally not masked so it appears in job summary
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `test-auth-username=${testEmail}\ntest-auth-password=${testPassword}\n`);
    }

    // Also output as simple key=value format for easy sourcing
    console.log(`TEST_AUTH_USERNAME=${testEmail}`);
    console.log(`TEST_AUTH_PASSWORD=${testPassword}`);
  } catch (error) {
    console.error(`ERROR: Failed to create Cognito test user: ${error.message}`);
    process.exit(1);
  }
}

main();
