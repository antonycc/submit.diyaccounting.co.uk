#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2025 DIY Accounting Limited
# SPDX-License-Identifier: MIT
#
# Battery Pack CLI wrapper
# Usage: ./scripts/battery-pack.sh <command> [args]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

exec node "$PROJECT_ROOT/app/lib/battery-pack/cli.js" "$@"
