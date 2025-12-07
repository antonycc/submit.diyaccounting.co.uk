#!/usr/bin/env bash
# Stop Docker container and dynalite used for behavior testing
set -euo pipefail

echo "Stopping test containers..."

# Stop Docker container
docker stop submit-test-container 2>/dev/null || true
docker rm submit-test-container 2>/dev/null || true

# Stop dynalite
if [ -f /tmp/submit-dynalite.pid ]; then
  DYNALITE_PID=$(cat /tmp/submit-dynalite.pid)
  kill $DYNALITE_PID 2>/dev/null || true
  rm /tmp/submit-dynalite.pid
fi

echo "Test containers stopped."
