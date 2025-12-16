// app/system-tests/hmrcHttpProxy.system.test.js

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Helper to build a minimal HTTP API v2 style event for the proxy
function makeProxyEvent({ method = "GET", path = "/proxy/hmrc-api/test", rawQueryString = "", headers = {} } = {}) {
  return {
    requestContext: {
      http: { method, protocol: "https", host: "submit.test", path },
    },
    headers,
    rawPath: path,
    rawQueryString,
  };
}

describe("System: hmrcHttpProxy handler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    Object.assign(process.env, {
      HMRC_API_PROXY_MAPPED_URL: "https://submit.test/proxy/hmrc-api",
      HMRC_API_PROXY_EGRESS_URL: "https://up.example",
      RATE_LIMIT_PER_SECOND: "100",
      BREAKER_ERROR_THRESHOLD: "10",
      BREAKER_LATENCY_MS: "5000",
      BREAKER_COOLDOWN_SECONDS: "60",
    });
  });

  it("forwards request to upstream and returns its response", async () => {
    // Mock proxy to capture target URL and headers
    vi.doMock("@app/lib/httpProxy.js", async (importOriginal) => {
      const mod = await importOriginal();
      return {
        ...mod,
        proxyRequestWithRedirects: vi.fn(async (targetUrl, options, body) => {
          expect(targetUrl.toString()).toBe("https://up.example/test?a=1");
          expect(options.method).toBe("GET");
          // Expect correlation id propagated
          expect(options.headers["x-correlationid"]).toBe("cid-1");
          return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) };
        }),
      };
    });

    // Allow rate limit and closed breaker
    vi.doMock("@app/data/dynamoDbBreakerRepository.js", () => ({
      checkRateLimit: vi.fn(async () => true),
      loadBreakerState: vi.fn(async () => ({ errors: 0, openSince: 0 })),
      saveBreakerState: vi.fn(async () => undefined),
    }));

    const { handler } = await import("@app/functions/infra/hmrcHttpProxy.js");
    const event = makeProxyEvent({ rawQueryString: "a=1", headers: { "x-request-id": "rid-1", "x-correlationid": "cid-1" } });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    // Ensure correlation header is present in reply
    expect(res.headers["x-correlationid"]).toBe("cid-1");
  });

  it("returns 503 when circuit is open", async () => {
    vi.doMock("@app/lib/httpProxy.js", async (importOriginal) => {
      const mod = await importOriginal();
      return {
        ...mod,
        proxyRequestWithRedirects: vi.fn(async () => ({ statusCode: 200, headers: {}, body: "{}" })),
      };
    });
    vi.doMock("@app/data/dynamoDbBreakerRepository.js", () => ({
      checkRateLimit: vi.fn(async () => true),
      loadBreakerState: vi.fn(async () => ({ errors: 5, openSince: Date.now() })),
      saveBreakerState: vi.fn(async () => undefined),
    }));

    const { handler } = await import("@app/functions/infra/hmrcHttpProxy.js");
    const res = await handler(makeProxyEvent({ rawQueryString: "a=1" }));
    expect(res.statusCode).toBe(503);
  });
});
