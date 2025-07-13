#!/usr/bin/env bash
# scripts/assume-s3-role.sh
# Usage: ./scripts/assume-s3-role.sh <role-arn>
# Example:
# ./scripts/assume-s3-role.sh arn:aws:iam::123456789012:role/MyRole

#!/usr/bin/env bash

# Variables (Replace these with your values)
ROLE_ARN="${1?}"  # IAM Role ARN to assume
SESSION_NAME="s3-sqs-bridge-short-lived-s3-session-$(date +%s)"
BUCKET_NAME="s3-sqs-bridge-bucket"
DURATION_SECONDS=900  # 15 minutes

# Obtain temporary credentials using STS AssumeRole
CREDS_JSON=$(aws sts assume-role \
  --role-arn "${ROLE_ARN?}" \
  --role-session-name "${SESSION_NAME?}" \
  --duration-seconds ${DURATION_SECONDS?})

# Export credentials to environment variables
export AWS_ACCESS_KEY_ID=$(echo "$CREDS_JSON" | jq -r '.Credentials.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo "$CREDS_JSON" | jq -r '.Credentials.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo "$CREDS_JSON" | jq -r '.Credentials.SessionToken')

# Verify the credentials (optional, sanity check)
aws sts get-caller-identity

# Example operation: list bucket contents
aws s3 ls "s3://$BUCKET_NAME"
