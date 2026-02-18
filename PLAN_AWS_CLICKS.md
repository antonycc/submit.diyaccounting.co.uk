  ---
Phase 1.0: Your AWS console walkthrough

Everything below happens in the AWS console or CLI, logged into 887764105431.

Step 1: Enable AWS Organizations

1. Sign into 887764105431 at https://console.aws.amazon.com
2. Go to AWS Organizations → Create an organization
3. Select Enable all features (not just consolidated billing)
4. This makes 887764105431 the management account — permanent, cannot be changed later

Verify:

aws organizations describe-organization

```
~ $ aws organizations describe-organization
{
    "Organization": {
        "Id": "o-614gdfrqvk",
        "Arn": "arn:aws:organizations::887764105431:organization/o-614gdfrqvk",
        "FeatureSet": "ALL",
        "MasterAccountArn": "arn:aws:organizations::887764105431:account/o-614gdfrqvk/887764105431",
        "MasterAccountId": "887764105431",
        "MasterAccountEmail": "admin@diyaccounting.co.uk",
        "AvailablePolicyTypes": [
            {
                "Type": "SERVICE_CONTROL_POLICY",
                "Status": "ENABLED"
            }
        ]
    }
}
~ $
```

Step 2: Create Organizational Units

In Organizations → AWS accounts → click Root:

1. Actions → Create new → Name: Workloads
2. Actions → Create new → Name: Backup

You now have:

Root
├── Workloads (empty)
└── Backup (empty)

```

Backup
ou-hkwr-023or27q
This resource is empty

Workloads
ou-hkwr-duyzaini
This resource is empty

DIY Accounting Limited
management account
887764105431
  |
admin@diyaccounting.co.uk
Organization ID
o-614gdfrqvk
```


887764105431 itself sits at Root level (not in any OU) — this is correct for the management account.

Step 3: Create member accounts

From Organizations → Add an AWS account → Create an AWS account:

┌───────┬──────────────────┬──────────────────────────────────────┬────────────┐
│ Order │   Account name   │                Email                 │ Move to OU │
├───────┼──────────────────┼──────────────────────────────────────┼────────────┤
│ 1     │ gateway          │ admin+aws-gateway@diyaccounting.co.uk      │ Workloads  │
├───────┼──────────────────┼──────────────────────────────────────┼────────────┤
│ 2     │ spreadsheets     │ admin+aws-spreadsheets@diyaccounting.co.uk │ Workloads  │
├───────┼──────────────────┼──────────────────────────────────────┼────────────┤
│ 3     │ submit-ci        │ admin+aws-submit-ci@diyaccounting.co.uk           │ Workloads  │
├───────┼──────────────────┼──────────────────────────────────────┼────────────┤
│ 4     │ submit-prod      │ admin+aws-submit-prod@diyaccounting.co.uk         │ Workloads  │
├───────┼──────────────────┼──────────────────────────────────────┼────────────┤
│ 5     │ submit-backup    │ admin+aws-submit-backup@diyaccounting.co.uk       │ Backup     │
└───────┴──────────────────┴──────────────────────────────────────┴────────────┘

Each creation takes ~60 seconds. After each one appears, select it → Actions → Move → choose the OU.

Email note: These emails receive root account recovery. They must be real addresses you control. If you use Gmail, antony+aws-gateway@gmail.com etc. works
(Gmail ignores the + suffix). Otherwise you need 5 distinct addresses.

After all created, verify:

aws organizations list-accounts --query 'Accounts[*].[Name,Id,Status]' --output table

```
~ $ aws organizations list-accounts --query 'Accounts[*].[Name,Id,Status]' --output table
------------------------------------------------------
|                    ListAccounts                    |
+-------------------------+----------------+---------+
|  submit-backup          |  914216784828  |  ACTIVE |
|  spreadsheets           |  064390746177  |  ACTIVE |
|  submit-ci              |  367191799875  |  ACTIVE |
|  DIY Accounting Limited |  887764105431  |  ACTIVE |
|  gateway                |  283165661847  |  ACTIVE |
|  submit-prod            |  972912397388  |  ACTIVE |
+-------------------------+----------------+---------+
~ $
```

Record the account IDs — you'll need them for everything that follows.

Step 4: Enable IAM Identity Center

1. Go to IAM Identity Center (search for it in the console)
2. Click Enable
3. Verify region is eu-west-2 (London) — this cannot be changed after enabling
4. Identity source: keep Identity Center directory (default) — simplest for solo use

Step 5: Create your SSO user

In IAM Identity Center → Users → Add user:
- Username: antony
- Email: antony@diyaccounting.co.uk
- First/Last name as you like
- Click through — you'll get an email to set password

Step 6: Create permission sets

In IAM Identity Center → Permission sets → Create permission set:

┌─────────────────────┬──────────────────────────────────┬──────────────────┐
│   Permission set    │               Type               │ Session duration │
├─────────────────────┼──────────────────────────────────┼──────────────────┤
│ AdministratorAccess │ Predefined → AdministratorAccess │ 8 hours          │
├─────────────────────┼──────────────────────────────────┼──────────────────┤
│ ReadOnlyAccess      │ Predefined → ReadOnlyAccess      │ 4 hours          │
└─────────────────────┴──────────────────────────────────┴──────────────────┘

(You can add more later. Start with these two.)

Step 7: Assign your user to all accounts

In IAM Identity Center → AWS accounts:

1. Select all 6 accounts (887764105431 + the 5 new ones)
2. Assign users or groups → select antony
3. Select both permission sets (AdministratorAccess + ReadOnlyAccess)
4. Submit

Wait ~1 minute for propagation.

Step 8: Bookmark and test your portal

https://d-9c67480c02.awsapps.com/start/

1. IAM Identity Center → Settings → copy the AWS access portal URL (format: https://d-XXXXXXXXXX.awsapps.com/start)
2. Open it in a new browser tab
3. Log in with your new SSO credentials
4. You should see all 6 accounts listed
5. Click any account → AdministratorAccess → Management console
6. Verify you land in the right account (check account ID in top-right corner)

Step 9: Set up CLI SSO profiles

aws configure sso

When prompted:
- SSO session name: diyaccounting
- SSO start URL: (paste your portal URL)
- SSO Region: eu-west-2

It opens a browser — authenticate, then pick an account/role. Repeat for each account. Or just edit ~/.aws/config directly — I'll give you the block once
you have the account IDs.

```
~ % aws configure sso
SSO session name (Recommended): diyaccounting
SSO start URL [None]: https://d-9c67480c02.awsapps.com/start/
SSO region [None]: eu-west-2
SSO registration scopes [sso:account:access]:
Attempting to open your default browser.
If the browser does not open, open the following URL:

https://oidc.eu-west-2.amazonaws.com/authorize?response_type=code&client_id=7J29JPLdPNG8NIQeCp7O1mV1LXdlc3QtMg&redirect_uri=http%3A%2F%2F127.0.0.1%3A51479%2Foauth%2Fcallback&state=e799a359-54ea-4b6f-bf38-07d550102bb6&code_challenge_method=S256&scopes=sso%3Aaccount%3Aaccess&code_challenge=65YNECyBDbpvAmujUOkW7PuhflFSyWLOP3qpqADN4rk
There are 6 AWS accounts available to you.
Using the account ID 887764105431
There are 2 roles available to you.
Using the role name "AdministratorAccess"
Default client Region [eu-west-2]:
CLI default output format (json if not specified) [None]:
Profile name [AdministratorAccess-887764105431]:
To use this profile, specify the profile name using --profile, as shown:

aws sts get-caller-identity --profile AdministratorAccess-887764105431
~ %
```


  ---
What happens next

Once you have the 6 accounts and SSO working, give me the account IDs and I can:
- Fill them into the scripts (which should be done by then)
- Update the CDK context and workflows
- Start Phase 1.1 (gateway to its own account — the simplest migration)

The whole Phase 1.0 above is roughly 30-60 minutes of clicking. The slowest part is account creation (if AWS makes you wait between creates — there's
sometimes a 1-per-minute rate limit on new orgs).

---

Phase 1.0 is complete. ✅

---

Phase 1.1: Gateway to its own account (283165661847)

Step 1.1.1-1.1.5: Bootstrap ✅

```bash
aws sso login --sso-session diyaccounting
./scripts/aws-accounts/bootstrap-account.sh \
  --account-id 283165661847 \
  --account-name gateway \
  --profile gateway
```

Results:
- CDK bootstrap: us-east-1 ✅, eu-west-2 ✅
- OIDC provider: ✅
- gateway-github-actions-role: ✅ (hit IAM propagation race — fixed with 10s sleep)
- gateway-deployment-role: ✅
- Bootstrap script bugs fixed: `${VAR^^}` (Bash 4+ only, macOS has 3.2) → `tr` replacement

Step 1.1.6: ACM certificate ✅

```
arn:aws:acm:us-east-1:283165661847:certificate/18008e08-0475-4ba0-8516-834fd5f447d9
```

SANs: ci-gateway.diyaccounting.co.uk, prod-gateway.diyaccounting.co.uk, diyaccounting.co.uk, www.diyaccounting.co.uk
DNS validation CNAMEs added to 887764105431 Route53 zone. All validated (ISSUED).

Step 1.1.7: GitHub variables ✅

Added as **variables** (not secrets — these are identifiers, not credentials):
- `GATEWAY_ACCOUNT_ID=283165661847`
- `GATEWAY_ACTIONS_ROLE_ARN=arn:aws:iam::283165661847:role/gateway-github-actions-role`
- `GATEWAY_DEPLOY_ROLE_ARN=arn:aws:iam::283165661847:role/gateway-deployment-role`
- `GATEWAY_CERTIFICATE_ARN=arn:aws:acm:us-east-1:283165661847:certificate/18008e08-0475-4ba0-8516-834fd5f447d9`

Step 1.1.8-1.1.9: Code changes ✅

- `deploy-gateway.yml`: Role ARNs from `vars.GATEWAY_*`, cert ARN from `vars.GATEWAY_CERTIFICATE_ARN`
- `cdk-gateway/cdk.json`: Cleared hardcoded cert ARN (now comes from env var)

Step 1.1.10: Deploy gateway CI to new account ✅

First attempt failed: S3 bucket `ci-gateway-origin` already exists (globally unique names collide across accounts).
Fix: Removed hardcoded `.bucketName()` from all stacks (see S3 bucket rename impact below).
Old CI stack in 887764105431 deleted, then fresh deploy to 283165661847 succeeded (~29 min for new CloudFront distribution).

Step 1.1.11: Validate gateway CI ✅

`deploy-root.yml` auto-lookup could not find `ci-gateway-GatewayStack` (it's in 283165661847, not 887764105431) and **deleted** the ci-gateway DNS records. Re-ran with manual override: `ci-gateway-cloudfront-domain=de9dto3k3vhcf.cloudfront.net`. Tests pass.

**Lesson learned**: `deploy-root.yml` must always use manual overrides for services that have moved to other accounts. The auto-lookup only works within 887764105431.

Step 1.1.12-1.1.13: DNS cutover and re-validation ✅ (done as part of 1.1.11)

Step 1.1.14-1.1.17: Prod gateway migration ✅

1. First attempt hit CNAME collision (`diyaccounting.co.uk`, `www.diyaccounting.co.uk`, `prod-gateway.diyaccounting.co.uk` still attached to old CloudFront in 887764105431). Deleted old `prod-gateway-GatewayStack` from 887764105431 first.
2. Deleted failed ROLLBACK_COMPLETE stack from 283165661847, re-deployed. New CloudFront: `dnloza7zl3wfi.cloudfront.net`
3. `deploy-root.yml` with manual overrides: `prod-gateway-cloudfront-domain=dnloza7zl3wfi.cloudfront.net`, `apex-cloudfront-domain=dnloza7zl3wfi.cloudfront.net`, `www-cloudfront-domain=dnloza7zl3wfi.cloudfront.net`, `ci-gateway-cloudfront-domain=de9dto3k3vhcf.cloudfront.net`
4. Validated: `npm run test:gatewayBehaviour-prod` — 7/7 passed against `https://diyaccounting.co.uk`

**Phase 1.1 complete.** Gateway (CI + prod) fully migrated to 283165661847. ✅

---

S3 bucket rename impact

Hardcoded S3 bucket names were removed from all 7 stacks to prevent collisions during account migration. CDK now auto-generates unique names. This affects deployments as follows:

**Deploying to NEW accounts (fresh deploy — no issues):**
Stacks create new buckets with CDK-generated names. No collision because no pre-existing resources.

**Redeploying to 887764105431 (existing stacks — DESTRUCTIVE):**
CloudFormation sees the bucket name property changed from explicit to auto-generated. This triggers bucket REPLACEMENT (delete old + create new). Data in the old bucket is lost.

| Stack | Old bucket name | Impact on redeploy to 887764105431 | When we hit it |
|-------|----------------|-------------------------------------|----------------|
| GatewayStack | `{env}-gateway-origin` | Bucket replaced. Static content re-synced by BucketDeployment. **No data loss** (content is in git). | Phase 1.1 — old CI stack deleted manually before deploying to new account. Prod stack stays untouched until DNS cutover. |
| SpreadsheetsStack | `{env}-spreadsheets-origin` | Bucket replaced. Static content + package zips re-synced. **No data loss** (content is in git/build). | Phase 1.2 — same pattern: delete old CI stack, deploy fresh to new account. |
| ApexStack | `{env}-...-holding-us-east-1` | Bucket replaced. Holding page content re-synced. **No data loss**. | Phase 1.3/1.4 — deploys fresh to submit-ci/submit-prod. Old stacks in 887764105431 untouched until teardown. |
| EdgeStack | `{deployment}-...-origin-us-east-1` | Bucket replaced. Web content re-synced by PublishStack. **No data loss**. Cross-stack ref fixed: PublishStack and SelfDestructStack now receive bucket name as a prop from SubmitApplication instead of via sharedNames. | Phase 1.3/1.4 — deploys fresh to submit-ci/submit-prod. |
| BackupStack | `{deployment}-...-backup-exports` | Bucket replaced. **DynamoDB export data in the bucket is lost.** Acceptable: exports are derived from DynamoDB tables (which have PITR). | Phase 1.3/1.4 — deploys fresh. |
| OpsStack | `{prefix}-canary-artifacts` | Bucket replaced. **14-day canary screenshots lost.** Acceptable: operational data only. | Phase 1.3/1.4 — deploys fresh. |
| ObservabilityStack | `{prefix}-cloudtrail-logs` | Bucket replaced. **CloudTrail logs lost.** Acceptable: logs are operational, not compliance-critical during migration. | Phase 1.3/1.4 — deploys fresh. |

**Key safety rule: Do NOT redeploy submit stacks to 887764105431 from the `accounts` branch.**
The bucket rename changes are safe for new accounts but destructive for existing stacks. Keep 887764105431 deployments on `main` (which still has the old hardcoded names) until Phase 1.3/1.4 migration is complete and old stacks are being torn down.
