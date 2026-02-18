#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# scripts/aws-accounts/restore-tables-from-backup.sh
#
# Restores DynamoDB tables from on-demand backups into a target account.
# Part of Phase 1.4 (PLAN_ACCOUNT_SEPARATION.md step 1.4.17).
#
# Usage:
#   ./scripts/aws-accounts/restore-tables-from-backup.sh --profile <profile> --backup-arns <arn1> [<arn2> ...]
#   ./scripts/aws-accounts/restore-tables-from-backup.sh --profile <profile> --backup-date <YYYYMMDD> --source-profile <profile>
#
# Prerequisites:
#   - AWS CLI configured with named profiles
#   - For --backup-arns: ARNs from backup-prod-for-migration.sh output
#   - For --backup-date: access to source account to list backups by date
#   - jq installed

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- Defaults ---
TARGET_PROFILE=""
SOURCE_PROFILE=""
BACKUP_ARNS=()
BACKUP_DATE=""
REGION="${AWS_REGION:-eu-west-2}"
POLL_INTERVAL=30
MAX_WAIT=1800 # 30 minutes

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile|--target-profile)
      TARGET_PROFILE="$2"
      shift 2
      ;;
    --source-profile)
      SOURCE_PROFILE="$2"
      shift 2
      ;;
    --backup-arns)
      shift
      while [[ $# -gt 0 && ! "$1" == --* ]]; do
        BACKUP_ARNS+=("$1")
        shift
      done
      ;;
    --backup-date)
      BACKUP_DATE="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --poll-interval)
      POLL_INTERVAL="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 --profile <profile> [--backup-arns <arn1> ...] [--backup-date <YYYYMMDD> --source-profile <profile>]"
      echo ""
      echo "Restores DynamoDB tables from on-demand backups."
      echo ""
      echo "Required:"
      echo "  --profile <profile>         AWS CLI profile for the target account"
      echo ""
      echo "Provide ONE of:"
      echo "  --backup-arns <arn1> ...    Specific backup ARNs to restore"
      echo "  --backup-date <YYYYMMDD>    Find backups by date pattern (requires --source-profile)"
      echo ""
      echo "Options:"
      echo "  --source-profile <profile>  AWS CLI profile for source account (needed with --backup-date)"
      echo "  --region <region>           AWS region (default: eu-west-2)"
      echo "  --poll-interval <seconds>   Polling interval for restore status (default: 30)"
      echo ""
      echo "Tables restored (from DataStack):"
      echo "  {env}-env-receipts                              HMRC submission receipts (7-year PITR)"
      echo "  {env}-env-bundles                               User subscriptions + salt backup"
      echo "  {env}-env-hmrc-api-requests                     HMRC API audit log"
      echo "  {env}-env-passes                                Invitation pass codes"
      echo "  {env}-env-subscriptions                         Stripe subscription data"
      echo "  {env}-env-bundle-capacity                       Global cap counters (rebuilt by Lambda)"
      echo "  {env}-env-bundle-post-async-requests            Async request correlation (ephemeral)"
      echo "  {env}-env-bundle-delete-async-requests          Async request correlation (ephemeral)"
      echo "  {env}-env-hmrc-vat-return-post-async-requests   Async request correlation (ephemeral)"
      echo "  {env}-env-hmrc-vat-return-get-async-requests    Async request correlation (ephemeral)"
      echo "  {env}-env-hmrc-vat-obligation-get-async-requests Async request correlation (ephemeral)"
      echo ""
      echo "Example:"
      echo "  $0 --profile submit-prod --backup-arns arn:aws:dynamodb:eu-west-2:887764105431:table/prod-env-bundles/backup/01234567890"
      echo "  $0 --profile submit-prod --backup-date 20260218 --source-profile management"
      exit 0
      ;;
    *)
      echo -e "${RED}ERROR: Unknown argument: $1${NC}"
      echo "Run $0 --help for usage."
      exit 1
      ;;
  esac
done

# --- Validate arguments ---
if [[ -z "${TARGET_PROFILE}" ]]; then
  echo -e "${RED}ERROR: --profile is required${NC}"
  echo "Run $0 --help for usage."
  exit 1
fi

if [[ ${#BACKUP_ARNS[@]} -eq 0 && -z "${BACKUP_DATE}" ]]; then
  echo -e "${RED}ERROR: Provide either --backup-arns or --backup-date${NC}"
  echo "Run $0 --help for usage."
  exit 1
fi

if [[ -n "${BACKUP_DATE}" && -z "${SOURCE_PROFILE}" ]]; then
  echo -e "${RED}ERROR: --source-profile is required when using --backup-date${NC}"
  exit 1
fi

# --- Header ---
echo -e "${GREEN}=== DynamoDB Table Restore ===${NC}"
echo "  Target profile: ${TARGET_PROFILE}"
echo "  Region:         ${REGION}"
echo ""

# --- Verify target credentials ---
echo "Verifying target credentials..."
TARGET_ACCOUNT=$(aws sts get-caller-identity --profile "${TARGET_PROFILE}" --region "${REGION}" --query 'Account' --output text 2>/dev/null) || {
  echo -e "${RED}ERROR: Cannot authenticate with target profile '${TARGET_PROFILE}'${NC}"
  exit 1
}
echo -e "  Target account: ${GREEN}${TARGET_ACCOUNT}${NC}"
echo ""

# --- Resolve backup ARNs from date pattern if needed ---
if [[ -n "${BACKUP_DATE}" ]]; then
  echo "Finding backups matching date '${BACKUP_DATE}' in source account..."

  echo "Verifying source credentials..."
  SOURCE_ACCOUNT=$(aws sts get-caller-identity --profile "${SOURCE_PROFILE}" --region "${REGION}" --query 'Account' --output text 2>/dev/null) || {
    echo -e "${RED}ERROR: Cannot authenticate with source profile '${SOURCE_PROFILE}'${NC}"
    exit 1
  }
  echo -e "  Source account: ${GREEN}${SOURCE_ACCOUNT}${NC}"

  ALL_BACKUPS=$(aws dynamodb list-backups \
    --profile "${SOURCE_PROFILE}" \
    --region "${REGION}" \
    --backup-type USER \
    --output json \
    --query 'BackupSummaries[*].{BackupArn:BackupArn,BackupName:BackupName,TableName:TableName,BackupStatus:BackupStatus}')

  MATCHING_BACKUPS=$(echo "${ALL_BACKUPS}" | jq --arg date "pre-migration-${BACKUP_DATE}" '[.[] | select(.BackupName | startswith($date))]')
  MATCH_COUNT=$(echo "${MATCHING_BACKUPS}" | jq 'length')

  if [[ "${MATCH_COUNT}" -eq 0 ]]; then
    echo -e "${RED}No backups found matching 'pre-migration-${BACKUP_DATE}'${NC}"
    echo ""
    echo "Available backups:"
    echo "${ALL_BACKUPS}" | jq -r '.[] | "  \(.BackupName) (\(.TableName)) - \(.BackupStatus)"'
    exit 1
  fi

  echo -e "  Found ${GREEN}${MATCH_COUNT}${NC} backup(s):"
  echo "${MATCHING_BACKUPS}" | jq -r '.[] | "  \(.BackupName) -> \(.TableName)"'
  echo ""

  # Extract ARNs
  while IFS= read -r arn; do
    BACKUP_ARNS+=("${arn}")
  done < <(echo "${MATCHING_BACKUPS}" | jq -r '.[].BackupArn')
fi

# --- Restore each backup ---
echo "Restoring ${#BACKUP_ARNS[@]} table(s)..."
echo ""

RESTORE_JOBS=()  # Associative: table_name -> restore status

for BACKUP_ARN in "${BACKUP_ARNS[@]}"; do
  # Extract table name from backup ARN
  # ARN format: arn:aws:dynamodb:region:account:table/TABLE_NAME/backup/BACKUP_ID
  TABLE_NAME=$(echo "${BACKUP_ARN}" | sed 's|.*/table/||' | sed 's|/backup/.*||')

  echo -n "  Restoring ${TABLE_NAME} from backup..."

  # Check if the table already exists in target
  TABLE_EXISTS=$(aws dynamodb describe-table \
    --profile "${TARGET_PROFILE}" \
    --region "${REGION}" \
    --table-name "${TABLE_NAME}" \
    --query 'Table.TableStatus' \
    --output text 2>/dev/null) || TABLE_EXISTS=""

  if [[ -n "${TABLE_EXISTS}" ]]; then
    echo -e " ${YELLOW}SKIP (table already exists, status: ${TABLE_EXISTS})${NC}"
    continue
  fi

  # Restore from backup
  # Note: Cross-account restore requires the backup to be in the same account,
  # or use AWS Backup for cross-account copies. For same-account restores:
  aws dynamodb restore-table-from-backup \
    --profile "${TARGET_PROFILE}" \
    --region "${REGION}" \
    --target-table-name "${TABLE_NAME}" \
    --backup-arn "${BACKUP_ARN}" \
    --output json >/dev/null 2>&1 && {
    echo -e " ${GREEN}INITIATED${NC}"
    RESTORE_JOBS+=("${TABLE_NAME}")
  } || {
    echo -e " ${RED}FAILED${NC}"
    echo -e "    ${YELLOW}Note: Cross-account restore requires AWS Backup copy first.${NC}"
    echo -e "    ${YELLOW}The backup ARN must be in the target account.${NC}"
    echo ""
    echo -e "    To copy backup to target account, use AWS Backup:"
    echo "      1. Create a backup vault in the target account"
    echo "      2. Copy the recovery point from source to target vault"
    echo "      3. Restore from the target vault's recovery point"
    echo ""
  }
done

# --- Wait for restores to complete ---
if [[ ${#RESTORE_JOBS[@]} -gt 0 ]]; then
  echo ""
  echo "Waiting for ${#RESTORE_JOBS[@]} restore(s) to complete..."
  echo "  (polling every ${POLL_INTERVAL}s, max wait ${MAX_WAIT}s)"
  echo ""

  ELAPSED=0
  while [[ ${#RESTORE_JOBS[@]} -gt 0 && ${ELAPSED} -lt ${MAX_WAIT} ]]; do
    STILL_RESTORING=()

    for TABLE_NAME in "${RESTORE_JOBS[@]}"; do
      STATUS=$(aws dynamodb describe-table \
        --profile "${TARGET_PROFILE}" \
        --region "${REGION}" \
        --table-name "${TABLE_NAME}" \
        --query 'Table.TableStatus' \
        --output text 2>/dev/null) || STATUS="UNKNOWN"

      if [[ "${STATUS}" == "ACTIVE" ]]; then
        echo -e "  ${GREEN}ACTIVE${NC}   ${TABLE_NAME}"
      elif [[ "${STATUS}" == "CREATING" || "${STATUS}" == "RESTORING" ]]; then
        STILL_RESTORING+=("${TABLE_NAME}")
      else
        echo -e "  ${YELLOW}${STATUS}${NC}  ${TABLE_NAME}"
        STILL_RESTORING+=("${TABLE_NAME}")
      fi
    done

    if [[ ${#STILL_RESTORING[@]} -eq 0 ]]; then
      break
    fi

    RESTORE_JOBS=("${STILL_RESTORING[@]}")
    echo -e "  ${CYAN}${#RESTORE_JOBS[@]} table(s) still restoring... (${ELAPSED}s elapsed)${NC}"
    sleep "${POLL_INTERVAL}"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
  done

  if [[ ${#RESTORE_JOBS[@]} -gt 0 ]]; then
    echo -e "${YELLOW}WARNING: ${#RESTORE_JOBS[@]} table(s) still restoring after ${MAX_WAIT}s${NC}"
    echo "  Monitor manually:"
    for TABLE_NAME in "${RESTORE_JOBS[@]}"; do
      echo "    aws dynamodb describe-table --profile ${TARGET_PROFILE} --table-name ${TABLE_NAME} --query 'Table.TableStatus'"
    done
  fi
fi

# --- Final status ---
echo ""
echo -e "${GREEN}=== Restore Status ===${NC}"
echo ""

for BACKUP_ARN in "${BACKUP_ARNS[@]}"; do
  TABLE_NAME=$(echo "${BACKUP_ARN}" | sed 's|.*/table/||' | sed 's|/backup/.*||')

  STATUS=$(aws dynamodb describe-table \
    --profile "${TARGET_PROFILE}" \
    --region "${REGION}" \
    --table-name "${TABLE_NAME}" \
    --query 'Table.{Status:TableStatus,ItemCount:ItemCount,SizeBytes:TableSizeBytes}' \
    --output json 2>/dev/null) || STATUS='{"Status":"NOT FOUND"}'

  TABLE_STATUS=$(echo "${STATUS}" | jq -r '.Status')
  ITEM_COUNT=$(echo "${STATUS}" | jq -r '.ItemCount // "N/A"')
  SIZE_BYTES=$(echo "${STATUS}" | jq -r '.SizeBytes // "N/A"')

  if [[ "${TABLE_STATUS}" == "ACTIVE" ]]; then
    echo -e "  ${GREEN}ACTIVE${NC}   ${TABLE_NAME} (items: ${ITEM_COUNT}, size: ${SIZE_BYTES} bytes)"
  else
    echo -e "  ${YELLOW}${TABLE_STATUS}${NC}  ${TABLE_NAME}"
  fi
done

echo ""
echo "Next steps:"
echo "  1. Verify data in restored tables"
echo "  2. Enable PITR on critical tables (receipts, bundles, hmrc-api-requests)"
echo "  3. Run ./scripts/aws-accounts/restore-salt.sh to restore the salt"
echo "  4. Deploy application stacks and verify"
