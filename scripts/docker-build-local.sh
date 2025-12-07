#!/usr/bin/env bash
# Build Docker image for local development
set -euo pipefail

echo "Building Docker image for local development..."

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Build the Docker image
docker build \
  -t submit-monolith:latest \
  -f Dockerfile \
  .

echo "Docker image built successfully: submit-monolith:latest"
echo ""
echo "To run the container in monolith mode:"
echo "  npm run docker:run-monolith"
echo ""
echo "To run the container in Lambda mode (for testing):"
echo "  npm run docker:run-lambda"
