#!/usr/bin/env bash
# scripts/cdk-clean.sh
# Usage: ./scripts/cdk-clean.sh

# Node clean and build
if [[ -e 'package.json' ]]; then
  rm -rf build
  rm -rf coverage
  rm -rf dist
  rm -rf node_modules
  rm -rf package-lock.json
  npm install
  npm run build
  npm link
fi

# CDK clean and build
if [[ -e 'pom.xml' ]]; then
  rm -rf target
  rm -rf cdk.out
  mvn clean package
  cdk synth
fi
