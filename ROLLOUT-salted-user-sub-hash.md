# Rollout: Salted User Sub Hashing

This document describes the steps to roll out the salted user sub hashing feature.

## Overview

This change migrates from unsalted SHA-256 hashing to HMAC-SHA256 with a persistent, environment-specific salt stored in AWS Secrets Manager.

**Security Benefits:**
- Rainbow table resistance
- Environment isolation (different environments have different salts)
- Breach containment

## Pre-Deployment Checklist

- [ ] No live data exists in the affected DynamoDB tables (confirmed by user)
- [ ] Review all code changes in this PR
- [ ] Ensure unit tests pass locally: `npm test`

## Deployment Steps

### Step 1: Deploy to CI Environment First

1. **Push the branch to trigger CI deployment:**
   ```bash
   git push origin <branch-name>
   ```

2. **Verify salt secret was created:**
   ```bash
   aws secretsmanager describe-secret \
     --secret-id "ci/submit/user-sub-hash-salt" \
     --region eu-west-2
   ```

   Expected: Secret exists with tags `Purpose=user-sub-hashing`, `Critical=true`

3. **Run tests against CI environment:**
   ```bash
   npm run test:behaviour-proxy
   ```

### Step 2: Manual CDK Update (Required)

The CDK stacks are written in Java and need manual updates to grant Lambda functions access to the salt secret. Add the following IAM policy to all Lambda functions that use `hashSub`:

**Files to modify in `infra/main/java/co/uk/diyaccounting/submit/stacks/`:**

1. **AccountStack.java** - Add after DynamoDB grants:
   ```java
   // Grant access to user sub hash salt secret
   String saltSecretArn = String.format(
       "arn:aws:secretsmanager:%s:%s:secret:%s/submit/user-sub-hash-salt*",
       props.region(), props.account(), props.envName()
   );
   this.bundleGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
       .effect(Effect.ALLOW)
       .actions(List.of("secretsmanager:GetSecretValue"))
       .resources(List.of(saltSecretArn))
       .build());
   // Add to bundlePostLambda, bundleDeleteLambda, and their workers
   ```

2. **AuthStack.java** - Add for cognitoTokenPostLambda and customAuthorizerLambda

3. **HmrcStack.java** - Add for:
   - hmrcTokenPostLambda
   - hmrcVatReturnPostLambda (and worker)
   - hmrcVatObligationGetLambda (and worker)
   - hmrcVatReturnGetLambda (and worker)
   - receiptGetLambda

### Step 3: Deploy CDK Changes

After updating the Java CDK code:

```bash
./mvnw clean verify -DskipTests
cd cdk-application
npx cdk deploy --all --require-approval never
```

### Step 4: Verify Deployment

1. **Test a Lambda function:**
   ```bash
   # Invoke bundle get endpoint and check logs
   curl -X GET https://<deployment-url>/api/v1/bundle \
     -H "Authorization: Bearer <token>"
   ```

2. **Check CloudWatch Logs for salt initialization:**
   - No errors about "Salt not initialized"
   - No errors about Secrets Manager access denied

### Step 5: Deploy to Production

1. **Merge to main branch:**
   ```bash
   git checkout main
   git merge <branch-name>
   git push origin main
   ```

2. **Verify production salt secret:**
   ```bash
   aws secretsmanager describe-secret \
     --secret-id "prod/submit/user-sub-hash-salt" \
     --region eu-west-2
   ```

3. **Monitor for errors in CloudWatch**

## Rollback Plan

If issues occur after deployment:

1. **Revert the code changes:**
   ```bash
   git revert <commit-sha>
   git push origin main
   ```

2. **The salt secret can remain** - it's not referenced by the reverted code

3. **No data migration needed** since there's no live data

## Files Changed

| File | Change |
|------|--------|
| `.github/workflows/deploy-environment.yml` | Add salt secret creation step |
| `app/services/subHasher.js` | Switch to HMAC-SHA256 with salt initialization |
| `app/functions/account/bundleGet.js` | Add `initializeSalt()` call |
| `app/functions/account/bundlePost.js` | Add `initializeSalt()` calls (ingest + worker) |
| `app/functions/account/bundleDelete.js` | Add `initializeSalt()` calls (ingest + worker) |
| `app/functions/auth/cognitoTokenPost.js` | Add `initializeSalt()` call |
| `app/functions/auth/customAuthorizer.js` | Add `initializeSalt()` call |
| `app/functions/hmrc/hmrcTokenPost.js` | Add `initializeSalt()` call |
| `app/functions/hmrc/hmrcReceiptGet.js` | Add `initializeSalt()` call |
| `app/functions/hmrc/hmrcVatReturnPost.js` | Add `initializeSalt()` calls (ingest + worker) |
| `app/functions/hmrc/hmrcVatObligationGet.js` | Add `initializeSalt()` calls (ingest + worker) |
| `app/functions/hmrc/hmrcVatReturnGet.js` | Add `initializeSalt()` calls (ingest + worker) |
| `.env.proxy` | Add `USER_SUB_HASH_SALT` for local development |
| `.env.test` | Add `USER_SUB_HASH_SALT` for unit tests |
| `app/unit-tests/services/subHasher.test.js` | Update tests for salted hashing |

## Salt Management

### Backup Recommendations

The salt is critical for data access. If lost, all hashed user data becomes orphaned.

1. **AWS Secrets Manager provides:**
   - Automatic encryption at rest
   - Versioning
   - 30-day recovery window after deletion

2. **Additional safeguards (recommended):**
   - Export salt to secure offline storage after first deployment
   - Document in runbook: "If salt is lost, all user data becomes inaccessible"

### Stack Teardown/Redeploy

The salt survives stack teardown because:
1. Salt creation is conditional (only if it doesn't exist)
2. Secrets Manager secrets are independent of CDK/CloudFormation stacks

### Disaster Recovery

When recovering from backup:
1. Ensure salt secret exists in target region
2. Restore DynamoDB tables from backup
3. Deploy application - it reads existing salt
4. Data access works because `HMAC(sub, same_salt)` is deterministic

## Troubleshooting

### "Salt not initialized" Error

**Cause:** Lambda doesn't have permission to read the salt secret, or secret doesn't exist.

**Fix:**
1. Verify secret exists: `aws secretsmanager describe-secret --secret-id "{env}/submit/user-sub-hash-salt"`
2. Check Lambda IAM role has `secretsmanager:GetSecretValue` permission
3. Ensure `ENVIRONMENT_NAME` environment variable is set correctly in Lambda

### "Access Denied" from Secrets Manager

**Cause:** Lambda IAM role missing permission.

**Fix:** Add policy statement granting `secretsmanager:GetSecretValue` on the salt secret ARN.

### Hash Mismatch After Redeploy

**Cause:** Salt was recreated (new random value) instead of preserved.

**Prevention:** The workflow checks if secret exists before creating. If you see this, the secret was manually deleted.

**Recovery:** If you have a backup of the old salt, update the secret value. Otherwise, data is orphaned.
