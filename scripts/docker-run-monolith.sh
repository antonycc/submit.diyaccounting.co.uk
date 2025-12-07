#!/usr/bin/env bash
# Run Docker container in monolith mode for local development
set -euo pipefail

echo "Starting Docker container in monolith mode..."

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Load environment variables from .env.proxy
if [ -f ".env.proxy" ]; then
  echo "Loading environment from .env.proxy..."
  set -a
  source .env.proxy
  set +a
fi

# Override APP_MODE for monolith
export APP_MODE=monolith

# Start dynalite in the background for local DynamoDB
echo "Starting dynalite for local DynamoDB..."
npm run data &
DYNALITE_PID=$!

# Give dynalite time to start
sleep 2

# Set DynamoDB endpoint to local dynalite
export DYNAMODB_ENDPOINT=http://host.docker.internal:9000
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=dummy
export AWS_SECRET_ACCESS_KEY=dummy

# Run the Docker container
docker run --rm -it \
  -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e APP_MODE=monolith \
  -e NODE_ENV=${NODE_ENV:-development} \
  -e PORT=3000 \
  -e AWS_REGION="${AWS_REGION}" \
  -e AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
  -e AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
  -e DYNAMODB_ENDPOINT="${DYNAMODB_ENDPOINT}" \
  -e BUNDLE_DYNAMODB_TABLE_NAME="${BUNDLE_DYNAMODB_TABLE_NAME:-ci-submit-bundles}" \
  -e RECEIPTS_DYNAMODB_TABLE_NAME="${RECEIPTS_DYNAMODB_TABLE_NAME:-ci-submit-receipts}" \
  -e HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME="${HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME:-ci-submit-hmrc-api-requests}" \
  -e SESSIONS_DYNAMODB_TABLE_NAME="${SESSIONS_DYNAMODB_TABLE_NAME:-ci-submit-sessions}" \
  -e GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}" \
  -e GOOGLE_CLIENT_SECRET_PARAM="${GOOGLE_CLIENT_SECRET_PARAM:-}" \
  -e COOKIE_SECRET_PARAM="${COOKIE_SECRET_PARAM:-}" \
  -e HMRC_CLIENT_ID="${HMRC_CLIENT_ID:-}" \
  -e HMRC_BASE_URI="${HMRC_BASE_URI:-https://test-api.service.hmrc.gov.uk}" \
  -e DIY_SUBMIT_BASE_URL="${DIY_SUBMIT_BASE_URL:-http://localhost:3000}" \
  submit-monolith:latest

# Cleanup dynalite on exit
cleanup() {
  echo "Stopping dynalite..."
  kill $DYNALITE_PID 2>/dev/null || true
  wait $DYNALITE_PID 2>/dev/null || true
}

trap cleanup EXIT INT TERM
