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

echo 'Starting auth (mock-oauth2-server)...' >&2
npm run auth &
BG_PIDS+=("$!")

echo 'Starting proxy (ngrok)...' >&2
# Keep the ability to pass the port through npm if you want, default to 3000
npm run proxy -- 3000 &
BG_PIDS+=("$!")

echo 'Starting web server...' >&2
# Foreground process; when this exits, cleanup will run and terminate the others
npm run server
