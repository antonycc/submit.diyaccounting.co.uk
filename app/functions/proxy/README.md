# Outbound Proxy with Rate Limiting and Circuit Breaker

This directory contains the implementation of a centralized outbound proxy for the DIY Accounting submit application. The proxy provides rate limiting, circuit breaker patterns, and centralized governance for all external API calls.

## Overview

The outbound proxy is a Node.js Lambda function that sits between your application and external APIs. It provides:

- **Rate Limiting**: DynamoDB-backed rate limiting per proxy host
- **Circuit Breaker**: Automatic failure detection and recovery with state in DynamoDB
- **Configuration Management**: Environment variable-based configuration from CDK
- **Observability**: CloudWatch metrics and logging

## Architecture

```
Application Lambda → Proxy Host (API Gateway) → Proxy Lambda → Upstream API
                                                      ↓
                                              DynamoDB State Table
```

## Configuration

### Environment Variables

Proxy configuration is set via environment variables in the CDK stack (SubmitApplication.java):

| Variable | Description | Example |
|----------|-------------|---------|
| `PROXY_MAPPING` | Comma-separated list of proxy host to upstream mappings | `test-proxy.example.com=https://api.example.com` |
| `RATE_LIMIT_PER_SECOND` | Maximum requests per second | `5` |
| `BREAKER_ERROR_THRESHOLD` | Number of errors before opening circuit | `10` |
| `BREAKER_LATENCY_MS` | Latency threshold in milliseconds | `3000` |
| `BREAKER_COOLDOWN_SECONDS` | Cooldown period before half-open state | `60` |

### DynamoDB State Table

The proxy state (rate limiting and circuit breaker) is stored in a DynamoDB table with a flat schema:

| Attribute | Type | Description |
|-----------|------|-------------|
| `stateKey` | String (PK) | State identifier (e.g., "rate:host:timestamp" or "breaker:host") |
| `count` | Number | Request count for rate limiting |
| `errors` | Number | Error count for circuit breaker |
| `openSince` | Number | Timestamp when circuit opened (0 = closed) |
| `ttl` | Number | Time-to-live for automatic cleanup |

### Example Configuration in CDK

```java
var proxyMappings = Map.of(
    "PROXY_MAPPING", "test-api.submit.diyaccounting.co.uk=https://test-api.service.hmrc.gov.uk",
    "RATE_LIMIT_PER_SECOND", "5",
    "BREAKER_ERROR_THRESHOLD", "10",
    "BREAKER_LATENCY_MS", "3000",
    "BREAKER_COOLDOWN_SECONDS", "60"
);
```

## Usage

### Updating Proxy Configuration

To change proxy configuration, update the `proxyMappings` in `SubmitApplication.java` and redeploy:

```java
var proxyMappings = Map.of(
    "PROXY_MAPPING", "my-api-proxy.submit.diyaccounting.co.uk=https://api.example.com",
    "RATE_LIMIT_PER_SECOND", "10",
    "BREAKER_ERROR_THRESHOLD", "15"
);
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
