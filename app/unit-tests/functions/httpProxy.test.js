// app/unit-tests/functions/httpProxy.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { handler as httpProxy } from "@app/functions/infra/hmrcHttpProxy.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv } from "@app/test-helpers/mockHelpers.js";

// Mock AWS SDK DynamoDB
let mockDynamoState = {};
let mockDynamoError = null;

vi.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = vi.fn(async (command) => {
    if (mockDynamoError) throw mockDynamoError;

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

  return {
    DynamoDBClient: class {
      send(cmd) {
        return mockSend(cmd);
      }
    },
    GetItemCommand: function (input) {
      this.input = input;
    },
    PutItemCommand: function (input) {
      this.input = input;
    },
  };
});

vi.mock("@aws-sdk/util-dynamodb", () => ({
  unmarshall: (item) => {
    const result = {};
    for (const [k, v] of Object.entries(item)) {
      if (v.S !== undefined) result[k] = v.S;
      if (v.N !== undefined) result[k] = Number(v.N);
    }
    return result;
  },
  marshall: (obj) => {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") result[k] = { S: v };
      else if (typeof v === "number") result[k] = { N: String(v) };
    }
    return result;
  },
}));

// Dynamic mock of https/http to support redirect scenarios and capturing calls
let httpDecider;
let httpCalls;
function makeRequestMock(protocol) {
  return (url, options, callback) => {
    const u = typeof url === "string" ? new URL(url) : url;
    const call = { protocol, url: u.toString(), method: (options?.method || "GET").toUpperCase(), body: "" };
    httpCalls.push(call);

    // Decide response based on provided decider or default
    const decided = httpDecider
      ? httpDecider({ url: u, options })
      : { statusCode: 200, headers: { "content-type": "application/json" }, body: '{"success": true}' };

    const res = {
      statusCode: decided.statusCode,
      headers: decided.headers || { "content-type": "application/json" },
      on: (event, handler) => {
        if (event === "data" && decided.body !== undefined) handler(decided.body);
        if (event === "end") handler();
      },
    };
    // simulate async
    setTimeout(() => callback(res), 0);
    return {
      on: () => {},
      write: (chunk) => {
        call.body += typeof chunk === "string" ? chunk : chunk?.toString?.("utf8") || "";
      },
      end: () => {},
      setTimeout: () => {},
      destroy: () => {},
    };
  };
}

vi.mock("https", () => ({
  default: { request: makeRequestMock("https:") },
}));
vi.mock("http", () => ({
  default: { request: makeRequestMock("http:") },
}));

describe.skip("httpProxy handler (legacy combined tests) — superseded by split tests", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    process.env.STATE_TABLE_NAME = "test-proxy-state-table";
    process.env.HMRC_API_PROXY_MAPPED_URL = "/proxy/hmrc-api";
    process.env.HMRC_API_PROXY_EGRESS_URL = "https://upstream.example.com";
    process.env.HMRC_SANDBOX_API_PROXY_MAPPED_URL = "/proxy/hmrc-sandbox-api";
    process.env.HMRC_SANDBOX_API_PROXY_EGRESS_URL = "https://sandbox.example.com";
    process.env.RATE_LIMIT_PER_SECOND = "5";
    process.env.BREAKER_ERROR_THRESHOLD = "10";
    process.env.BREAKER_LATENCY_MS = "3000";
    process.env.BREAKER_COOLDOWN_SECONDS = "60";
    mockDynamoState = {};
    mockDynamoError = null;
    vi.clearAllMocks();
    httpCalls = [];
    httpDecider = null;
  });

  test("returns 400 when path does not match any mapping", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/invalid/path",
      headers: { host: "some-host" },
    });

    const res = await httpProxy(event);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/No proxy mapping/);
  });

  test("successfully proxies request to configured upstream", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/proxy/hmrc-api/some/resource",
      headers: { host: "ignored-in-path-based-mapping" },
      rawQueryString: "foo=bar",
    });

    const res = await httpProxy(event);
    expect(res.statusCode).toBe(200);
    // since your proxy code does not currently add x-request-id in response headers,
    // just check we got a JSON body with the expected content
    const body = JSON.parse(res.body);
    expect(body).toEqual({ success: true });
  });

  test("follows 301 redirect with absolute Location", async () => {
    httpDecider = ({ url }) => {
      if (url.pathname === "/redirect") {
        return { statusCode: 301, headers: { location: "https://upstream.example.com/final" }, body: "" };
      }
      if (url.pathname === "/final") {
        return { statusCode: 200, headers: { "content-type": "application/json" }, body: '{"ok":true}' };
      }
      return { statusCode: 404, headers: {}, body: "" };
    };

    const event = buildLambdaEvent({ method: "GET", path: "/proxy/hmrc-api/redirect" });
    const res = await httpProxy(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    // Should have made two requests
    expect(httpCalls.length).toBe(2);
    expect(new URL(httpCalls[0].url).pathname).toBe("/redirect");
    expect(new URL(httpCalls[1].url).pathname).toBe("/final");
  });

  test("resolves relative Location on 302 redirect", async () => {
    httpDecider = ({ url }) => {
      if (url.pathname === "/rel-start") {
        return { statusCode: 302, headers: { location: "/rel-final" }, body: "" };
      }
      if (url.pathname === "/rel-final") {
        return { statusCode: 200, headers: { "content-type": "application/json" }, body: '{"rel":true}' };
      }
      return { statusCode: 404, headers: {}, body: "" };
    };

    const event = buildLambdaEvent({ method: "GET", path: "/proxy/hmrc-api/rel-start" });
    const res = await httpProxy(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ rel: true });
  });

  test("303 changes method to GET and drops body", async () => {
    httpDecider = ({ url, options }) => {
      if (url.pathname === "/to-303") {
        return { statusCode: 303, headers: { location: "/get-target" }, body: "" };
      }
      if (url.pathname === "/get-target") {
        return { statusCode: 200, headers: { "content-type": "application/json" }, body: '{"after":"get"}' };
      }
      return { statusCode: 404, headers: {}, body: "" };
    };

    const event = buildLambdaEvent({ method: "POST", path: "/proxy/hmrc-api/to-303", body: { a: 1 } });
    const res = await httpProxy(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ after: "get" });
    // First call was POST with body, second should be GET with no body
    expect(httpCalls[0].method).toBe("POST");
    expect(httpCalls[0].body).toContain('"a":1');
    expect(httpCalls[1].method).toBe("GET");
    expect(httpCalls[1].body).toBe("");
  });

  test("307 preserves method and body", async () => {
    httpDecider = ({ url }) => {
      if (url.pathname === "/to-307") {
        return { statusCode: 307, headers: { location: "/same-method" }, body: "" };
      }
      if (url.pathname === "/same-method") {
        return { statusCode: 200, headers: { "content-type": "application/json" }, body: '{"ok":true}' };
      }
      return { statusCode: 404, headers: {}, body: "" };
    };

    const res = await httpProxy(buildLambdaEvent({ method: "PUT", path: "/proxy/hmrc-api/to-307", body: { b: 2 } }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(httpCalls[0].method).toBe("PUT");
    expect(httpCalls[0].body).toContain('"b":2');
    expect(httpCalls[1].method).toBe("PUT");
    expect(httpCalls[1].body).toContain('"b":2');
  });

  test("returns 508 when exceeding max redirects", async () => {
    // Bounce between two URLs more than MAX_REDIRECTS
    httpDecider = ({ url }) => {
      if (url.pathname === "/loop-a") return { statusCode: 301, headers: { location: "/loop-b" }, body: "" };
      if (url.pathname === "/loop-b") return { statusCode: 302, headers: { location: "/loop-a" }, body: "" };
      return { statusCode: 404, headers: {}, body: "" };
    };

    const res = await httpProxy(buildLambdaEvent({ method: "GET", path: "/proxy/hmrc-api/loop-a" }));
    expect(res.statusCode).toBe(508);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/Too many redirects/);
  });

  test("rate-limit enforces limit", async () => {
    // Use Dynamo-backed rate limiter for deterministic counting in tests
    process.env.PROXY_RATE_LIMIT_STORE = "dynamo";
    mockDynamoState = {};
    // simulate more than RATE_LIMIT_PER_SECOND requests in one second
    const baseEvent = {
      method: "GET",
      path: "/proxy/hmrc-api/test",
      headers: { host: "whatever" },
    };

    const results = [];
    for (let i = 0; i < Number(process.env.RATE_LIMIT_PER_SECOND) + 2; i++) {
      // run sequentially to avoid race conditions in mocked dynamo
      // eslint-disable-next-line no-await-in-loop
      results.push(await httpProxy(buildLambdaEvent(baseEvent)));
    }
    const overLimit = results.find((r) => r.statusCode === 429);
    expect(overLimit).toBeDefined();
  });
});
