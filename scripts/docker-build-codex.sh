#!/usr/bin/env bash
# Usage: ./scripts/docker-build-codex.sh

docker build -f .codex/Dockerfile -t codexsh:latest .
docker build -f .codex/Dockerfile -t codexw:latest .
