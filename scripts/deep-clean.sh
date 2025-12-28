#!/usr/bin/env bash
# scripts/deep-clean.sh
# Usage: ./scripts/deep-clean.sh
#

./scripts/clean-tests.sh

# Node clean build and test
rm -rf build
rm -rf coverage
rm -rf dist
rm -rf node_modules
rm -rf package-lock.json
npm install
npm test

# Shut down any running Docker containers then remove any images
docker system prune --all --force --volumes

# Java/CDK clean
rm -rf target
rm -rf cdk.out
rm -rf cdk-submit-*.out
rm -rf cdk.log
rm -rf ~/.m2/repository
rm -rf .aws-sam
npm run build
git restore web/public/submit.deployment-name.txt web/public/submit.environment-name.txt || true
