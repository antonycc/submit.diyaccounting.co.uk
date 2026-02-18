#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# scripts/aws-accounts/list-prod-secrets.sh
#
# Lists all Secrets Manager secrets and KMS keys/aliases in the current account.
# Does NOT print secret values. Output is useful for copy-secrets-to-account.sh.
# Part of Phase 1.4 preparation (PLAN_ACCOUNT_SEPARATION.md step 1.4.2).
#
# Usage:
#   . ./scripts/aws-assume-submit-deployment-role.sh
#   ./scripts/aws-accounts/list-prod-secrets.sh [environment]
#
# Arguments:
#   environment  - Environment name filter (default: prod). Use "all" to list everything.
#
# Prerequisites:
#   - AWS CLI configured with credentials for account 887764105431
#   - jq installed
#   - Assumed the deployment role (. ./scripts/aws-assume-submit-deployment-role.sh)

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- Help ---
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 [environment]"
  echo ""
  echo "Lists all Secrets Manager secrets and KMS keys in the account."
  echo "Does NOT print secret values — only names, descriptions, tags, and access dates."
  echo ""
  echo "Arguments:"
  echo "  environment  Environment name filter (default: prod). Use 'all' to list everything."
  echo ""
  echo "Output format is designed for use with copy-secrets-to-account.sh."
  echo ""
  echo "Prerequisites:"
  echo "  . ./scripts/aws-assume-submit-deployment-role.sh"
  exit 0
fi

# --- Configuration ---
ENV="${1:-prod}"
REGION="${AWS_REGION:-eu-west-2}"

echo -e "${GREEN}=== Secrets Manager & KMS Inventory ===${NC}"
echo "  Environment filter: ${ENV}"
echo "  Region:             ${REGION}"
echo ""

# --- Verify AWS credentials ---
echo "Verifying AWS credentials..."
CALLER_IDENTITY=$(aws sts get-caller-identity --output json 2>/dev/null) || {
  echo -e "${RED}ERROR: AWS credentials not configured. Run:${NC}"
  echo "  . ./scripts/aws-assume-submit-deployment-role.sh"
  exit 1
}
ACCOUNT_ID=$(echo "${CALLER_IDENTITY}" | jq -r '.Account')
echo -e "  Account: ${GREEN}${ACCOUNT_ID}${NC}"
echo ""

# ============================================================================
# Secrets Manager
# ============================================================================
echo -e "${CYAN}--- Secrets Manager Secrets ---${NC}"
echo ""

# Fetch all secrets
ALL_SECRETS=$(aws secretsmanager list-secrets \
  --region "${REGION}" \
  --output json \
  --query 'SecretList[*].{Name:Name,Description:Description,LastAccessedDate:LastAccessedDate,LastChangedDate:LastChangedDate,Tags:Tags,KmsKeyId:KmsKeyId,ARN:ARN}')

# Filter by environment if not "all"
if [[ "${ENV}" == "all" ]]; then
  SECRETS="${ALL_SECRETS}"
else
  SECRETS=$(echo "${ALL_SECRETS}" | jq --arg env "${ENV}" '[.[] | select(.Name | startswith($env + "/"))]')
fi

SECRET_COUNT=$(echo "${SECRETS}" | jq 'length')

if [[ "${SECRET_COUNT}" -eq 0 ]]; then
  echo -e "${YELLOW}No secrets found matching '${ENV}/'${NC}"
  echo ""
  echo "All secret names in account:"
  echo "${ALL_SECRETS}" | jq -r '.[].Name' | sort
  echo ""
else
  echo -e "Found ${GREEN}${SECRET_COUNT}${NC} secret(s):"
  echo ""

  echo "${SECRETS}" | jq -r '.[] | "  \(.Name)"' | sort

  echo ""
  echo -e "${CYAN}Detailed listing:${NC}"
  echo ""

  echo "${SECRETS}" | jq -r '.[] | [
    "  Name:         " + .Name,
    "  ARN:          " + (.ARN // "N/A"),
    "  Description:  " + (.Description // "(none)"),
    "  KMS Key:      " + (.KmsKeyId // "aws/secretsmanager (default)"),
    "  Last Changed: " + (if .LastChangedDate then (.LastChangedDate | tostring) else "N/A" end),
    "  Last Accessed:" + (if .LastAccessedDate then (.LastAccessedDate | tostring) else "N/A" end),
    "  Tags:         " + (if .Tags and (.Tags | length > 0) then (.Tags | map(.Key + "=" + .Value) | join(", ")) else "(none)" end),
    ""
  ] | .[]'
fi

# Also list secrets for OTHER environments so the user knows what exists
if [[ "${ENV}" != "all" ]]; then
  OTHER_SECRETS=$(echo "${ALL_SECRETS}" | jq --arg env "${ENV}" '[.[] | select(.Name | startswith($env + "/") | not)]')
  OTHER_COUNT=$(echo "${OTHER_SECRETS}" | jq 'length')

  if [[ "${OTHER_COUNT}" -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}Other secrets in account (not matching '${ENV}/'):${NC}"
    echo "${OTHER_SECRETS}" | jq -r '.[].Name' | sort | while IFS= read -r name; do
      echo "  ${name}"
    done
    echo ""
  fi
fi

# ============================================================================
# Known secret names from .env files (cross-reference)
# ============================================================================
echo -e "${CYAN}--- Expected Secrets (from .env files) ---${NC}"
echo ""
echo "  Based on .env.prod and .env.ci, the following Secrets Manager secrets are expected:"
echo ""
echo "  ${ENV}/submit/google/client_secret        - Google OAuth client secret (Cognito IdP)"
echo "  ${ENV}/submit/hmrc/client_secret           - HMRC production API client secret"
echo "  ${ENV}/submit/hmrc/sandbox_client_secret   - HMRC sandbox API client secret"
echo "  ${ENV}/submit/stripe/secret_key            - Stripe live secret key"
echo "  ${ENV}/submit/stripe/test_secret_key       - Stripe test secret key"
echo "  ${ENV}/submit/stripe/webhook_secret        - Stripe webhook signing secret"
echo "  ${ENV}/submit/stripe/test_webhook_secret   - Stripe test webhook signing secret"
echo "  ${ENV}/submit/telegram/bot_token           - Telegram bot token for notifications"
echo "  ${ENV}/submit/user-sub-hash-salt           - User sub hash salt (JSON registry)"
echo ""

# ============================================================================
# KMS Keys
# ============================================================================
echo -e "${CYAN}--- KMS Keys ---${NC}"
echo ""

# List all KMS keys
KMS_KEYS=$(aws kms list-keys --region "${REGION}" --output json --query 'Keys[*].KeyId')
KEY_COUNT=$(echo "${KMS_KEYS}" | jq 'length')

echo -e "Found ${GREEN}${KEY_COUNT}${NC} KMS key(s):"
echo ""

# List aliases for context
ALIASES=$(aws kms list-aliases --region "${REGION}" --output json)

# Show customer-managed keys (not aws/ aliases)
echo "${ALIASES}" | jq -r --arg env "${ENV}" '
  .Aliases[]
  | select(.AliasName | startswith("alias/aws/") | not)
  | "  \(.AliasName)  ->  \(.TargetKeyId // "N/A")"
' | sort

echo ""

# Show details for keys matching the environment
echo -e "${CYAN}Key details (customer-managed, matching '${ENV}'):${NC}"
echo ""

MATCHING_KEY_IDS=$(echo "${ALIASES}" | jq -r --arg env "${ENV}" '
  .Aliases[]
  | select(.AliasName | startswith("alias/aws/") | not)
  | select(.AliasName | contains($env))
  | .TargetKeyId
')

if [[ -n "${MATCHING_KEY_IDS}" ]]; then
  while IFS= read -r key_id; do
    [[ -z "${key_id}" ]] && continue
    KEY_INFO=$(aws kms describe-key --key-id "${key_id}" --region "${REGION}" --output json 2>/dev/null) || continue

    # Get aliases for this key
    KEY_ALIASES=$(echo "${ALIASES}" | jq -r --arg kid "${key_id}" '
      [.Aliases[] | select(.TargetKeyId == $kid) | .AliasName] | join(", ")
    ')

    echo "${KEY_INFO}" | jq -r --arg aliases "${KEY_ALIASES}" '
      .KeyMetadata |
      "  Key ID:       " + .KeyId,
      "  Aliases:      " + $aliases,
      "  Description:  " + (.Description // "(none)"),
      "  Key State:    " + .KeyState,
      "  Key Spec:     " + .KeySpec,
      "  Key Usage:    " + .KeyUsage,
      "  Rotation:     " + (if .KeyRotationStatus then "enabled" else "check manually" end),
      "  Created:      " + (.CreationDate | tostring),
      ""
    '
  done <<< "${MATCHING_KEY_IDS}"
else
  echo -e "  ${YELLOW}No customer-managed KMS keys matching '${ENV}'${NC}"
  echo ""
fi

# ============================================================================
# Summary
# ============================================================================
echo -e "${GREEN}=== Summary ===${NC}"
echo "  Account:             ${ACCOUNT_ID}"
echo "  Region:              ${REGION}"
echo "  Environment:         ${ENV}"
echo "  Secrets (filtered):  ${SECRET_COUNT}"
echo "  KMS keys (total):    ${KEY_COUNT}"
echo ""
echo "Next steps:"
echo "  1. Review the secret names above"
echo "  2. Use ./scripts/aws-accounts/copy-secrets-to-account.sh to copy to new account"
echo "  3. Some secrets may need to be re-created (e.g., Stripe webhooks for new URLs)"
