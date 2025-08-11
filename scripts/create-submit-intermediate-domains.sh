# === Config ===
export ZONE_NAME='diyaccounting.co.uk'
export APEX='diyaccounting.co.uk'   # target for both CNAMEs

# === Script ===
set -euo pipefail

HZ_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name "${ZONE_NAME}" \
  --query "HostedZones[?Name=='${ZONE_NAME}.'
                     && Config.PrivateZone==\`false\`].Id | [0]" \
  --output text)
[ -z "${HZ_ID}" -o "${HZ_ID}" = "None" ] && { echo "Hosted zone not found"; exit 2; }
HZ_ID="${HZ_ID##*/}"

TMP="$(mktemp)"
cat > "${TMP}" <<JSON
{
  "Comment": "Create/Update CNAME anchors for submit/auth.submit",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "submit.${ZONE_NAME}.",
        "Type": "CNAME",
        "TTL": 60,
        "ResourceRecords": [{ "Value": "${APEX}." }]
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "auth.submit.${ZONE_NAME}.",
        "Type": "CNAME",
        "TTL": 60,
        "ResourceRecords": [{ "Value": "${APEX}." }]
      }
    }
  ]
}
JSON

CHANGE_ID=$(aws route53 change-resource-record-sets \
  --hosted-zone-id "${HZ_ID}" \
  --change-batch "file://${TMP}" \
  --query 'ChangeInfo.Id' --output text)

aws route53 wait resource-record-sets-changed --id "${CHANGE_ID}"

echo "Verifying…"
aws route53 test-dns-answer --hosted-zone-id "${HZ_ID}" \
  --record-name "submit.${ZONE_NAME}" --record-type CNAME --output table
aws route53 test-dns-answer --hosted-zone-id "${HZ_ID}" \
  --record-name "auth.submit.${ZONE_NAME}" --record-type CNAME --output table

rm -f "${TMP}"
echo "Done."
