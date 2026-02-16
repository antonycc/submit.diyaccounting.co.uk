# AWS Monthly Cost Estimate

**Last updated:** February 2026
**Region:** eu-west-2 (London) + us-east-1 (edge)
**Account:** submit-prod (887764105431)

---

## Production Environment (24/7, 720 hours)

| Resource | Details | $/month |
|---|---|---:|
| **Lambda Provisioned Concurrency** | 5 functions x 1 PC x 256MB, 24/7 | **$13.50** |
| **CloudWatch** | ~20 alarms ($2), 1 dashboard ($3), RUM ($1), logs ~2GB ($1) | **$7** |
| **WAF WebACL** | 1 ACL ($5) + 3 rules ($3) + ~1M requests ($0.60) | **$9** |
| **CloudFront** | 5 distributions, low traffic (~50GB transfer) | **$5** |
| **Cognito PLUS** | ~50 MAU x $0.0375 with threat protection FULL | **$4** |
| **DynamoDB** | 11 tables, PAY_PER_REQUEST, ~1GB storage, PITR | **$3** |
| **Security Hub** | CIS Foundations benchmark checks | **$3** |
| **Secrets Manager** | ~6 secrets x $0.40 | **$2.50** |
| **KMS** | 2 keys x $1 | **$2** |
| **GuardDuty** | Management events analysis | **$2** |
| **AWS Backup** | DynamoDB daily/weekly/monthly to vault | **$2** |
| **CloudWatch Synthetics** | 2 canaries x every 51min = ~847 runs each | **$2** |
| **Route53** | 2 hosted zones + queries | **$1.50** |
| **ECR** | 2 repos, ~5GB images | **$1** |
| **S3** | ~9 buckets, minimal storage | **$1** |
| **API Gateway HTTP API** | ~50K requests | **$1** |
| **Lambda on-demand** | ~10K invocations, ~5K GB-seconds | **$0.50** |
| **CloudTrail** | 1 trail (free) + DynamoDB data events | **$1** |
| **SQS/SNS/EventBridge** | All within free tier at this volume | **$0** |
| | **Production subtotal** | **~$61** |

### Provisioned Concurrency Detail

5 out of 28 Lambda functions have PC=1 at 256MB:

| Lambda | Stack | PC | Configured | Peak Used | Avg Used | Avg Duration |
|--------|-------|----|---:|---:|---:|---:|
| cognitoTokenPost | AuthStack | 1 | 256 MB | 155 MB | 146 MB | 546 ms |
| customAuthorizer | AuthStack | 1 | 256 MB | 112 MB | 111 MB | 37 ms |
| bundleGet | AccountStack | 1 | 256 MB | 136 MB | 128 MB | 40 ms |
| hmrcTokenPost | HmrcStack | 1 | 256 MB | 151 MB | 150 MB | 295 ms |
| hmrcVatReturnPost (ingest) | HmrcStack | 1 | 256 MB | 159 MB | 150 MB | 423 ms |

Memory and duration measured from CloudWatch Logs Insights (prod, 7-day window
ending Feb 16 2026). Peak usage is 159MB against 256MB (62% utilisation).
These functions are I/O-bound (DynamoDB, HMRC API, Cognito, SQS) so the reduced
CPU at 256MB (~14.5% of a vCPU) has negligible impact on execution time. Cold
starts are irrelevant — PC keeps them always warm.

The remaining 23 functions (13 sync + 5 async ingest + 5 async worker) use
PC=0 and stay at 1024MB to keep cold starts reasonable for Docker-based Lambdas.

Formula: 5 x 0.25 GB x 2,592,000 s/month x $0.0000041667/GB-s = **$13.50/month**

### Synthetics Canary Detail

2 canaries (health check + API check) run every 51 minutes. This is close to
hourly but avoids clock-aligned gaps — every 60-minute window is guaranteed to
contain at least one check. CloudWatch Synthetics accepts any positive integer
for the `rate()` interval.

Formula: 2 x (30 x 24 x 60 / 51) runs x $0.0012/run = **$2.03/month**

---

## CI Environment Stacks (24/7 baseline)

These duplicate per-environment resources but share account-level services
(GuardDuty, Security Hub, CloudTrail, ECR) with production.

| Resource | Details | $/month |
|---|---|---:|
| DynamoDB | 11 tables, near-zero traffic | $1 |
| Cognito PLUS | ~5 MAU (test users) | $1 |
| KMS | 2 keys | $2 |
| CloudWatch | Dashboard, RUM, env-level logs | $4 |
| AWS Backup | Minimal backup storage | $1 |
| Apex/Simulator CloudFront | Low traffic | $1 |
| | **CI env subtotal** | **~$10** |

---

## CI Application Stacks (actuals from Jan 16 - Feb 16 2026)

### Deployment Activity

Data from `deploy.yml` workflow runs over 30 days:

| Metric | Count |
|--------|------:|
| Total workflow runs | 192 |
| Main branch runs | 36 (15 success, 12 failure, 9 cancelled) |
| Feature branch runs | 156 (38 success, 40 failure, 76 cancelled) |
| Distinct feature branches | 23 |

### Stack-Hours Calculation

Every feature branch run (success, failure, or cancelled) is assumed to have
deployed far enough to create the full app stack. Each run resets a 2-hour
self-destruct timer. Overlapping runs on the same branch share the same stack
window.

| Branch | Runs | Windows | Stack-Hours |
|--------|-----:|--------:|------------:|
| eventandpayment | 14 | 6 | 16.3 |
| claude/ux-fixes-jane-feedback | 13 | 5 | 13.6 |
| second-pass | 21 | 2 | 10.0 |
| nvsubhash | 11 | 3 | 8.0 |
| cleanup | 15 | 1 | 7.8 |
| rootdns | 8 | 3 | 7.7 |
| headers3 | 8 | 1 | 7.6 |
| claude/pre-golive-fixes | 17 | 1 | 7.6 |
| gateway | 8 | 1 | 6.1 |
| leanbuild | 6 | 2 | 5.9 |
| simtest | 8 | 1 | 5.7 |
| refresh | 6 | 1 | 5.6 |
| compy | 7 | 1 | 5.2 |
| refresf | 3 | 2 | 4.4 |
| activate | 2 | 1 | 3.6 |
| hiding | 2 | 1 | 2.3 |
| sub-hash-versioning | 1 | 1 | 2.0 |
| qaprep | 1 | 1 | 2.0 |
| fixbridge | 1 | 1 | 2.0 |
| fixpay | 1 | 1 | 2.0 |
| cognitnow | 1 | 1 | 2.0 |
| login | 1 | 1 | 2.0 |
| claude/paypal-return-flow | 1 | 1 | 2.0 |
| **TOTAL** | **156** | **39** | **131.4** |

"Windows" = distinct create/destroy cycles (gap of >2h between runs starts a
new window). The 156 runs across 23 branches produced 39 stack lifecycles
totalling 131.4 stack-hours.

### CI App Stack Cost (131.4 stack-hours)

Each stack deploys Auth, HMRC, Account, Billing, Api, Ops, Edge, Publish,
and SelfDestruct.

| Resource | Calculation | $/month |
|---|---|---:|
| **Lambda PC** | 5 x 0.25GB x 131.4h x 3600s x $0.0000041667/GB-s | **$2.46** |
| **WAF** | $9/month x (131.4h / 720h) prorated | **$1.64** |
| **CloudWatch** | Alarms + logs for 131.4h across 39 lifecycles | **$1.00** |
| **CloudFront** | Test traffic only | **$0.50** |
| **Lambda invocations** | Test suites hitting the API | **$0.50** |
| **Synthetics** | 2 canaries x (131.4h x 60 / 51) runs x $0.0012 | **$0.37** |
| **API Gateway** | Test traffic | **$0.25** |
| **S3/SQS** | Minimal, ephemeral | **$0.25** |
| | **CI app subtotal** | **~$7** |

---

## Monthly Total

| Component | $/month |
|---|---:|
| Production (env + app, 24/7) | ~$61 |
| CI environment (24/7 baseline) | ~$10 |
| CI application (131.4 stack-hours, actuals) | ~$7 |
| **Grand Total** | **~$78** |

---

## Cost Scaling with Users

### Per-User Activity Model

Each active user:
- **Checks** 5 times per day (login, view bundles, check obligations/returns)
- **Submits** 2 times per week (VAT return submission)

### What One "Check" Session Triggers

| Step | Lambda Invocations | DynamoDB Ops | Notes |
|------|---:|---:|---|
| Login | 1 | 1 read | cognitoTokenPost (PC, 256MB) |
| Load bundles | 2 | 2 reads | customAuthorizer (PC, 256MB) + bundleGet (PC, 256MB) |
| Check obligations | 3 | 3 reads + 1 write | customAuthorizer (PC, 256MB) + obligationGet ingest + worker (1024MB) |
| Check return | 3 | 3 reads | customAuthorizer (PC, 256MB) + vatReturnGet ingest + worker (1024MB) |
| Session beacon | 1 | 1 write | sessionBeaconPost (1024MB) |
| **Per check session** | **~10** | **~11** | 5 at 256MB, 5 at 1024MB |

### What One "Submit" Triggers

| Step | Lambda Invocations | DynamoDB Ops | Notes |
|------|---:|---:|---|
| Auth | 1 | 1 read | customAuthorizer (PC, 256MB) |
| Submit VAT return | 2 | 5 writes + 2 reads | vatReturnPost ingest (PC, 256MB) + worker (1024MB) |
| Store receipt | 0 | 1 write | Done inside worker |
| **Per submit** | **~3** | **~9** | 2 at 256MB, 1 at 1024MB |

### Monthly Per-User Resource Consumption

| Resource | Calculation | Monthly per user |
|---|---|---:|
| Lambda invocations | (5 x 10 x 30) + (2 x 3 x 4.3) = 1,526 | 1,526 |
| Lambda GB-seconds | ~767 inv x 0.5s x 0.25GB + ~759 inv x 0.5s x 1GB = 476 | 476 GB-s |
| DynamoDB reads | 5 x 10 x 30 = 1,500 | 1,500 RRU |
| DynamoDB writes | (5 x 1 x 30) + (2 x 9 x 4.3) = 227 | 227 WRU |
| CloudFront requests | ~5 page loads/day x 30 = 150 | 150 |
| CloudFront data | 150 x 100KB | 15 MB |
| API Gateway requests | ~1,526 (same as Lambda) | 1,526 |
| CloudWatch RUM events | ~5 pages/day x 10 events x 30 | 1,500 |
| SQS messages | ~7 async ops/day x 30 | 210 |

### Marginal Cost Per User Per Month

| Resource | Rate | Per user |
|---|---|---:|
| **Cognito PLUS** | $0.0375/MAU (first 10K) | **$0.0375** |
| **CloudWatch RUM** | 1,500 events x $0.01/1K | **$0.0150** |
| **Lambda duration** | 476 GB-s x $0.0000166667 | **$0.0079** |
| **CloudFront** | 15MB x $0.085/GB + 150 req x $0.012/10K | **$0.0015** |
| **API Gateway** | 1,526 req x $1.00/1M | **$0.0015** |
| **WAF requests** | 1,526 x $0.60/1M | **$0.0009** |
| **DynamoDB reads** | 1,500 x $0.283/1M RRU | **$0.0004** |
| **DynamoDB writes** | 227 x $1.41/1M WRU | **$0.0003** |
| **Lambda requests** | 1,526 x $0.20/1M | **$0.0003** |
| **SQS** | 210 (free tier covers 1M/month) | **$0** |
| | **Total per user** | **~$0.065** |

### Scaling Table

| Active Users | User Cost | Fixed Cost | Total | % from Users |
|---:|---:|---:|---:|---:|
| 10 | $0.65 | $78 | **$79** | <1% |
| 50 | $3.25 | $78 | **$81** | 4% |
| 100 | $6.50 | $78 | **$85** | 8% |
| 500 | $33 | $78 | **$111** | 29% |
| 1,000 | $65 | $78 | **$143** | 45% |
| 2,000 | $130 | $78 | **$208** | 63% |
| 5,000 | $265 | $78 | **$343** | 77% |
| 10,000 | $390 | $78 | **$468** | 83% |

Note: Cognito drops from $0.0375 to $0.0150/MAU after 10K users,
reducing per-user cost to ~$0.04 at scale.

### Key Takeaways

- **Break-even point ~1,200 users**: Per-user costs equal fixed infrastructure costs
- **$0.065 per user per month**: Extremely cheap per-user marginal cost
- **Fixed costs dominate** until hundreds of active users
- **Cognito PLUS is the largest per-user cost** ($0.0375/MAU = 58% of per-user cost)
- Architecture scales linearly with no step-function cost jumps

---

## Top Cost Drivers

1. **Lambda Provisioned Concurrency ($16)** - 20% of total. Five always-warm functions at 256MB each.
2. **WAF ($11)** - 14%. Fixed monthly cost for WebACL + 3 managed rules (prod + CI prorated).
3. **CI environment baseline ($10)** - 13%. DynamoDB, Cognito, KMS running 24/7.

---

## Memory and Interval Rationale

### Lambda Memory: 256MB for PC, 1024MB for non-PC

The 5 provisioned-concurrency functions run at 256MB. Peak memory usage is 159MB
(62% utilisation at 256MB). At ~14.5% of a vCPU, execution is slightly slower for
CPU work, but these functions are I/O-bound (waiting on DynamoDB, HMRC, Cognito)
so the difference is negligible. Cold starts are irrelevant with PC=1.

The 23 non-PC functions stay at 1024MB. Docker-based Lambda cold starts scale
inversely with memory — at 256MB they would be 3-5 seconds vs 700-1100ms at
1024MB. Since these functions cold-start on every invocation at low traffic, the
user-facing penalty isn't worth the ~$0.25/month saving.

### Canary Interval: 51 minutes

51-minute interval gives near-hourly checks while guaranteeing every 60-minute
window contains at least one check (since 51 < 60, there's always overlap). This
costs $2/month vs $21 at the previous 5-minute interval. For a business
application with low-urgency monitoring, sub-hour detection is sufficient.

---

## Actual AWS Costs

### How to Query

The deployment role (`submit-deployment-role`) does not have `ce:GetCostAndUsage`
permission. To pull actual billing data, use an IAM identity with Cost Explorer
access (e.g., the root account or an admin role with `ce:*` permissions) and run:

```bash
# Total spend by service for last 30 days
aws ce get-cost-and-usage \
  --time-period Start=2026-01-16,End=2026-02-16 \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --output table

# Daily breakdown for a specific service
aws ce get-cost-and-usage \
  --time-period Start=2026-01-16,End=2026-02-16 \
  --granularity DAILY \
  --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["AWS Lambda"]}}' \
  --output table

# Cost by usage type (shows PC vs on-demand Lambda separately)
aws ce get-cost-and-usage \
  --time-period Start=2026-01-16,End=2026-02-16 \
  --granularity MONTHLY \
  --metrics UnblendedCost UsageQuantity \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --output table
```

You can also view this in the AWS Console under **Billing > Cost Explorer**.

### What to Expect

The actual bill will differ from the estimates above because:

1. **The estimates above assume the 256MB/51-min optimizations are deployed.**
   Until deployed, actuals will reflect the previous 1024MB/5-min configuration.
2. **Free tier credits** reduce costs for the first 12 months of the account
   (1M Lambda requests, 1M API Gateway requests, 25GB DynamoDB, etc.)
3. **Savings Plans or Reserved pricing** may apply if purchased.
4. **Tax** is not included in the estimates.
5. **Data transfer** between regions (ECR replication eu-west-2 to us-east-1)
   adds a small amount not itemised above.

### Expected Service Mapping

| AWS Billing Service Name | Estimated $/month | Notes |
|---|---:|---|
| AWS Lambda | ~$14 | PC ($13.50) + on-demand ($0.50) |
| Amazon CloudFront | ~$5 | 5 distributions |
| Amazon Cognito | ~$5 | PLUS tier, prod + CI MAUs |
| AWS WAF | ~$9 | WebACL + rules (prod only, CI prorated) |
| Amazon DynamoDB | ~$4 | 11 tables x 2 envs, on-demand + PITR |
| CloudWatch | ~$9 | Alarms, dashboard, RUM, Synthetics, logs |
| AWS Key Management Service | ~$4 | 2 keys x 2 envs |
| Amazon API Gateway | ~$1 | HTTP API v2 |
| Amazon S3 | ~$1 | ~9 buckets |
| AWS Security Hub | ~$3 | CIS benchmark |
| Amazon GuardDuty | ~$2 | Management events |
| AWS Backup | ~$2 | DynamoDB backups |
| Amazon Route 53 | ~$1.50 | Hosted zones + queries |
| AWS Secrets Manager | ~$2.50 | ~6 secrets |
| Amazon ECR | ~$1 | 2 repos |
| Amazon CloudTrail | ~$1 | Data events |
| Amazon SQS | ~$0 | Free tier |
| Amazon SNS | ~$0 | Free tier |
| Amazon EventBridge | ~$0 | Free tier |
| **Total** | **~$65** | Before tax, after optimizations |

The estimated total of ~$78 includes CI app stack costs (~$7) which are
usage-based and appear spread across the service categories above, plus the
CI env baseline (~$10) which overlaps with the same services.

---

## Cost-Saving Architecture Choices

- No VPC/NAT Gateway (fully serverless)
- DynamoDB on-demand (PAY_PER_REQUEST)
- HTTP API v2 (not REST API) — $1/million vs $3.50/million
- Short log retention (3 days default)
- SQS/SNS/EventBridge all within free tier at low volume
- ARM64 Lambda architecture (20% cheaper than x86)
- Self-destructing CI stacks (SelfDestructStack tears down after timer)
- 256MB PC functions (measured at 16% memory utilisation at 1024MB)
- 51-minute canary interval (down from 5 minutes)
