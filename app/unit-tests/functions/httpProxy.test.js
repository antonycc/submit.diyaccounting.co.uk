// app/unit-tests/functions/httpProxy.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { handler as httpProxy } from "@app/functions/infra/httpProxy.js";
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

// Mock https (and http) for proxy requests
vi.mock("https", () => {
  return {
    default: {
      request: (url, options, callback) => {
        const res = {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          on: (event, handler) => {
            if (event === "data") handler('{"success": true}');
            if (event === "end") handler();
          },
        };
        // simulate async
        setTimeout(() => callback(res), 0);
        return {
          on: () => {},
          write: () => {},
          end: () => {},
          setTimeout: () => {},
          destroy: () => {},
        };
      },
    },
  };
});

// (Optional) also mock http in case your code tries http for non-https URLs
vi.mock("http", () => {
  return {
    default: {
      request: (url, options, callback) => {
        const res = {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          on: (event, handler) => {
            if (event === "data") handler('{"success": true}');
            if (event === "end") handler();
          },
        };
        setTimeout(() => callback(res), 0);
        return {
          on: () => {},
          write: () => {},
          end: () => {},
          setTimeout: () => {},
          destroy: () => {},
        };
      },
    },
  };
});

describe("httpProxy handler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    process.env.STATE_TABLE_NAME = "test-proxy-state-table";
    process.env.HMRC_API_PROXY_MAPPED_PREFIX = "/proxy/hmrc-api";
    process.env.HMRC_API_PROXY_EGRESS_URL = "https://upstream.example.com";
    process.env.HMRC_SANDBOX_API_PROXY_MAPPED_PREFIX = "/proxy/hmrc-sandbox-api";
    process.env.HMRC_SANDBOX_API_PROXY_EGRESS_URL = "https://sandbox.example.com";
    process.env.RATE_LIMIT_PER_SECOND = "5";
    process.env.BREAKER_ERROR_THRESHOLD = "10";
    process.env.BREAKER_LATENCY_MS = "3000";
    process.env.BREAKER_COOLDOWN_SECONDS = "60";
    mockDynamoState = {};
    mockDynamoError = null;
    vi.clearAllMocks();
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

  test("rate-limit enforces limit", async () => {
    // simulate more than RATE_LIMIT_PER_SECOND requests in one second
    const baseEvent = {
      method: "GET",
      path: "/proxy/hmrc-api/test",
      headers: { host: "whatever" },
    };

    const promises = [];
    for (let i = 0; i < Number(process.env.RATE_LIMIT_PER_SECOND) + 2; i++) {
      promises.push(httpProxy(buildLambdaEvent(baseEvent)));
    }
    const results = await Promise.all(promises);
    const overLimit = results.find((r) => r.statusCode === 429);
    expect(overLimit).toBeDefined();
  });
});
