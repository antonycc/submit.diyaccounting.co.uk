#!/usr/bin/env bash
# Usage: ./scripts/provision-user.sh
# Purpose: Provision a test user in the Cognito user pool for DIY submit testing
# Example (running behaviour tests against the ci environment with a freshly provisioned user):
#  $ . ./scripts/aws-assume-user-provisioning-role.sh
#  $ . ./scripts/provision-user.sh
#  $ cp '.env.ci' '.env.proxy' ; npx dotenv -e '.env.ci' -- npm run test:behaviour
# Provisioning user 72db57b6-68dc-4274-a14a-a91be209a1b1 in table oidc-antonycc-com-prod-users
# created 72db57b6-68dc-4274-a14a-a91be209a1b1
export DIY_SUBMIT_TEST_AUTH_USERNAME=$(uuidgen | tr '[:upper:]' '[:lower:]')
export DIY_SUBMIT_TEST_AUTH_PASSWORD=$(uuidgen | tr '[:upper:]' '[:lower:]')
set | grep 'DIY_SUBMIT_TEST_AUTH_' | sort | tac
node app/bin/provision-user.mjs oidc-antonycc-com-prod-users ${DIY_SUBMIT_TEST_AUTH_USERNAME} ${DIY_SUBMIT_TEST_AUTH_PASSWORD}
