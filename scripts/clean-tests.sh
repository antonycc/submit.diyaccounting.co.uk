#!/usr/bin/env bash
rm -rf target
rm -rvf submit*.log
rm -rvf minio*.log
rm -rf cdk-submit-environment.out
rm -rf cdk-submit-application.out
rm -rf cdk-submit-delivery.out
git restore web/public/submit.deployment web/public/submit.env || true
