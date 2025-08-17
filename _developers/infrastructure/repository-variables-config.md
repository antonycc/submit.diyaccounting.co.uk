# Repository Variables Configuration for Optimal AWS Deployment
# These variables should be set in GitHub repository settings to ensure proper observability and security

## AWS Infrastructure Variables

### Certificate Management
# Set this to your ACM certificate ARN for HTTPS
AWS_CERTIFICATE_ARN=arn:aws:acm:us-east-1:887764105431:certificate/b23cd904-8e3b-4cd0-84f1-57ca11d7fe2b

### DNS Configuration  
# Route53 hosted zone configuration
AWS_HOSTED_ZONE_ID=Z0315522208PWZSSBI9AL
AWS_HOSTED_ZONE_NAME=diyaccounting.co.uk

### Observability Settings (RECOMMENDED IMPROVEMENTS)
# Enable CloudTrail for audit logging and security monitoring
AWS_CLOUD_TRAIL_ENABLED=true

# Enable X-Ray for distributed tracing (already optimal)
AWS_X_RAY_ENABLED=true

# Enable verbose logging for debugging (disable in prod for cost optimization)
AWS_VERBOSE_LOGGING=false

### Cost Optimization Settings
# CloudTrail log retention (7 days balances debugging with cost)
AWS_CLOUD_TRAIL_RETENTION_DAYS=7

# Access log retention (30 days for compliance)
AWS_ACCESS_LOG_RETENTION_DAYS=30

### Security Settings
# Enable Cognito advanced security features
AWS_COGNITO_FEATURE_PLAN=PLUS

# Enable Cognito log delivery for security monitoring  
AWS_COGNITO_ENABLE_LOG_DELIVERY=true

### Monitoring and Alerting
# Email for CloudWatch alarm notifications
AWS_MONITORING_EMAIL=alerts@diyaccounting.co.uk

# Enable detailed CloudWatch monitoring
AWS_DETAILED_MONITORING=true

### Environment-Specific Overrides

## Production Environment
# Use these values for production deployments
PROD_CLOUD_TRAIL_ENABLED=true
PROD_X_RAY_ENABLED=true
PROD_VERBOSE_LOGGING=false
PROD_COGNITO_FEATURE_PLAN=PLUS
PROD_MONITORING_EMAIL=alerts@diyaccounting.co.uk

## CI Environment  
# Optimized for testing with reduced logging
CI_CLOUD_TRAIL_ENABLED=true
CI_X_RAY_ENABLED=false
CI_VERBOSE_LOGGING=true
CI_COGNITO_FEATURE_PLAN=ESSENTIALS

## Instructions for Setting Repository Variables

To set these variables in GitHub:
1. Go to Settings > Secrets and variables > Actions > Variables tab
2. Add each variable with the appropriate value for your environment
3. The CDK deployment will automatically use these values

## Cost Impact Analysis

With these optimized settings:
- CloudTrail: ~$2-5/month (7-day retention)
- X-Ray: ~$1-3/month (production tracing only)  
- Cognito Plus: $0.02/MAU (advanced security)
- CloudWatch: ~$5-10/month (detailed monitoring)
- Total estimated cost: $10-20/month for production monitoring

## Security Benefits

- **Audit Trail**: Complete CloudTrail logging for compliance
- **Advanced Security**: Cognito Plus features for user protection
- **Monitoring**: Real-time alerts for issues and anomalies
- **Debugging**: Detailed logs and traces for troubleshooting

## Recommended Actions

1. **Set repository variables** using the values above
2. **Configure monitoring email** for your team
3. **Review cost budgets** after enabling full observability
4. **Test alerting** by triggering a Lambda error
5. **Verify CloudTrail** is logging expected events