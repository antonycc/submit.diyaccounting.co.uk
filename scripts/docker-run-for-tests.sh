#!/usr/bin/env bash
# Run Docker container in monolith mode for behavior testing
# This script starts the container and waits for it to be healthy
set -euo pipefail

echo "Starting Docker container for behavior tests..."

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Load environment variables from test environment
ENV_FILE="${1:-.env.proxy}"
if [ -f "$ENV_FILE" ]; then
  echo "Loading environment from $ENV_FILE..."
  set -a
  source "$ENV_FILE"
  set +a
fi

# Override APP_MODE for monolith
export APP_MODE=monolith

# Start dynalite in the background for local DynamoDB
echo "Starting dynalite for local DynamoDB..."
npm run data &
DYNALITE_PID=$!

# Give dynalite time to start and create tables
sleep 3

# Set DynamoDB endpoint to local dynalite
export DYNAMODB_ENDPOINT=http://host.docker.internal:9000
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=dummy
export AWS_SECRET_ACCESS_KEY=dummy

# Stop any existing container
docker stop submit-test-container 2>/dev/null || true
docker rm submit-test-container 2>/dev/null || true

# Run the Docker container in detached mode
echo "Starting container..."
docker run -d \
  --name submit-test-container \
  -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e APP_MODE=monolith \
  -e NODE_ENV=${NODE_ENV:-test} \
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

# Wait for container to be healthy
echo "Waiting for container to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "Container is ready!"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 1
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "Container failed to start within expected time"
  docker logs submit-test-container
  docker stop submit-test-container
  docker rm submit-test-container
  kill $DYNALITE_PID 2>/dev/null || true
  exit 1
fi

echo "Container started successfully. Run tests now."
echo "To stop: npm run docker:stop-tests"

# Save PIDs for cleanup
echo $DYNALITE_PID > /tmp/submit-dynalite.pid
