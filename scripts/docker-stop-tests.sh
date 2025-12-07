#!/usr/bin/env bash
# Stop Docker container, dynalite, and mock OAuth server used for behavior testing
set -euo pipefail

echo "Stopping test containers and services..."

# Stop Docker container
docker stop submit-test-container 2>/dev/null || true
docker rm submit-test-container 2>/dev/null || true

# Stop dynalite
if [ -f /tmp/submit-dynalite.pid ]; then
  DYNALITE_PID=$(cat /tmp/submit-dynalite.pid)
  kill $DYNALITE_PID 2>/dev/null || true
  rm /tmp/submit-dynalite.pid
fi

# Stop mock OAuth2 server
if [ -f /tmp/submit-oauth.pid ]; then
  OAUTH_PID=$(cat /tmp/submit-oauth.pid)
  kill $OAUTH_PID 2>/dev/null || true
  rm /tmp/submit-oauth.pid
fi

echo "Test containers and services stopped."
echo "NOTE: If you started ngrok proxy separately, stop it with: pkill -f ngrok"
