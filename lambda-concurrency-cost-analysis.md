# Lambda Provisioned Concurrency Cost Analysis

## Configuration Summary

Based on `lambda-concurrency-config.yaml`:
- **Total Functions**: 16
  - API Handlers: 13
  - SQS Consumers: 3
- **Peak=1**: 12 functions
- **Peak=2**: 3 functions (bundle-get API, bundle-post consumer, bundle-delete consumer)
- **Peak=4**: 1 function (bundle-get consumer)
- **Total Provisioned Concurrency Units**: 22

## Function Breakdown

### API Handlers (13)
1. submit-app-cognito-auth-url-get (app/functions/auth/cognitoAuthUrlGet.handler) (peak=1)
2. submit-app-cognito-token-post (app/functions/auth/cognitoTokenPost.handler) (peak=1)
3. submit-app-hmrc-auth-url-get (app/functions/hmrc/hmrcAuthUrlGet.handler) (peak=1)
4. submit-app-hmrc-token-post (app/functions/hmrc/hmrcTokenPost.handler) (peak=1)
5. submit-app-hmrc-vat-return-post (app/functions/hmrc/hmrcVatReturnPost.handler) (peak=1)
6. submit-app-hmrc-vat-obligation-get (app/functions/hmrc/hmrcVatObligationGet.handler) (peak=1)
7. submit-app-hmrc-vat-return-get (app/functions/hmrc/hmrcVatReturnGet.handler) (peak=1)
8. submit-app-hmrc-receipt-post (app/functions/hmrc/hmrcReceiptPost.handler) (peak=1)
9. submit-app-hmrc-receipt-get (app/functions/hmrc/hmrcReceiptGet.handler) (peak=1)
10. submit-app-bundle-get (app/functions/account/bundleGet.handler) (peak=2)**
11. submit-app-bundle-post (app/functions/account/bundlePost.handler) (peak=1)
12. submit-app-bundle-delete (app/functions/account/bundleDelete.handler) (peak=1)

### SQS Consumers (3)
Consumers are configured at 2x their API handler concurrency for better throughput:
1. **submit-app-bundle-get-consumer (app/functions/account/bundleGet.consumer) (peak=4)** - 2x of bundle-get API (peak=2)
2. **submit-app-bundle-post-consumer (app/functions/account/bundlePost.consumer) (peak=2)** - 2x of bundle-post API (peak=1)
3. **submit-app-bundle-delete-consumer (app/functions/account/bundleDelete.consumer) (peak=2)** - 2x of bundle-delete API (peak=1)

## Cost Calculation for 2 Hours at Peak Concurrency

### Assumptions
- **Memory per function**: 128 MB (0.125 GB)
- **AWS Region**: eu-west-2 (London)
- **Provisioned concurrency pricing**: $0.0000041667 per GB-second
- **Duration**: 2 hours = 7,200 seconds

### Calculation

**Cost per concurrency unit for 2 hours:**
```
Cost = Memory (GB) × Price per GB-second × Duration (seconds)
     = 0.125 GB × $0.0000041667 × 7,200 seconds
     = $0.00375 per unit for 2 hours
```

**Total cost for 2 hours at peak:**
```
Total Cost = Total Units × Cost per Unit
           = 22 units × $0.00375
           = $0.0825 (approximately $0.08)
```

### Breakdown by Concurrency Level
- **12 functions at peak=1**: 12 × $0.00375 = $0.0450
- **3 functions at peak=2**: 3 × 2 × $0.00375 = $0.0225
- **1 function at peak=4**: 1 × 4 × $0.00375 = $0.0150
- **Total**: $0.0825

## Monthly Cost Scenarios

### Scenario 1: Always at Peak (No Scaling)
```
Monthly cost = 22 units × 0.125 GB × $0.0000041667 × (730 hours × 3,600 seconds)
             = $30.11 per month
```

### Scenario 2: Current Implementation (Scale during deployment)
Assuming typical deployment pattern:
- 1 deployment per day
- Each deployment at peak for 2 hours
- Rest of the time at zero

```
Daily cost = $0.0825 (2 hours at peak)
Monthly cost = $0.0825 × 30 days = $2.48 per month
```

**Monthly savings**: $30.11 - $2.48 = **$27.64** (92% reduction)

### Scenario 3: Business Hours Only (8 hours/day)
If peak concurrency needed for 8 hours per day:
```
Daily cost = $0.0825 × 4 (2-hour blocks) = $0.33
Monthly cost = $0.33 × 30 days = $9.90 per month
```

**Monthly savings**: $30.11 - $9.90 = **$20.21** (67% reduction)

## Cost Impact Summary

| Scenario | Daily Cost | Monthly Cost | Savings vs Always-Peak |
|----------|-----------|--------------|------------------------|
| Always at peak | $1.00 | $30.11 | - |
| Current (2h/day) | $0.08 | $2.48 | $27.64 (92%) |
| Business hours (8h/day) | $0.33 | $9.90 | $20.21 (67%) |

## Additional Considerations

### Invocation Costs
Provisioned concurrency pricing is separate from invocation costs:
- **Invocation cost**: $0.20 per 1M requests (not affected by provisioned concurrency)
- Cold starts are eliminated during peak periods, improving user experience
- No additional invocation cost for provisioned vs on-demand

### Performance Benefits
During peak periods (deployments):
- Zero cold starts for API calls
- Consistent response times (<100ms improvement)
- Better user experience during active usage

### Cost-Performance Trade-off
- **2-hour peak window**: Optimal for deployment scenarios
- **Zero concurrency**: Acceptable cold starts during low-traffic periods
- **Overall**: 92% cost reduction with minimal UX impact

## Recommendation

The current implementation (2 hours at peak per day) provides an excellent balance:
- ✅ **Cost-effective**: $2.48/month vs $30.11/month (92% savings)
- ✅ **Performance**: No cold starts during deployments
- ✅ **Automation**: Scheduled scaling handles routine operations
- ✅ **Flexibility**: Manual scaling available for special events
- ✅ **SQS Integration**: Consumers scaled at 2x API handler concurrency for optimal async processing throughput

**Concurrency Strategy:**
- **API Handlers**: Baseline peak=1 for most endpoints, peak=2 for bundle-get (higher read traffic)
- **SQS Consumers**: Peak=2x their API handler to ensure queue processing keeps pace with message production
  - bundle-get consumer at peak=4 handles retrieval workload efficiently
  - bundle-post/delete consumers at peak=2 handle creation/deletion operations

For production workloads with higher traffic, consider adjusting:
- Increase peak concurrency values for high-traffic functions
- Extend peak windows during known busy periods
- Monitor CloudWatch metrics to optimize based on actual usage
- Adjust consumer multiplier (currently 2x) based on queue depth metrics

## Monitoring Costs

To track actual costs:
1. **AWS Cost Explorer**: Filter by service "Lambda" and usage type "Provisioned Concurrency"
2. **CloudWatch Metrics**: Monitor `ProvisionedConcurrentExecutions`
3. **Billing Alerts**: Set up alert at $5/month threshold
4. **Tag-based tracking**: Add cost allocation tags to Lambda functions

---

*Last updated: 2024-12-22*
*Based on AWS pricing as of December 2024 (eu-west-2 region)*
