# Alternatives to ngrok for OAuth Callback Testing

## Current Problem

ngrok provides a consistent DNS name (`wanted-finally-anteater.ngrok-free.app`) for OAuth callbacks, but has limitations:
- **Single connection per domain** - Only one instance can use the reserved domain at a time
- CI and local development conflict when both need the callback URL

## Requirements

1. **Consistent DNS** - OAuth providers (HMRC, Cognito) need pre-registered callback URLs
2. **Multiple concurrent instances** - CI + multiple developers should work simultaneously
3. **HTTPS** - OAuth callbacks require HTTPS
4. **Routing** - Traffic needs to reach the correct local server

## Alternative Approaches

### Option 1: Cloudflare Tunnel with Path-Based Routing

**Architecture:**
```
Internet → Cloudflare Tunnel → Your Server → Route to instances
```

**Implementation:**
1. Register a domain (e.g., `test.submit.diyaccounting.co.uk`)
2. Create Cloudflare Tunnel pointing to a routing server
3. Use unique path prefixes per instance:
   - `https://test.submit.diyaccounting.co.uk/ci-12345/auth/callback`
   - `https://test.submit.diyaccounting.co.uk/dev-antony/auth/callback`
4. Routing server strips prefix and forwards to correct localhost

**Pros:**
- Single domain, multiple instances
- Free with Cloudflare
- Persistent connection

**Cons:**
- Requires routing logic
- Path prefix changes callback URLs

### Option 2: Wildcard Subdomain with Dynamic DNS

**Architecture:**
```
*.test.submit.diyaccounting.co.uk → Load Balancer → Instance routing
```

**Implementation:**
1. Configure wildcard DNS (`*.test.submit.diyaccounting.co.uk`)
2. Each instance gets unique subdomain: `ci-12345.test.submit...`, `dev-antony.test.submit...`
3. Register wildcard callback URL with OAuth providers (if supported)
4. Central server routes based on subdomain

**Pros:**
- Clean URLs (no path prefix)
- OAuth providers that support wildcards work well

**Cons:**
- Many OAuth providers (including HMRC) don't support wildcard callbacks
- Requires DNS infrastructure

### Option 3: Central OAuth Relay Service

**Architecture:**
```
OAuth Provider → Central Relay → WebSocket/SSE → Local Instance
```

**Implementation:**
1. Deploy a persistent relay service at `auth-relay.submit.diyaccounting.co.uk`
2. Register relay URL with OAuth providers
3. Relay stores callback with correlation ID (state parameter)
4. Local instances poll or subscribe (WebSocket/SSE) for their callbacks
5. Relay returns callback data to correct instance

**Callback flow:**
```
1. Local instance: Generate state=abc123, redirect to OAuth
2. OAuth redirects to: auth-relay.submit.../callback?code=xyz&state=abc123
3. Relay stores: { state: abc123, code: xyz }
4. Local instance polls: GET /pending/abc123
5. Relay returns: { code: xyz }
6. Local instance continues OAuth flow
```

**Pros:**
- Single callback URL for all instances
- No wildcard requirements
- Works with all OAuth providers

**Cons:**
- Requires deploying relay service
- Slight complexity in callback handling
- Polling latency (or WebSocket complexity)

### Option 4: LocalTunnel with Subdomain Pool

**Architecture:**
```
localtunnel.me with reserved subdomain pool
```

**Implementation:**
1. Reserve multiple subdomains: `diy-test-1.loca.lt`, `diy-test-2.loca.lt`, etc.
2. Tests acquire a subdomain from pool before running
3. Return subdomain when done

**Pros:**
- Simple implementation
- Similar to current ngrok setup

**Cons:**
- LocalTunnel reliability concerns
- Still limited concurrent connections
- Need to register each subdomain with OAuth providers

### Option 5: AWS API Gateway + Lambda for Callbacks (Recommended)

**Architecture:**
```
OAuth Provider → API Gateway → Lambda → DynamoDB → Test polls
```

**Implementation:**
1. Deploy API Gateway endpoint: `https://callback.submit.diyaccounting.co.uk`
2. Lambda receives callbacks, stores in DynamoDB with state key
3. Tests poll DynamoDB (or use DynamoDB Streams + WebSocket) for their callback

**Flow:**
```
1. Test generates state=abc123, stores in DynamoDB: { pk: abc123, status: pending }
2. OAuth redirects to: https://callback.submit.../auth/callback?code=xyz&state=abc123
3. Lambda updates DynamoDB: { pk: abc123, status: complete, code: xyz }
4. Test polls DynamoDB, retrieves code
5. Test exchanges code for token (to local mock or real OAuth)
```

**Pros:**
- Uses existing AWS infrastructure
- Infinitely scalable
- Single callback URL
- Already have DynamoDB patterns in codebase

**Cons:**
- Requires infrastructure deployment
- Callback flow change (browser doesn't redirect back to local)

## Recommendation

**Option 5 (AWS API Gateway + Lambda)** is the most robust solution for this project because:

1. Already using AWS infrastructure
2. DynamoDB patterns exist in codebase
3. Single callback URL eliminates OAuth provider re-registration
4. Scales to any number of concurrent tests
5. No external dependencies (ngrok, localtunnel)

**Migration path:**
1. Deploy callback Lambda + API Gateway in existing CDK
2. Update OAuth callback URLs in HMRC/Cognito to new endpoint
3. Modify test flow to poll DynamoDB instead of waiting for redirect
4. Keep ngrok as fallback during transition

## Simple Interim Solution

If immediate fix needed without infrastructure changes:

1. **CI gets priority on ngrok domain** - Configure GitHub Actions to use the reserved domain
2. **Local dev uses different approach** - Use mock OAuth server (already in place) for local testing
3. **Reserve domain in `.env.ci`** - CI-specific ngrok domain
4. **Local uses random ngrok subdomain** - Developers accept manual callback URL registration

This separates CI from local development without infrastructure changes.
