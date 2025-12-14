# Deferred Execution Pattern for HMRC VAT API Calls

## Overview

This implementation adds support for deferred (asynchronous) execution of HMRC VAT API calls to prevent Lambda timeouts and improve user experience. When an API call to HMRC takes longer than expected, the system returns an HTTP 202 Accepted response immediately, processes the request in the background, and allows the client to poll for results.

## Architecture

### Components

1. **Lambda Functions** (`app/functions/hmrc/`)
   - `hmrcVatObligationGet.js` - Get VAT obligations
   - `hmrcVatReturnPost.js` - Submit VAT return
   - `hmrcVatReturnGet.js` - Get VAT return
   
   All three functions now support deferred execution via the `executeWithDeferral` wrapper.

2. **Service Layer** (`app/services/`)
   - `deferredExecution.js` - Core deferred execution logic
   - Handles timeout detection, request storage, and continuation polling

3. **Data Layer** (`app/data/`)
   - `dynamoDbDeferredRequestRepository.js` - DynamoDB operations for request state
   - Stores in-progress requests with TTL (1 hour default)

4. **Web Client** (`web/public/`)
   - `submit.js` - Enhanced with `fetchWithPolling()` function
   - Automatically polls for results when receiving 202 responses
   - Exponential backoff (100ms → 5000ms max)

### Flow Diagram

```
Client Request
     ↓
Lambda Handler (with executeWithDeferral wrapper)
     ↓
  Timeout?
     ├─ No  → Return result immediately (200 OK)
     └─ Yes → Store request in DynamoDB
              ↓
              Return 202 Accepted with clientRequestId
              ↓
              Continue processing in background
              ↓
              Update DynamoDB with result (COMPLETED/FAILED)

Client receives 202
     ↓
Client polls with x-continuation=true
     ↓
Lambda checks DynamoDB
     ├─ PROCESSING → Return 202 again
     ├─ COMPLETED  → Return result + delete record
     └─ FAILED     → Return error + delete record
```

## Configuration

### Environment Variables

- `DEFERRED_EXECUTION_TIMEOUT_MS` - Timeout threshold in milliseconds (default: 100)
- `DEFERRED_REQUESTS_DYNAMODB_TABLE_NAME` - DynamoDB table for request state tracking

### DynamoDB Table Schema

```javascript
{
  clientRequestId: String,      // Primary Key
  hashedSub: String,            // User identifier (hashed)
  requestParams: Object,        // Original request parameters
  status: String,               // PROCESSING | COMPLETED | FAILED
  result: Object,               // Lambda response (when completed)
  error: Object,                // Error details (when failed)
  requestId: String,            // Request correlation ID
  amznTraceId: String,          // AWS X-Ray trace ID
  traceparent: String,          // W3C trace parent
  createdAt: String,            // ISO timestamp
  updatedAt: String,            // ISO timestamp
  ttl: Number,                  // Unix timestamp (1 hour TTL)
  ttl_datestamp: String         // Human-readable TTL
}
```

## HTTP API

### Initial Request

```http
POST /api/v1/hmrc/vat/return
X-Client-Request-Id: uuid-or-generated
Authorization: Bearer <token>
Content-Type: application/json

{
  "vatNumber": "123456789",
  "periodKey": "24A1",
  "vatDue": 1000.50
}
```

### Immediate Response (Fast)

```http
HTTP/1.1 200 OK
X-Client-Request-Id: uuid-or-generated
X-Request-Id: lambda-request-id
Content-Type: application/json

{
  "receipt": {
    "processingDate": "2025-01-01T12:00:00.000Z",
    "formBundleNumber": "123456789012",
    "chargeRefNumber": "XM002610011594"
  }
}
```

### Deferred Response (Slow)

```http
HTTP/1.1 202 Accepted
X-Client-Request-Id: uuid-or-generated
X-Request-Id: lambda-request-id
Retry-After: 0.1
Content-Type: application/json

{
  "message": "Request accepted for processing. Poll with x-continuation=true query parameter.",
  "clientRequestId": "uuid-or-generated",
  "status": "PROCESSING",
  "retryAfter": 100
}
```

### Continuation Request (Polling)

```http
GET /api/v1/hmrc/vat/return?x-continuation=true
X-Client-Request-Id: uuid-or-generated
Authorization: Bearer <token>
```

### Continuation Responses

**Still Processing:**
```http
HTTP/1.1 202 Accepted
Retry-After: 0.1

{
  "message": "Request still processing. Please retry.",
  "clientRequestId": "uuid-or-generated",
  "status": "PROCESSING",
  "retryAfter": 100
}
```

**Completed:**
```http
HTTP/1.1 200 OK

{
  "receipt": {
    "processingDate": "2025-01-01T12:00:00.000Z",
    "formBundleNumber": "123456789012",
    "chargeRefNumber": "XM002610011594"
  }
}
```

**Failed:**
```http
HTTP/1.1 500 Internal Server Error

{
  "message": "Request processing failed",
  "error": {
    "message": "Error details..."
  }
}
```

## Client Integration

### Automatic Polling (Recommended)

The web client automatically handles polling through `fetchWithPolling()`:

```javascript
// Automatically polls for results if 202 is returned
const response = await window.authorizedFetch('/api/v1/hmrc/vat/return', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ vatNumber, periodKey, vatDue, accessToken }),
});

// Response will be the final result (200 OK) after polling completes
const result = await response.json();
```

### Manual Polling (Advanced)

```javascript
// First request
const headers = new Headers();
headers.set('X-Client-Request-Id', generateClientRequestId());

let response = await fetch('/api/v1/hmrc/vat/return', {
  method: 'POST',
  headers,
  body: JSON.stringify({ ... }),
});

// Check if deferred
if (response.status === 202) {
  const data = await response.json();
  const clientRequestId = data.clientRequestId;
  
  // Poll for result
  let maxRetries = 30;
  let delay = 100;
  
  while (maxRetries-- > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
    
    const pollHeaders = new Headers();
    pollHeaders.set('X-Client-Request-Id', clientRequestId);
    
    response = await fetch('/api/v1/hmrc/vat/return?x-continuation=true', {
      method: 'GET',
      headers: pollHeaders,
    });
    
    if (response.status !== 202) break;
    
    delay = Math.min(delay * 1.5, 5000); // Exponential backoff
  }
}

// Handle final response
const result = await response.json();
```

## Testing

### Unit Tests

```bash
# Run all tests including deferred execution
npm run test:unit

# Run just the deferred execution tests
npm run test:unit -- app/unit-tests/services/deferredExecution.test.js
```

### Manual Testing

1. Set a low timeout to force deferred execution:
   ```bash
   export DEFERRED_EXECUTION_TIMEOUT_MS=10
   ```

2. Start the local server:
   ```bash
   npm run server
   ```

3. Start local DynamoDB (if not already running):
   ```bash
   npm run data
   ```

4. Test VAT submission or obligations retrieval through the web UI

5. Monitor logs to see:
   - Initial request timeout
   - 202 Accepted response
   - Background processing
   - Client polling
   - Final result delivery

## AWS Deployment Considerations

### DynamoDB Table

The CDK infrastructure needs to create a DynamoDB table for deferred requests:

```typescript
const deferredRequestsTable = new Table(this, 'DeferredRequestsTable', {
  partitionKey: { name: 'clientRequestId', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl',
  removalPolicy: RemovalPolicy.DESTROY,
});
```

### Lambda Configuration

- Set `DEFERRED_REQUESTS_DYNAMODB_TABLE_NAME` environment variable
- Set `DEFERRED_EXECUTION_TIMEOUT_MS` (recommended: 100-500ms)
- Grant Lambda functions read/write access to the deferred requests table

### Durable Lambda (AWS December 2025 Feature)

This implementation can be enhanced with AWS Durable Lambda when available:
- Replaces custom DynamoDB storage with built-in state management
- Provides automatic request continuation
- Reduces operational complexity

Reference: https://docs.aws.amazon.com/lambda/latest/dg/durable-functions.html

## Monitoring and Observability

### CloudWatch Metrics

- Monitor `clientRequestId` in logs for request tracing
- Track 202 response rates
- Monitor DynamoDB table size and TTL cleanup
- Alert on high failure rates in background processing

### X-Ray Tracing

All requests include trace context:
- `x-request-id` - Request correlation ID
- `x-amzn-trace-id` - AWS X-Ray trace ID
- `traceparent` - W3C trace context
- `X-Client-Request-Id` - Client-generated or system-generated request ID

## Performance Considerations

### Timeout Tuning

- **Too Short** (<50ms): Most requests will be deferred unnecessarily
- **Optimal** (100-500ms): Balance between immediate responses and deferrals
- **Too Long** (>1000ms): Risk of Lambda timeouts and poor UX

### Polling Strategy

- Initial delay: 100ms (matches timeout threshold)
- Exponential backoff: 1.5x per retry
- Max delay: 5000ms
- Max retries: 30 (total ~45 seconds)

### DynamoDB Considerations

- Use on-demand billing for unpredictable traffic
- TTL automatically cleans up old requests (1 hour)
- Consider implementing cleanup for orphaned records

## Security

- Client request IDs are validated and sanitized
- User identity (sub) is hashed before storage
- DynamoDB records expire automatically (1 hour TTL)
- All requests require authentication
- Request parameters are validated before deferral

## Limitations

- Maximum deferred execution time: 1 hour (TTL)
- Recommended client polling: ~45 seconds maximum
- Background processing continues even if client stops polling
- No notification mechanism for completed requests (client must poll)

## Future Enhancements

1. **WebSocket Support**: Push notifications when requests complete
2. **Webhook Callbacks**: Optional callback URL for async notification
3. **Request Prioritization**: Priority queue for important requests
4. **Batch Processing**: Process multiple deferred requests efficiently
5. **AWS Durable Lambda**: Replace custom implementation when feature is GA
