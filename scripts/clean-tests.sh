#!/usr/bin/env bash
# scripts/clean-tests.sh
# Purpose: Clear Playwright/Maven test artifacts to avoid file-lock issues during builds and reruns.
# Safe to run repeatedly.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[clean-tests] Cleaning Playwright and test artifact directories under target/ ..."

# Remove Playwright output dirs used by our config
rm -rf "$ROOT_DIR/target/behaviour-test-results" || true
rm -rf "$ROOT_DIR/target/browser-test-results" || true
rm -rf "$ROOT_DIR/target/test-results" || true

# Remove any orphaned Playwright artifacts that sometimes remain after crashes
find "$ROOT_DIR/target" -type d -name ".playwright-*" -maxdepth 2 -print -exec rm -rf {} + 2>/dev/null || true

# Remove Playwright HTML report to avoid stale report confusion
rm -rf "$ROOT_DIR/target/test-reports/html-report" || true

echo "[clean-tests] Done."
