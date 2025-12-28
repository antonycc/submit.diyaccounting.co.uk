#!/usr/bin/env bash
rm -rf target ;
rm -rf coverage ;
rm -rvf cdk-submit-environment.out ;
rm -rvf cdk-submit-application.out ;
rm -rvf dependency-reduced-pom.xml ;
rm -rvf hmrc-test-user.json ;
./mvnw clean compile -DskipTests ;
npm install ;
git restore web/public/submit.deployment-name.txt web/public/submit.environment-name.txt || true ;
