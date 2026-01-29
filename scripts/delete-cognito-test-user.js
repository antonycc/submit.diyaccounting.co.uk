#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Delete a Cognito test user after behavior tests
//
// Usage: node scripts/delete-cognito-test-user.js <environment-name> <username>
// Example: node scripts/delete-cognito-test-user.js ci test-1234567890-abcdef01@test.diyaccounting.co.uk
//
// This script deletes a test user from the Cognito user pool.
// It is idempotent: deleting a user that doesn't exist is a no-op.

import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const environmentName = process.argv[2];
const username = process.argv[3];

if (!environmentName || !username) {
  console.error("Usage: node scripts/delete-cognito-test-user.js <environment-name> <username>");
  process.exit(1);
}

async function main() {
  console.log("=== Deleting Cognito Test User ===");
  console.log(`Environment: ${environmentName}`);
  console.log(`Username: ${username}`);
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

  const cognitoClient = new CognitoIdentityProviderClient({});

  try {
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: userPoolId,
        Username: username,
      }),
    );

    console.log("");
    console.log("=== Test User Deleted Successfully ===");
  } catch (error) {
    if (error.name === "UserNotFoundException") {
      console.log(`User ${username} not found (already deleted). No action needed.`);
    } else {
      console.error(`ERROR: Failed to delete Cognito test user: ${error.message}`);
      process.exit(1);
    }
  }
}

main();
