#!/usr/bin/env bash
# Stop Docker container, dynalite, and mock OAuth server used for behavior testing
set -euo pipefail

TEST_MODE="${TEST_MODE:-local}"
echo "Stopping test services (mode: $TEST_MODE)..."

# Stop Docker container (if running in docker mode)
if [ "$TEST_MODE" = "docker" ]; then
  echo "Stopping Docker container..."
  docker stop submit-test-container 2>/dev/null || true
  docker rm submit-test-container 2>/dev/null || true
fi

# Stop dynalite (always runs)
if [ -f /tmp/submit-dynalite.pid ]; then
  DYNALITE_PID=$(cat /tmp/submit-dynalite.pid)
  echo "Stopping dynalite (PID: $DYNALITE_PID)..."
  kill $DYNALITE_PID 2>/dev/null || true
  rm /tmp/submit-dynalite.pid
fi

# Stop mock OAuth2 server (only in local mode)
if [ -f /tmp/submit-oauth.pid ]; then
  OAUTH_PID=$(cat /tmp/submit-oauth.pid)
  echo "Stopping mock OAuth2 server (PID: $OAUTH_PID)..."
  kill $OAUTH_PID 2>/dev/null || true
  rm /tmp/submit-oauth.pid
fi

echo "Test services stopped."
echo "NOTE: If you started ngrok proxy separately, stop it with: pkill -f ngrok"
