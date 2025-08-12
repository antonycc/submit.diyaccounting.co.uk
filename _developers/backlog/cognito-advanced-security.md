## Goals

- **Upgrade Cognito** – set the user pool’s `featurePlan` to `PLUS`, enabling advanced security features and log delivery.  Configure `CfnUserPoolLogDeliveryConfiguration` to stream user‑auth events and user‑notification errors to CloudWatch Logs:contentReference[oaicite:37]{index=37}.
- **Add new storage** – create S3 prefixes for receipts and grants or a DynamoDB table for grants.  Ensure encryption at rest, proper access policies and deterministic naming based on the environment.
- **Add new Lambdas** – define functions for all new endpoints (catalog, entitlements, bundle requests, VAT operations, self‑employment operations, receipt listing) with appropriate roles, environment variables and tracing.
- **Enhance CloudTrail and X‑Ray** – ensure that when `cloudTrailEnabled` is true, all S3 buckets and DynamoDB tables have object‑level logging.  Ensure every Lambda sets `.tracing(Tracing.ACTIVE)` when `xRayEnabled` is true:contentReference[oaicite:38]{index=38}.
- **Expose new outputs and configuration** – add environment variables and CloudFormation outputs for new resources in `WebApp.java`, making it easy to reference the grants table, receipts prefix, and Cognito domains.

## Current state

`WebApp.java` and `WebStack.java` create an S3 origin bucket, CloudFront distribution, a Cognito user pool with a Google IdP, optional CloudTrail and X‑Ray, and several Lambdas for VAT submission and auth.  There is no DynamoDB table or receipts/grants prefixes.  Cognito uses the default feature plan and no log delivery; CloudTrail logs only S3 events:contentReference[oaicite:39]{index=39}.

## Implementation plan

### User pool enhancements

1. **Feature plan:** In `CognitoAuth.java`, add a property `featurePlan` to the builder.  When set to `PLUS`, the `UserPool` builder should set `.featurePlan(FeaturePlan.PLUS)`.  Remove any usage of the deprecated `advancedSecurityMode`.
2. **Log groups:** Create two CloudWatch LogGroups in CDK: `/aws/cognito/<stack>/userAuthEvents` and `/aws/cognito/<stack>/userNotification`, with retention equal to `accessLogGroupRetentionPeriodDays`.  Set removal policy to `DESTROY` for non‑prod.
3. **Log delivery:** Define a `CfnUserPoolLogDeliveryConfiguration` with log configurations for `eventSource: userAuthEvents, logLevel: INFO, logGroupArn: userAuthLogGroupArn` and `eventSource: userNotification, logLevel: ERROR, logGroupArn: notificationLogGroupArn`.  Add a dependency on the user pool.

### Storage and grants

1. **S3 prefixes:** Within the existing origin bucket, add prefixes `receipts/` and `grants/`.  Use bucket policies or per‑function IAM policies to limit access to these prefixes.
2. **DynamoDB (optional):** Create a table `bundle-grants` with partition key `sub` and sort key `bundleId`.  Use `PAY_PER_REQUEST` billing mode.  Pass the table name via environment variables to entitlements functions.  Add IAM policies for `dynamodb:GetItem`, `PutItem`, `DeleteItem` and `Query`.
3. **IAM roles:** For each Lambda, create a role with least privilege.  For entitlements, allow read/write on the grants store.  For receipts, allow list and get on the receipts prefix.  For HMRC calls, maintain the existing ability to fetch secrets and call external APIs.

### Lambdas & routes

1. Add `Function` definitions for `getCatalog`, `requestBundle`, `listReceipts`, `getReceipt`, `getVatObligations`, `getVatReturn`, `getVatLiability`, `getVatPayment`, `getVatPenalties`, `getSelfEmploymentAnnual`, `putSelfEmploymentAnnual`, etc.  Set the runtime to Node.js 18 or 20.  Pass environment variables for HMRC base URIs, stubbed data, grants table name, receipts bucket, etc.
2. Use `FunctionUrl` to expose these Lambdas publicly.  Set CORS `allowOrigins` to the site domain and `allowMethods` as appropriate.
3. If using DynamoDB, ensure each function has `AWSLambdaBasicExecutionRole` and add a policy for DynamoDB access.

### CloudTrail & X‑Ray

1. When `cloudTrailEnabled` is true, extend the existing trail to include management events and object-level events for the new S3 prefixes and DynamoDB table.  Use `Trail.addS3EventSelector` and `Trail.addDynamoDbEventSelector`.
2. For each Lambda, set `.tracing(Tracing.ACTIVE)` when `xRayEnabled` is true.  For Docker-based Lambdas, ensure the `AWS_XRAY_TRACING_NAME` environment variable is set; the existing builder does this.
3. Create log groups for each new Lambda with retention equal to the access log period.  Use a consistent naming convention.

### Environment propagation & outputs

1. In `WebApp.java`, read new environment variables (e.g. `DIY_SUBMIT_GRANTS_TABLE_NAME`, `DIY_SUBMIT_RECEIPTS_BUCKET_PREFIX`, `COGNITO_FEATURE_PLAN`) and pass them to `WebStack`.  Default the feature plan to `ESSENTIALS` if unspecified.
2. In `WebStack.Builder`, add properties for these values.  Use them when constructing resources.
3. Add `CfnOutput`s for the grants table name, receipts prefix, Cognito domain, and log group names.  This aids diagnostics and cross‑stack references.

### Optional enhancements

- **EventBridge:** Emit events (e.g. `BundleRequested`, `VatReturnSubmitted`) to EventBridge.  Use CDK to create a bus and rules for downstream processing (notifications, analytics).
- **Step Functions:** For complex flows like bridging spreadsheets to HMRC, orchestrate with Step Functions and call Lambdas or integration patterns.

## Testing & verification

1. **Infrastructure unit tests:** Use CDK assertions to verify that resources are created when flags are enabled.  Test that the user pool has `FeaturePlan` set to `PLUS` and that log delivery configuration exists.
2. **Deployment tests:** Run `cdk synth` and `cdk deploy` in a dev environment.  After deployment, use AWS CLI or SDK to confirm that:
    - LogGroups for Cognito log delivery exist and receive events.
    - DynamoDB table and S3 prefixes are created.
    - New Function URLs are reachable and return expected responses.
3. **Integration tests:** Test that grants stored in DynamoDB or S3 are accessible via the entitlements service.  Verify that CloudTrail logs show object-level events when enabled.
4. **X‑Ray checks:** Trigger each Lambda and ensure traces appear in the X‑Ray console when `xRayEnabled` is true.
5. **Repeat cycles:** Deploy changes incrementally.  Test in dev, fix issues, then deploy to stage and prod.  Use `cdk diff` to verify changes.  Run the full test suite (unit, integration, Playwright) after each infrastructure update.

## HMRC context

Enabling Cognito’s Plus plan costs $0.02 per monthly active user but provides advanced security features and exports user‑auth logs to CloudWatch:contentReference[oaicite:40]{index=40}.  Combined with CloudTrail and X‑Ray, this satisfies audit requirements and aids debugging.  Storing grants in DynamoDB and receipts in S3 positions the platform for scale as more users adopt MTD.
