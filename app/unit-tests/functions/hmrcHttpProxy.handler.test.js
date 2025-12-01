// app/unit-tests/functions/hmrcHttpProxy.handler.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// ---------------------------------------------------------------------------
// Mock AWS SDK DynamoDB at the client level like other lambda tests do
// (e.g. hmrcVatReturnPost.test.js). We provide minimal GetItem/PutItem support
// for rate-limiter and circuit-breaker state used by httpProxyHelper.
// ---------------------------------------------------------------------------
let mockDynamoState;
let mockSend;

vi.mock("@aws-sdk/client-dynamodb", () => {
  mockSend = vi.fn(async (command) => {
    const name = command.constructor.name;
    if (name === "GetItemCommand") {
      const key = command.input.Key.stateKey.S;
      const item = mockDynamoState[key];
      return item ? { Item: item } : {};
    }
    if (name === "PutItemCommand") {
      const key = command.input.Item.stateKey.S;
      mockDynamoState[key] = command.input.Item;
      return {};
    }
    return {};
  });

  class DynamoDBClient {
    send(cmd) {
      return mockSend(cmd);
    }
  }
  class GetItemCommand { constructor(input) { this.input = input; } }
  class PutItemCommand { constructor(input) { this.input = input; } }
  return { DynamoDBClient, GetItemCommand, PutItemCommand };
});

vi.mock("@aws-sdk/util-dynamodb", () => ({
  unmarshall: (item) => {
    const out = {};
    for (const [k, v] of Object.entries(item || {})) {
      if (v.S !== undefined) out[k] = v.S;
      else if (v.N !== undefined) out[k] = Number(v.N);
    }
    return out;
  },
  marshall: (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (typeof v === "number") out[k] = { N: String(v) };
      else if (typeof v === "string") out[k] = { S: v };
    }
    return out;
  },
}));

describe("hmrcHttpProxy handler (Lambda)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockDynamoState = {};
    // Ensure helper picks table name at import-time
    process.env.STATE_TABLE_NAME = "test-proxy-state-table";
    process.env.NODE_ENV = "test";
    // Default proxy mappings for tests
    process.env.HMRC_API_PROXY_MAPPED_URL = "/proxy/hmrc-api";
    process.env.HMRC_API_PROXY_EGRESS_URL = "https://upstream.example.com";
    delete process.env.PROXY_RATE_LIMIT_STORE; // use in-memory bypass in tests by default
    process.env.RATE_LIMIT_PER_SECOND = "5";
    process.env.BREAKER_ERROR_THRESHOLD = "10";
    process.env.BREAKER_LATENCY_MS = "5000";
    process.env.BREAKER_COOLDOWN_SECONDS = "60";
  });

  test("returns 400 for unmapped path", async () => {
    // Mock helper but pass-through real implementation except for proxy call
    vi.doMock("@app/lib/proxyHelper.js", async (importOriginal) => {
      const real = await importOriginal();
      return { ...real, proxyRequestWithRedirects: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: "{}" }) };
    });
    const { handler } = await import("@app/functions/infra/hmrcHttpProxy.js");

    const event = buildLambdaEvent({ method: "GET", path: "/not/mapped", headers: { host: "irrelevant" } });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/No proxy mapping/);
  });

  test("successfully proxies to upstream when mapping matches", async () => {
    const upstreamResponse = { statusCode: 200, headers: { "content-type": "application/json" }, body: '{"ok":true}' };
    vi.doMock("@app/lib/proxyHelper.js", async (importOriginal) => {
      const real = await importOriginal();
      return { ...real, proxyRequestWithRedirects: vi.fn().mockResolvedValue(upstreamResponse) };
    });
    const { handler } = await import("@app/functions/infra/hmrcHttpProxy.js");

    const event = buildLambdaEvent({ method: "GET", path: "/proxy/hmrc-api/resource", headers: { host: "local" }, queryStringParameters: null });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  test("returns 429 when rate limit exceeded using dynamo store", async () => {
    // Enable dynamo-backed rate limiter for deterministic counting
    process.env.PROXY_RATE_LIMIT_STORE = "dynamo";
    process.env.RATE_LIMIT_PER_SECOND = "2";
    vi.doMock("@app/lib/proxyHelper.js", async (importOriginal) => {
      const real = await importOriginal();
      // Keep real rate-limit/breaker logic; stub proxy to a constant value
      return { ...real, proxyRequestWithRedirects: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: "{}" }) };
    });
    const { handler } = await import("@app/functions/infra/hmrcHttpProxy.js");

    const base = { method: "GET", path: "/proxy/hmrc-api/test", headers: { host: "h" } };
    const results = [];
    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await handler(buildLambdaEvent(base)));
    }
    // At least one response should be 429 once limit exceeded
    expect(results.some((r) => r.statusCode === 429)).toBe(true);
  });

  test("returns 503 when circuit breaker is open", async () => {
    // Pre-seed breaker open state in mocked DynamoDB
    const prefix = "/proxy/hmrc-api";
    const stateKey = `breaker:${prefix}`;
    // @aws-sdk/util-dynamodb is mocked; construct item manually
    mockDynamoState[stateKey] = { stateKey: { S: stateKey }, errors: { N: "10" }, openSince: { N: String(Math.floor(Date.now() / 1000) * 1000) } };

    vi.doMock("@app/lib/proxyHelper.js", async (importOriginal) => {
      const real = await importOriginal();
      return { ...real, proxyRequestWithRedirects: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: "{}" }) };
    });
    const { handler } = await import("@app/functions/infra/hmrcHttpProxy.js");

    const res = await handler(buildLambdaEvent({ method: "GET", path: "/proxy/hmrc-api/svc" }));
    expect(res.statusCode).toBe(503);
  });
});
