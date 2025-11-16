#!/usr/bin/env bash
set -euo pipefail

# Track background PIDs so we can clean them up
BG_PIDS=()

cleanup() {
  local exit_code=$?
  if ((${#BG_PIDS[@]})); then
    echo 'Shutting down background services...' >&2
    # Try to terminate background services nicely
    kill "${BG_PIDS[@]}" 2>/dev/null || true
    # Reap them
    wait "${BG_PIDS[@]}" 2>/dev/null || true
  fi
  exit "$exit_code"
}

trap cleanup INT TERM EXIT

# Temporary log file to watch for the MinIO URL while still streaming output to the console
MINIO_LOG=$(mktemp)

echo 'Starting storage (MinIO)...' >&2
# Stream to both console and log file
npm run storage 2>&1 | tee "$MINIO_LOG" &
BG_PIDS+=("$!")

echo 'Waiting for MinIO storage to report endpoint...' >&2
TEST_S3_ENDPOINT=''

# Poll the log for the "MinIO started url=" line
for _ in {1..150}; do
  if grep -q 'MinIO started url=' "$MINIO_LOG"; then
    TEST_S3_ENDPOINT=$(awk -F'url=' '/MinIO started url=/{print $2; exit}' "$MINIO_LOG")
    break
  fi
  sleep 0.2
done

if [[ -z "$TEST_S3_ENDPOINT" ]]; then
  echo 'ERROR: Failed to detect MinIO endpoint in storage logs.' >&2
  echo "Contents of $MINIO_LOG:" >&2
  sed -n '1,200p' "$MINIO_LOG" >&2 || true
  exit 1
fi

echo "Detected MinIO endpoint: $TEST_S3_ENDPOINT" >&2

echo 'Starting auth (mock-oauth2-server)...' >&2
npm run auth &
BG_PIDS+=("$!")

echo 'Starting proxy (ngrok)...' >&2
# Keep the ability to pass the port through npm if you want, default to 3000
npm run proxy -- 3000 &
BG_PIDS+=("$!")

echo 'Starting web server...' >&2
# Foreground process; when this exits, cleanup will run and terminate the others
TEST_S3_ENDPOINT="$TEST_S3_ENDPOINT" npm run server
