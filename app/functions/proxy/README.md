# Outbound Proxy with Rate Limiting and Circuit Breaker

This directory contains the implementation of a centralized outbound proxy for the DIY Accounting submit application. The proxy provides rate limiting, circuit breaker patterns, and configuration management for all external API calls.

## Overview

The outbound proxy is a Node.js Lambda function that sits between your application and external APIs. It provides:

- **Rate Limiting**: Token-bucket algorithm per proxy host
- **Circuit Breaker**: Automatic failure detection and recovery
- **Configuration Management**: DynamoDB-based configuration with caching
- **Observability**: CloudWatch metrics and logging

## Architecture

```
Application Lambda → Proxy Host (API Gateway) → Proxy Lambda → Upstream API
                                                      ↓
                                              DynamoDB Config Table
```

## Configuration

### DynamoDB Table Schema

The proxy configuration is stored in a DynamoDB table with the following schema:

| Attribute | Type | Description |
|-----------|------|-------------|
| `proxyHost` | String (PK) | The proxy domain (e.g., "test-api-proxy.submit.diyaccounting.co.uk") |
| `upstreamHost` | String | Target upstream URL (e.g., "https://test-api.service.hmrc.gov.uk") |
| `rateLimitPerSecond` | Number | Maximum requests per second (default: 10) |
| `breakerConfig` | String (JSON) | Circuit breaker configuration |

### Circuit Breaker Configuration

The `breakerConfig` is a JSON string with the following properties:

```json
{
  "errorThreshold": 10,        // Number of errors before opening circuit
  "latencyMs": 5000,           // Latency threshold in milliseconds
  "cooldownSeconds": 60        // Cooldown period before half-open state
}
```

### Example Configuration Entry

```json
{
  "proxyHost": "ci-test-api-service-hmrc-gov-uk.submit.diyaccounting.co.uk",
  "upstreamHost": "https://test-api.service.hmrc.gov.uk",
  "rateLimitPerSecond": 5,
  "breakerConfig": "{\"errorThreshold\": 10, \"latencyMs\": 3000, \"cooldownSeconds\": 60}"
}
```

## Usage

### Adding a Proxy Configuration

Use AWS CLI or AWS SDK to add configuration to DynamoDB:

```bash
aws dynamodb put-item \
  --table-name <proxy-config-table-name> \
  --item '{
    "proxyHost": {"S": "my-api-proxy.submit.diyaccounting.co.uk"},
    "upstreamHost": {"S": "https://api.example.com"},
    "rateLimitPerSecond": {"N": "10"},
    "breakerConfig": {"S": "{\"errorThreshold\": 10, \"latencyMs\": 5000}"}
  }'
```

### Making Requests Through the Proxy

Update your Lambda functions to use the proxy host instead of the upstream host:

**Before:**
```javascript
const response = await fetch("https://api.example.com/endpoint", {
  method: "GET",
  headers: { ... }
});
```

**After:**
```javascript
const response = await fetch("https://my-api-proxy.submit.diyaccounting.co.uk/endpoint", {
  method: "GET",
  headers: { 
    host: "my-api-proxy.submit.diyaccounting.co.uk",
    ...
  }
});
```

## Features

### Rate Limiting

- Per-host token bucket algorithm
- In-memory state per Lambda container
- Configurable requests per second
- Returns HTTP 429 when rate limit exceeded

### Circuit Breaker

- Monitors upstream response times and error rates
- Automatically opens circuit after error threshold
- Half-open state for recovery testing
- Configurable cooldown period
- Returns HTTP 503 when circuit is open

### Configuration Caching

- 1-minute TTL for configuration entries
- Reduces DynamoDB read costs
- Allows for reasonable update propagation

### Request/Response Handling

- Supports HTTP and HTTPS upstream
- Preserves request headers (except proxy-specific headers)
- 30-second timeout for upstream requests
- Automatic retry on transient failures

## Monitoring

### CloudWatch Logs

Access logs are written to:
```
/aws/apigw/<resource-prefix>-proxy/access
```

Lambda logs are written to:
```
/aws/lambda/<function-name>
```

### Key Metrics to Monitor

1. **Request Count**: Total requests through proxy
2. **Error Rate**: Percentage of 4xx/5xx responses
3. **Latency**: Response time distribution
4. **Circuit Breaker Opens**: Frequency of circuit breaker activations
5. **Rate Limit Hits**: Frequency of rate limiting (429 responses)

## Deployment

The proxy is deployed as part of the ProxyStack in the CDK application:

```java
// infra/main/java/co/uk/diyaccounting/submit/stacks/ProxyStack.java
this.proxyStack = new ProxyStack(
    app,
    sharedNames.proxyStackId,
    ProxyStack.ProxyStackProps.builder()
        .env(primaryEnv)
        .envName(envName)
        .deploymentName(deploymentName)
        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
        .cloudTrailEnabled(cloudTrailEnabled)
        .sharedNames(sharedNames)
        .build());
```

## Testing

### Unit Tests

```bash
npm run test:unit
```

Tests are located in `app/unit-tests/functions/outboundProxyHandler.test.js`

### System Tests

```bash
npm run test:system
```

System tests are located in `app/system-tests/outboundProxy.system.test.js`

## Troubleshooting

### 404 - Unknown proxy host

**Cause**: Proxy configuration not found in DynamoDB
**Solution**: Add configuration entry for the proxy host

### 429 - Rate limit exceeded

**Cause**: Too many requests to the proxy host
**Solution**: Increase `rateLimitPerSecond` or implement request throttling in caller

### 503 - Circuit breaker open

**Cause**: Upstream service is experiencing issues
**Solution**: Wait for cooldown period or investigate upstream service health

### 502 - Bad Gateway

**Cause**: Error communicating with upstream service
**Solution**: Check upstream service availability and network connectivity

## Cost Considerations

- **Lambda**: Pay per invocation and compute time
- **API Gateway**: Pay per API call
- **DynamoDB**: Pay per request (on-demand billing mode)
- **CloudWatch**: Pay for log storage and metrics

All services use pay-per-use pricing, resulting in near-zero cost when idle.

## Security

- Configuration is stored securely in DynamoDB
- IAM roles follow principle of least privilege
- All traffic is encrypted in transit (HTTPS)
- Access logs are retained for audit purposes
- CodeQL security scanning passes with no vulnerabilities
