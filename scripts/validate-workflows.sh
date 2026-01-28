#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# Validate GitHub Actions workflow syntax
#
# Usage: ./scripts/validate-workflows.sh
#
# This script validates all workflow files in .github/workflows/
# It uses actionlint if available, otherwise falls back to basic YAML validation.

set -euo pipefail

WORKFLOW_DIR=".github/workflows"
ERRORS=0

echo "=== Validating GitHub Actions Workflows ==="
echo ""

# Check if actionlint is available
if command -v actionlint &> /dev/null; then
    echo "Using actionlint for comprehensive validation..."
    echo ""

    # Run actionlint on all workflow files
    if actionlint "${WORKFLOW_DIR}"/*.yml; then
        echo ""
        echo "All workflows passed actionlint validation"
    else
        ERRORS=1
    fi
else
    echo "actionlint not found - using basic YAML validation"
    echo "For comprehensive validation, install actionlint:"
    echo "  brew install actionlint  # macOS"
    echo "  go install github.com/rhysd/actionlint/cmd/actionlint@latest  # Go"
    echo ""

    # Fall back to node-based YAML validation
    if command -v node &> /dev/null; then
        echo "Validating YAML syntax with Node.js..."
        echo ""

        for workflow in "${WORKFLOW_DIR}"/*.yml; do
            filename=$(basename "$workflow")
            if node -e "
                const fs = require('fs');
                const yaml = require('js-yaml');
                try {
                    yaml.load(fs.readFileSync('$workflow', 'utf8'));
                    console.log('  ✓ $filename');
                } catch (e) {
                    console.error('  ✗ $filename');
                    console.error('    ' + e.message);
                    process.exit(1);
                }
            " 2>/dev/null; then
                : # Success, already printed
            else
                echo "  ✗ ${filename} - YAML parse error"
                ERRORS=1
            fi
        done
    else
        echo "Neither actionlint nor Node.js available for validation"
        ERRORS=1
    fi
fi

echo ""

# Additional checks that actionlint might miss
echo "=== Additional Validation Checks ==="
echo ""

# Check for common issues
for workflow in "${WORKFLOW_DIR}"/*.yml; do
    filename=$(basename "$workflow")

    # Check for tabs (YAML should use spaces)
    if grep -q $'\t' "$workflow"; then
        echo "  ⚠ ${filename}: Contains tabs (YAML prefers spaces)"
    fi

    # Check for trailing whitespace
    if grep -q '[[:space:]]$' "$workflow"; then
        echo "  ⚠ ${filename}: Contains trailing whitespace"
    fi

    # Check for BOM (byte order mark)
    if head -c 3 "$workflow" | grep -q $'\xef\xbb\xbf'; then
        echo "  ✗ ${filename}: Contains BOM (byte order mark)"
        ERRORS=1
    fi
done

echo ""

# Summary
WORKFLOW_COUNT=$(ls -1 "${WORKFLOW_DIR}"/*.yml 2>/dev/null | wc -l | tr -d ' ')
if [ "$ERRORS" -eq 0 ]; then
    echo "=== SUCCESS: ${WORKFLOW_COUNT} workflow(s) validated ==="
    exit 0
else
    echo "=== FAILED: Workflow validation errors found ==="
    exit 1
fi
