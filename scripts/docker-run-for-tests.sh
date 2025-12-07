#!/usr/bin/env bash
# Run Docker container in monolith mode for behavior testing
# This script starts the container and waits for it to be healthy
# 
# Usage modes:
#   TEST_MODE=docker: Uses Docker container, only starts dynalite externally
#   TEST_MODE=local (default): Starts full local environment (server, auth, data, ngrok)
#
# For tests requiring OAuth (HMRC/Google), ensure ngrok proxy is running first:
#   npm run proxy &
#   sleep 5
#   npm run docker:start-for-tests
#
# The ngrok proxy (https://wanted-finally-anteater.ngrok-free.app) provides
# a stable HTTPS endpoint registered with HMRC and Google for OAuth callbacks.

set -euo pipefail

TEST_MODE="${TEST_MODE:-local}"
echo "Starting services for behavior tests (mode: $TEST_MODE)..."

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

# Override APP_MODE for monolith when using Docker
export APP_MODE=monolith

if [ "$TEST_MODE" = "docker" ]; then
  echo "Docker mode: Starting only dynalite (container will provide app server)..."
  
  # Start dynalite in the background for local DynamoDB
  echo "Starting dynalite for local DynamoDB..."
  npm run data &
  DYNALITE_PID=$!
  
  # Give dynalite time to start and create tables
  sleep 3
else
  echo "Local mode: Starting mock OAuth2 server and dynalite..."
  
  # Start mock OAuth2 server for local testing (if not using real HMRC/Google)
  echo "Starting mock OAuth2 server..."
  npm run auth &
  OAUTH_PID=$!
  sleep 2

  # Start dynalite in the background for local DynamoDB
  echo "Starting dynalite for local DynamoDB..."
  npm run data &
  DYNALITE_PID=$!

  # Save PIDs for cleanup
  echo $OAUTH_PID > /tmp/submit-oauth.pid

  # Give dynalite time to start and create tables
  sleep 3
fi

# Save PID for cleanup
echo $DYNALITE_PID > /tmp/submit-dynalite.pid

if [ "$TEST_MODE" = "docker" ]; then
  # Set DynamoDB endpoint to local dynalite
  export DYNAMODB_ENDPOINT=http://host.docker.internal:9000
  export AWS_REGION=us-east-1
  export AWS_ACCESS_KEY_ID=dummy
  export AWS_SECRET_ACCESS_KEY=dummy

  # Stop any existing container
  docker stop submit-test-container 2>/dev/null || true
  docker rm submit-test-container 2>/dev/null || true

  # Run the Docker container in detached mode
  echo "Starting Docker container..."
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

  echo "Docker container started successfully on http://localhost:3000"
  echo "Dynalite running for local DynamoDB"
  echo ""
  echo "NOTE: For tests requiring OAuth with HMRC/Google:"
  echo "  - Ensure ngrok proxy is running: npm run proxy"
  echo "  - The proxy provides: https://wanted-finally-anteater.ngrok-free.app"
  echo "  - This is the registered callback URL for OAuth"
  echo ""
  echo "To stop all services: npm run docker:stop-tests"
else
  echo "Local services started successfully."
  echo "Mock OAuth2 server, dynalite, and other services are running."
  echo "Tests will use locally running services (not Docker container)."
  echo ""
  echo "To stop all services: npm run docker:stop-tests"
fi
