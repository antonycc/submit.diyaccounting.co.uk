#!/usr/bin/env bash
rm -rvf target
rm -rvf coverage
rm -rvf cdk-submit-environment.out
rm -rvf cdk-submit-application.out
rm -rvf dependency-reduced-pom.xml
rm -rvf hmrc-test-user.json
rm -rvf node_modules
rm -rvf package-lock.json
./mvnw clean compile
npm install
git restore web/public/submit.deployment web/public/submit.env || true
