#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# Create a Cognito test user for behavior tests (bash version for local use)
#
# Usage: ./scripts/create-cognito-test-user.sh <environment-name>
# Example: ./scripts/create-cognito-test-user.sh ci
#
# This script creates a test user in the Cognito user pool for the specified environment.
# It outputs the credentials as environment variables that can be used by behavior tests.
#
# Note: For CI environments without AWS CLI, use the Node.js version:
#       node scripts/create-cognito-test-user.js <environment-name>
#
# Prerequisites:
# - AWS CLI installed and configured with permission to manage Cognito users

set -e

ENVIRONMENT_NAME="${1:-ci}"

if [ -z "$ENVIRONMENT_NAME" ]; then
    echo "Usage: $0 <environment-name>"
    echo ""
    echo "Example: $0 ci"
    exit 1
fi

echo "=== Creating Cognito Test User ==="
echo "Environment: $ENVIRONMENT_NAME"
echo ""

# Get the Cognito User Pool ID from CloudFormation stack outputs
# Stack name pattern: {env}-env-IdentityStack, Output key: UserPoolId
STACK_NAME="${ENVIRONMENT_NAME}-env-IdentityStack"

echo "Looking up stack: $STACK_NAME"
USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
    --output text 2>/dev/null || echo "")

if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" = "None" ]; then
    echo "ERROR: Could not find Cognito User Pool ID for environment: $ENVIRONMENT_NAME"
    echo "Looking for stack: ${STACK_NAME}, output: UserPoolId"
    exit 1
fi

echo "User Pool ID: $USER_POOL_ID"

# Generate unique test user credentials
TEST_EMAIL="test-$(date +%s)-$(openssl rand -hex 4)@test.diyaccounting.co.uk"
TEST_PASSWORD="Test$(openssl rand -hex 8)!Aa1"

echo "Creating test user: $TEST_EMAIL"

# Create the user using AdminCreateUser
aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$TEST_EMAIL" \
    --user-attributes \
        Name=email,Value="$TEST_EMAIL" \
        Name=email_verified,Value=true \
    --message-action SUPPRESS \
    --output json > /dev/null

echo "Setting permanent password..."

# Set permanent password (skip forced password change)
aws cognito-idp admin-set-user-password \
    --user-pool-id "$USER_POOL_ID" \
    --username "$TEST_EMAIL" \
    --password "$TEST_PASSWORD" \
    --permanent

echo ""
echo "=== Test User Created Successfully ==="
echo ""
echo "Use these environment variables for behavior tests:"
echo ""
echo "export TEST_AUTH_USERNAME='$TEST_EMAIL'"
echo "export TEST_AUTH_PASSWORD='$TEST_PASSWORD'"
echo ""

# Output for GitHub Actions
if [ -n "$GITHUB_OUTPUT" ]; then
    echo "test-auth-username=$TEST_EMAIL" >> "$GITHUB_OUTPUT"
    echo "test-auth-password=$TEST_PASSWORD" >> "$GITHUB_OUTPUT"
fi

# Also output as a simple key=value format for easy sourcing
echo "TEST_AUTH_USERNAME=$TEST_EMAIL"
echo "TEST_AUTH_PASSWORD=$TEST_PASSWORD"
