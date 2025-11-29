# Circuit Breaker Implementation

## Overview

This application implements a circuit breaker pattern for outbound external API calls to improve resilience and fault tolerance. The circuit breaker automatically detects failures and prevents cascading failures by temporarily blocking requests to failing services.

## Architecture

The circuit breaker implementation consists of:

1. **DynamoDB Table** (`circuit-breaker-state`): Stores circuit breaker state per host
2. **Circuit Breaker Library** (`app/lib/circuitBreaker.js`): Core logic for circuit breaker pattern
3. **Lambda Environment Variables**: Configuration for circuit breaker behavior
4. **CloudWatch Alarms**: Monitor error rates and latency for each external host
5. **CloudWatch Dashboard**: Visualize circuit breaker metrics
6. **EventBridge Rule**: Periodically checks and resets circuit breaker states

## External Hosts Protected

The circuit breaker protects calls to these external hosts:

- `api.service.hmrc.gov.uk` - HMRC Production API
- `test-api.service.hmrc.gov.uk` - HMRC Sandbox/Test API
- `google.com` - Google OAuth services
- `antonycc.com` - External services

## Circuit Breaker States

### CLOSED (Normal Operation)
- All requests are allowed through
- Success/failure counts are tracked
- Transitions to OPEN if failure threshold is exceeded

### OPEN (Service Unavailable)
- All requests are blocked immediately
- Returns `CircuitBreakerOpenError` to caller
- After recovery timeout, transitions to HALF_OPEN

### HALF_OPEN (Testing Recovery)
- Limited requests are allowed to test if service has recovered
- On success: transitions back to CLOSED
- On failure: transitions back to OPEN

## Configuration

Circuit breaker behavior is controlled by environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CIRCUIT_BREAKER_TABLE_NAME` | - | DynamoDB table name (required to enable circuit breaker) |
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | 5 | Number of failures before opening circuit |
| `CIRCUIT_BREAKER_TIMEOUT_THRESHOLD_MS` | 10000 | Request timeout threshold in milliseconds |
| `CIRCUIT_BREAKER_OPEN_TIMEOUT_SECONDS` | 60 | Time to wait before attempting recovery |
| `CIRCUIT_BREAKER_HALF_OPEN_MAX_REQUESTS` | 3 | Number of successful requests needed to close circuit |

## Monitoring

### CloudWatch Dashboard

View circuit breaker metrics at CloudWatch console under dashboards named `<deployment-name>-app-circuit-breaker`.

The dashboard shows:
- Error count per host
- Request latency
- Circuit breaker state transitions

### CloudWatch Alarms

Alarms are configured for each external host:

1. **Error Rate Alarm**: Triggers when error count ≥ 5 in 2 consecutive 1-minute periods
2. **Latency Alarm**: Triggers when average response time > 10 seconds for 2 consecutive 1-minute periods

## Cost Considerations

The circuit breaker infrastructure is designed for scale-to-zero and pay-as-you-go:

- **DynamoDB**: Pay-per-request billing, minimal storage
- **CloudWatch Logs**: Standard log retention (7 days by default)
- **CloudWatch Alarms**: Fixed cost per alarm
- **EventBridge**: Minimal cost for 1-minute schedule
- **Lambda**: Only charged when state check function executes

Estimated monthly cost (low traffic): **< $5 USD**
