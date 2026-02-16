# AWS Monthly Cost Estimate

**Last updated:** February 2026
**Region:** eu-west-2 (London) + us-east-1 (edge)
**Account:** submit-prod (887764105431)

## Production Environment (24/7, 720 hours)

| Resource | Details | $/month |
|---|---|---:|
| **Lambda Provisioned Concurrency** | 5 functions x 1 PC x 1GB, 24/7 | **$54** |
| **CloudWatch Synthetics** | 2 canaries x every 5min = 17,280 runs | **$21** |
| **WAF WebACL** | 1 ACL ($5) + 3 rules ($3) + ~1M requests ($0.60) | **$9** |
| **CloudWatch** | ~20 alarms ($2), 1 dashboard ($3), RUM ($1), logs ~2GB ($1) | **$7** |
| **CloudFront** | 5 distributions, low traffic (~50GB transfer) | **$5** |
| **Cognito PLUS** | ~50 MAU x $0.0375 with threat protection FULL | **$4** |
| **DynamoDB** | 11 tables, PAY_PER_REQUEST, ~1GB storage, PITR | **$3** |
| **Security Hub** | CIS Foundations benchmark checks | **$3** |
| **Secrets Manager** | ~6 secrets x $0.40 | **$2.50** |
| **KMS** | 2 keys x $1 | **$2** |
| **GuardDuty** | Management events analysis | **$2** |
| **AWS Backup** | DynamoDB daily/weekly/monthly to vault | **$2** |
| **Route53** | 2 hosted zones + queries | **$1.50** |
| **ECR** | 2 repos, ~5GB images | **$1** |
| **S3** | ~9 buckets, minimal storage | **$1** |
| **API Gateway HTTP API** | ~50K requests | **$1** |
| **Lambda on-demand** | ~10K invocations, ~5K GB-seconds | **$0.50** |
| **CloudTrail** | 1 trail (free) + DynamoDB data events | **$1** |
| **SQS/SNS/EventBridge** | All within free tier at this volume | **$0** |
| | **Production subtotal** | **~$120** |

### Provisioned Concurrency Detail

5 out of 28 Lambda functions have PC=1 (all ingest functions, 1GB memory):

| Lambda | Stack | PC |
|--------|-------|----|
| cognitoTokenPost | AuthStack | 1 |
| customAuthorizer | AuthStack | 1 |
| bundleGet | AccountStack | 1 |
| hmrcTokenPost | HmrcStack | 1 |
| hmrcVatReturnPost (ingest) | HmrcStack | 1 |

The remaining 23 functions (13 sync + 5 async ingest + 5 async worker) use PC=0.

Formula: 5 GB x 2,592,000 s/month x $0.0000041667/GB-s = **$54/month**

---

## CI Environment Stacks (24/7 baseline)

These duplicate per-environment resources but share account-level services (GuardDuty, Security Hub, CloudTrail, ECR) with production.

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

## CI Application Stacks

TODO: Update with actual deployment counts from GitHub Actions.

---

## Cost Scaling with Users

TODO: Add user scaling analysis.

---

## Top Cost Drivers

1. **Lambda Provisioned Concurrency** - 44% of production cost
2. **CloudWatch Synthetics** - 17%. Bumping interval from 5min to 15min would cut to ~$9
3. **WAF** - 7%. Fixed monthly cost for ACL + rules

## Cost-Saving Architecture Choices

- No VPC/NAT Gateway (fully serverless)
- DynamoDB on-demand (PAY_PER_REQUEST)
- HTTP API v2 (not REST API) - $1/million vs $3.50/million
- Short log retention (3 days default)
- SQS/SNS/EventBridge all within free tier at low volume
- ARM64 Lambda architecture (20% cheaper than x86)
