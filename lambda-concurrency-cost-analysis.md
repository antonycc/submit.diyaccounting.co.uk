# Lambda Provisioned Concurrency Cost Analysis

## Configuration Summary

Based on `lambda-concurrency-config.yaml`:
- **Total Functions**: 13
- **Peak=1**: 12 functions (cognitoAuthUrlGet, cognitoTokenPost, hmrcAuthUrlGet, hmrcTokenPost, hmrcVatObligationGet, hmrcVatReturnGet, receiptPost, receiptGet, catalogGet, bundleGet, bundlePost, bundleDelete)
- **Peak=2**: 1 function (hmrcVatReturnPost)
- **Total Provisioned Concurrency Units**: 14

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
           = 14 units × $0.00375
           = $0.0525 (approximately $0.05)
```

### Breakdown by Function
- **12 functions at peak=1**: 12 × $0.00375 = $0.045
- **1 function at peak=2**: 2 × $0.00375 = $0.0075
- **Total**: $0.0525

## Monthly Cost Scenarios

### Scenario 1: Always at Peak (No Scaling)
```
Monthly cost = 14 units × 0.125 GB × $0.0000041667 × (730 hours × 3,600 seconds)
             = $19.16 per month
```

### Scenario 2: Current Implementation (Scale during deployment)
Assuming typical deployment pattern:
- 1 deployment per day
- Each deployment at peak for 2 hours
- Rest of the time at zero

```
Daily cost = $0.0525 (2 hours at peak)
Monthly cost = $0.0525 × 30 days = $1.58 per month
```

**Monthly savings**: $19.16 - $1.58 = **$17.59** (92% reduction)

### Scenario 3: Business Hours Only (8 hours/day)
If peak concurrency needed for 8 hours per day:
```
Daily cost = $0.0525 × 4 (2-hour blocks) = $0.21
Monthly cost = $0.21 × 30 days = $6.30 per month
```

**Monthly savings**: $19.16 - $6.30 = **$12.86** (67% reduction)

## Cost Impact Summary

| Scenario | Daily Cost | Monthly Cost | Savings vs Always-Peak |
|----------|-----------|--------------|------------------------|
| Always at peak | $0.639 | $19.16 | - |
| Current (2h/day) | $0.053 | $1.58 | $17.59 (92%) |
| Business hours (8h/day) | $0.210 | $6.30 | $12.86 (67%) |

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
- ✅ **Cost-effective**: $1.58/month vs $19.16/month (92% savings)
- ✅ **Performance**: No cold starts during deployments
- ✅ **Automation**: Scheduled scaling handles routine operations
- ✅ **Flexibility**: Manual scaling available for special events

For production workloads with higher traffic, consider adjusting:
- Increase peak concurrency values for high-traffic functions
- Extend peak windows during known busy periods
- Monitor CloudWatch metrics to optimize based on actual usage

## Monitoring Costs

To track actual costs:
1. **AWS Cost Explorer**: Filter by service "Lambda" and usage type "Provisioned Concurrency"
2. **CloudWatch Metrics**: Monitor `ProvisionedConcurrentExecutions`
3. **Billing Alerts**: Set up alert at $5/month threshold
4. **Tag-based tracking**: Add cost allocation tags to Lambda functions

---

*Last updated: 2024-12-22*
*Based on AWS pricing as of December 2024 (eu-west-2 region)*
