### Goal
Production-safe, high-fidelity observability without turning up logging during incidents. Deliver:
- End-to-end correlation (browser ➜ CloudFront ➜ Lambda ➜ S3 ➜ CloudWatch)
- Consistent JSON logs with redaction
- Metrics/tracing and sampling that are always-on and low-noise
- Clear separation of business, audit, and security logs
- Minimal CDK and code changes that fit your current architecture

Below is a practical, incremental plan tailored to your stack (CloudFront + S3 + Lambda URLs + optional Cognito), with concrete snippets and CDK changes.

---

### Observability design principles (Uncle Bob + Fowler hybrid)
- Single Responsibility: each layer logs what only it knows best (browser UX + user intent, edge request metadata, business operation results, infrastructure events).
- Structured logs over free text: JSON with stable keys. Easy to parse, search, and build dashboards from.
- Make implicit context explicit: Always attach correlation IDs, tenant/user identifiers (non-PII or pseudonymized), feature flags, and deployment identifiers.
- Conservative by default, explicit for sensitive data: Redact secrets; allow opt-in for verbose payload captures with gating and sampling.
- Minimize “global switches”: per-use-case sampling and stable INFO-level logs avoid log-level escalation in prod.
- Lean on platform: Use CloudFront and S3 access logs plus optional real-time logs judiciously; keep retention/sampling limited for cost.

---

### End-to-end correlation model
- Browser generates request_id and session_id (UUID v4), persists session_id in localStorage or a secure, httpOnly cookie if possible; request_id per request in header X-Request-Id. Also include X-Session-Id.
- CloudFront preserves headers (your LambdaUrlOrigin uses OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER, so X-* headers are forwarded).
- Lambdas log:
    - awsRequestId, optional X-Ray trace id
    - x-request-id, x-session-id, user identity (Cognito sub if present) or anonymous
    - version info: env, commit hash, baseImageTag
- S3 and CloudFront logs: you already forward access logs through Lambda to CloudWatch; include request_id for joining where feasible (via real-time logs or custom headers echoed back to the client).

Recommendation:
- Echo X-Request-Id in responses so users can share it with support.
- Optionally set a Set-Cookie or localStorage correlation_id on first response (subject to your privacy policy).

---

### What to log and where
- Browser (INFO)
    - action: navigation, meaningful clicks, API call start/end, errors
    - meta: request_id, session_id, page, feature_flag, anonymized user id or Cognito sub when available
    - never log tokens or PII; mask emails if logged (hash or truncate)
- Lambda (INFO)
    - request: method, path, request_id, session_id, CF request id, user sub, allow-listed headers, payload size only
    - business events: VAT_SUBMISSION_REQUESTED/SUCCEEDED/FAILED with external correlation if available
    - timings: total duration_ms, external call durations
    - outcome: status_code, error_kind, retryable
- Security/Audit (INFO)
    - auth failures with reason codes (no payloads)
    - suspicious rates (throttling, 4xx/5xx spikes per IP/session/user)
    - Cognito auth events via log delivery
- Metrics
    - Count events; latency histograms; error rates; avoid high-cardinality labels
    - Use CloudWatch EMF or Lambda Powertools Metrics
- Tracing
    - Enable X-Ray only where it adds value (HMRC/Google calls, submitVat) to control cost

---

### Redaction rules
- Strip or mask: Authorization, Set-Cookie, tokens, secrets, email, phone
- Log body only for specific error cases with sampling (e.g., 1%) or with an explicit debugging cookie/feature flag
- Before logging JSON, run a key-based redactor with default sensitive key list ["password","secret","token","authorization","cookie","email","phone","ssn"]

---

### Concrete code: browser logging utility
Add to web/public/js/logger.js and use it across pages.

```js
// web/public/js/logger.js
const SENSITIVE_KEYS = ['authorization','token','cookie','password','secret','email','phone'];

function uuidv4() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8);
      return v.toString(16);
    });
}

function redact(obj, depth=0) {
  if (obj == null || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) return obj.map(v => redact(v, depth+1));
  const out = {};
  for (const [k,v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object') {
      out[k] = redact(v, depth+1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const sessionId = (() => {
  const key = 'obs_session_id';
  let val = localStorage.getItem(key);
  if (!val) { val = uuidv4(); localStorage.setItem(key, val); }
  return val;
})();

export function newRequestId() { return uuidv4(); }

export function log(level, event, data = {}) {
  const record = {
    ts: new Date().toISOString(),
    level, event,
    session_id: sessionId,
    page: location.pathname + location.search,
    ...redact(data),
  };
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(record));
}

export async function fetchWithLog(input, init = {}, extra = {}) {
  const requestId = newRequestId();
  const headers = new Headers(init.headers || {});
  headers.set('X-Request-Id', requestId);
  headers.set('X-Session-Id', sessionId);

  const started = performance.now();
  log('info', 'api_request_started', { request_id: requestId, url: typeof input === 'string' ? input : input.url, method: (init.method||'GET') });

  try {
    const res = await fetch(input, { ...init, headers });
    const duration_ms = Math.round(performance.now() - started);
    log('info', 'api_request_finished', { request_id: requestId, status: res.status, duration_ms });
    return res;
  } catch (err) {
    const duration_ms = Math.round(performance.now() - started);
    log('error', 'api_request_error', { request_id: requestId, duration_ms, error: String(err) });
    throw err;
  }
}
```

Usage:
```html
<script type="module">
  import { fetchWithLog, log } from '/js/logger.js';
  log('info', 'page_view', { feature: 'submit_vat' });
  // Example API call
  // const res = await fetchWithLog('/api/submit-vat', { method: 'POST', body: ... });
</script>
```

---

### Concrete code: Lambda logging wrapper with Powertools
Add a reusable wrapper for consistent structured logs, metrics, and tracing.

Dockerfile addition inside each Lambda image build:
```
RUN npm install @aws-lambda-powertools/logger @aws-lambda-powertools/metrics @aws-lambda-powertools/tracer
```

Wrapper:
```ts
// app/lib/obs.ts
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

const serviceName = process.env.SERVICE_NAME || 'submit-web';
export const logger = new Logger({ serviceName, logLevel: 'INFO' });
export const metrics = new Metrics({ namespace: 'DIYAccounting', serviceName });
export const tracer = new Tracer({ serviceName });

const SENSITIVE_KEYS = ['authorization','token','cookie','password','secret','email','phone'];

function redact(obj: any, depth = 0): any {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) return obj.map(v => redact(v, depth+1));
  const out: any = {};
  for (const k of Object.keys(obj)) {
    const v = (obj as any)[k];
    if (SENSITIVE_KEYS.includes(k.toLowerCase())) out[k] = '[REDACTED]';
    else out[k] = typeof v === 'object' ? redact(v, depth+1) : v;
  }
  return out;
}

export function withObs<TEvent extends APIGatewayProxyEventV2, TResult>(
  fn: (event: TEvent, context: Context) => Promise<TResult>
) {
  return async (event: TEvent, context: Context): Promise<TResult> => {
    const requestId = event.headers?.['x-request-id'] || event.headers?.['X-Request-Id'] || context.awsRequestId;
    const sessionId = event.headers?.['x-session-id'] || null;
    const userSub = (event as any).requestContext?.authorizer?.jwt?.claims?.sub || null;
    const start = Date.now();

    logger.appendKeys({
      request_id: requestId,
      session_id: sessionId,
      user_sub: userSub,
      env: process.env.ENV_NAME || 'dev',
      commit: process.env.COMMIT_HASH || null,
      image: process.env.BASE_IMAGE_TAG || null,
      path: (event as any).rawPath,
      method: (event as any).requestContext?.http?.method,
      cf_request_id: (event as any).requestContext?.requestId,
    });

    logger.info('request_received', {
      headers: {
        'user-agent': event.headers?.['user-agent'],
        'accept': event.headers?.['accept'],
      },
      qs: redact((event as any).queryStringParameters),
      body_len: (event as any).body ? Buffer.byteLength((event as any).body, 'utf8') : 0,
    });

    try {
      const result: any = await fn(event, context);
      const duration_ms = Date.now() - start;

      metrics.addMetric('RequestLatency', MetricUnits.Milliseconds, duration_ms);
      metrics.addMetric('RequestCount', MetricUnits.Count, 1);

      // Ensure X-Request-Id is echoed in responses when possible
      if (result && typeof result === 'object') {
        result.headers = Object.assign({}, result.headers, { 'x-request-id': requestId });
      }

      logger.info('request_succeeded', { duration_ms });
      return result;
    } catch (err: any) {
      const duration_ms = Date.now() - start;
      metrics.addMetric('RequestErrors', MetricUnits.Count, 1);

      const sampled = Math.random() < 0.01; // 1% sampling of redacted event
      logger.error('request_failed', {
        duration_ms,
        error_name: err?.name,
        error_message: err?.message,
        ...(sampled ? { sampled_event: redact(event) } : {}),
      });
      throw err;
    } finally {
      await metrics.publishStoredMetrics();
    }
  };
}
```

Use per handler:
```ts
// app/functions/submitVat.httpPost.ts
import { withObs, logger, tracer } from '../lib/obs';

export const handler = withObs(async (event, context) => {
  // logger.info('vat_submission_requested', { ...nonPII });
  return { statusCode: 200, body: JSON.stringify({ ok: true }), headers: { 'content-type': 'application/json' } };
});
```

---

### CDK adjustments to wire everything
- For each Lambda in WebStack, add env entries in the environment() map:
    - ENV_NAME -> builder.env
    - COMMIT_HASH -> builder.commitHash
    - BASE_IMAGE_TAG -> builder.baseImageTag
    - SERVICE_NAME -> a stable id per function (e.g., submit-web-submitVat)

- Keep OriginRequestPolicy as is (it forwards custom headers). Ensure responses from Lambdas include x-request-id header (done in wrapper above).

- X-Ray: set xRayEnabled = true for submitVat and exchange* Lambdas via your existing flags; keep others false to reduce cost.

- Cognito: in cdk.json, set "cognitoEnableLogDelivery": "true" in the envs where you want CloudWatch logs for userAuthEvents and userNotification. Retain trigger Lambdas if jar exists.

- Optional CloudFront Real-Time Logs: configure with fields: timestamp, c-ip, cs-method, cs-uri-stem, sc-status, cs(User-Agent), cs(X-Request-Id). Sample at 1-10% normally; allow a flag to raise to 100% temporarily.

- Retention: keep your existing 30-day access logs; consider 14-day default for Lambda logs unless regulated; you already control via RetentionDaysConverter.

- Defense in depth for Function URLs (optional): add a custom Origin header X-Edge-Auth from CloudFront with a secret from SSM, validate in Lambda.

---

### Security posture
- Never log tokens or secrets; use ARNs to fetch from Secrets Manager as you do.
- Prefer hashing identifiers with a pepper from SSM when you need to correlate without exposing raw PII.
- Rate-limit detailed payload capture via sampling or debug cookies, not by raising log level globally.

---

### Querying and dashboards (CloudWatch Logs Insights)
- Request failures:
```
fields @timestamp, request_id, path, method, error_name, error_message, duration_ms
| filter @message like /"request_failed"/
| sort @timestamp desc
| limit 100
```
- Latency p95 by log stream (function):
```
fields duration_ms, @log
| filter @message like /"request_succeeded"/
| stats pct(duration_ms,95) by @log
```

Build CloudWatch dashboards for RequestCount, RequestErrors, RequestLatency per lambda. For S3/CloudFront logs, use Athena when needed and join via request_id if present in log fields.

---

### Minimal change list to implement now
1) Frontend
- Add web/public/js/logger.js
- Wrap critical fetch() calls with fetchWithLog
- Show X-Request-Id on error pages for support

2) Lambda
- Add Powertools-based obs wrapper and use it in all handlers
- Always echo x-request-id in responses

3) CDK
- Add ENV_NAME, COMMIT_HASH, BASE_IMAGE_TAG, SERVICE_NAME to each Lambda environment
- Enable xRayEnabled selectively for submitVat and exchange* lambdas
- Set cognitoEnableLogDelivery to true where desired

4) Redaction
- Ensure any existing logs run through the redactor; remove any raw event console.logs

5) Cost/retention
- Keep 30-day access logs; evaluate 14-day Lambda logs in non-regulated envs

---

### Stretch options
- CloudFront Function to inject X-Edge-Request-Id if missing; Lambdas fallback to it or awsRequestId
- User diagnostic toggle via cookie debug=true to increase only client-side verbosity
- Optional client error tracking (e.g., Sentry) using the same request_id/session_id

---

### Success checklist
- [ ] Every browser request includes X-Request-Id and X-Session-Id
- [ ] Every Lambda response echoes X-Request-Id
- [ ] Logs are JSON, redacted, and include env/commit/function/meta
- [ ] Metrics for count, latency, errors published per lambda
- [ ] Optional X-Ray enabled for external integrations
- [ ] Cognito log delivery enabled with retention
- [ ] CloudFront/S3 access logs can be joined via request_id when needed
- [ ] No secrets/tokens/PII in logs; sampling used for rare payload capture

This plan gives you production-ready observability with minimal ongoing toil, aligned with clean-code and evolutionary design practices while maintaining a strong security posture.