# Lambda Provisioned Concurrency Cost Analysis

## Configuration Summary

Based on `lambda-concurrency-config.yaml`:
- **Total Functions**: 16
  - API Handlers: 13
  - SQS Consumers: 3
- **Peak=1**: 15 functions
- **Peak=2**: 1 function (hmrcVatReturnPost)
- **Total Provisioned Concurrency Units**: 17

## Function Breakdown

### API Handlers (13)
1. cognito-auth-url-get.handler
2. cognito-token-post.handler
3. hmrc-auth-url-get.handler
4. hmrc-token-post.handler
5. hmrc-vat-return-post.handler (peak=2)
6. hmrc-vat-obligation-get.handler
7. hmrc-vat-return-get.handler
8. receipt-post.handler
9. receipt-get.handler
10. catalog-get.handler
11. bundle-get.handler
12. bundle-post.handler
13. bundle-delete.handler

### SQS Consumers (3)
1. bundle-get.handler-consumer
2. bundle-post.handler-consumer
3. bundle-delete.handler-consumer

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
           = 17 units × $0.00375
           = $0.0638 (approximately $0.06)
```

### Breakdown by Function
- **15 functions at peak=1**: 15 × $0.00375 = $0.05625
- **1 function at peak=2**: 2 × $0.00375 = $0.0075
- **Total**: $0.0638

## Monthly Cost Scenarios

### Scenario 1: Always at Peak (No Scaling)
```
Monthly cost = 17 units × 0.125 GB × $0.0000041667 × (730 hours × 3,600 seconds)
             = $23.27 per month
```

### Scenario 2: Current Implementation (Scale during deployment)
Assuming typical deployment pattern:
- 1 deployment per day
- Each deployment at peak for 2 hours
- Rest of the time at zero

```
Daily cost = $0.0638 (2 hours at peak)
Monthly cost = $0.0638 × 30 days = $1.91 per month
```

**Monthly savings**: $23.27 - $1.91 = **$21.36** (92% reduction)

### Scenario 3: Business Hours Only (8 hours/day)
If peak concurrency needed for 8 hours per day:
```
Daily cost = $0.0638 × 4 (2-hour blocks) = $0.255
Monthly cost = $0.255 × 30 days = $7.65 per month
```

**Monthly savings**: $23.27 - $7.65 = **$15.62** (67% reduction)

## Cost Impact Summary

| Scenario | Daily Cost | Monthly Cost | Savings vs Always-Peak |
|----------|-----------|--------------|------------------------|
| Always at peak | $0.776 | $23.27 | - |
| Current (2h/day) | $0.064 | $1.91 | $21.36 (92%) |
| Business hours (8h/day) | $0.255 | $7.65 | $15.62 (67%) |

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
- ✅ **Cost-effective**: $1.91/month vs $23.27/month (92% savings)
- ✅ **Performance**: No cold starts during deployments
- ✅ **Automation**: Scheduled scaling handles routine operations
- ✅ **Flexibility**: Manual scaling available for special events
- ✅ **SQS Integration**: Consumers scaled along with API handlers for async processing

For production workloads with higher traffic, consider adjusting:
- Increase peak concurrency values for high-traffic functions
- Extend peak windows during known busy periods
- Monitor CloudWatch metrics to optimize based on actual usage
- Consider higher peak values for SQS consumers during batch processing periods

## Monitoring Costs

To track actual costs:
1. **AWS Cost Explorer**: Filter by service "Lambda" and usage type "Provisioned Concurrency"
2. **CloudWatch Metrics**: Monitor `ProvisionedConcurrentExecutions`
3. **Billing Alerts**: Set up alert at $5/month threshold
4. **Tag-based tracking**: Add cost allocation tags to Lambda functions

---

*Last updated: 2024-12-22*
*Based on AWS pricing as of December 2024 (eu-west-2 region)*
