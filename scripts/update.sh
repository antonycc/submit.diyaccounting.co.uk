#!/usr/bin/env bash
# scripts/update.sh
# Usage: ./scripts/update.sh
#
# This file is part of the Example Suite for `agentic-lib` see: https://github.com/xn-intenton-z2a/agentic-lib
# This file is licensed under the MIT License. For details, see LICENSE-MIT
#

rm -f package-lock.json
rm -rf node-modules
rm -rf cdk-submit-application.out
rm -rf cdk-submit-delivery.out
npm install
npm run update-to-greatest
npm update
npm upgrade
npm install
npm run build
npm link
