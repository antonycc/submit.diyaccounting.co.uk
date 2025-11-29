// app/unit-tests/functions/outboundProxyHandler.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { handler as outboundProxyHandler } from "@app/functions/proxy/outboundProxyHandler.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv } from "@app/test-helpers/mockHelpers.js";

// Mock AWS SDK DynamoDB
let mockDynamoState = {};
let mockDynamoError = null;

vi.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = vi.fn(async (command) => {
    if (mockDynamoError) throw mockDynamoError;

    const commandName = command.constructor.name;
    if (commandName === "GetItemCommand") {
      const key = command.input.Key.stateKey.S;
      return mockDynamoState[key] || {};
    }
    if (commandName === "PutItemCommand") {
      const key = command.input.Item.stateKey.S;
      mockDynamoState[key] = { Item: command.input.Item };
      return {};
    }
    return {};
  });

  class MockDynamoDBClient {
    constructor() {
      this.send = mockSend;
    }
  }

  const mockGetItemCommand = vi.fn((input) => ({ constructor: { name: "GetItemCommand" }, input }));
  const mockPutItemCommand = vi.fn((input) => ({ constructor: { name: "PutItemCommand" }, input }));

  return {
    DynamoDBClient: MockDynamoDBClient,
    GetItemCommand: mockGetItemCommand,
    PutItemCommand: mockPutItemCommand,
  };
});

vi.mock("@aws-sdk/util-dynamodb", () => ({
  unmarshall: vi.fn((item) => {
    const result = {};
    for (const [key, value] of Object.entries(item)) {
      if (value.S) result[key] = value.S;
      if (value.N) result[key] = parseInt(value.N, 10);
    }
    return result;
  }),
  marshall: vi.fn((obj) => {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") result[key] = { S: value };
      if (typeof value === "number") result[key] = { N: String(value) };
    }
    return result;
  }),
}));

// Mock https for proxy requests
vi.mock("https", () => ({
  default: {
    request: vi.fn((url, options, callback) => {
      const mockResponse = {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        on: vi.fn((event, handler) => {
          if (event === "data") handler('{"success":true}');
          if (event === "end") handler();
        }),
      };
      setTimeout(() => callback(mockResponse), 10);
      return {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        setTimeout: vi.fn(),
        destroy: vi.fn(),
      };
    }),
  },
}));

describe("outboundProxyHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    process.env.STATE_TABLE_NAME = "test-proxy-state-table";
    process.env.HMRC_API_HOST = "upstream.example.com";
    process.env.HMRC_SANDBOX_API_HOST = "sandbox.example.com";
    process.env.HMRC_API_PROXY_HOST = "test-proxy.example.com";
    process.env.HMRC_SANDBOX_API_PROXY_HOST = "test-sandbox-proxy.example.com";
    process.env.RATE_LIMIT_PER_SECOND = "5";
    process.env.BREAKER_ERROR_THRESHOLD = "10";
    process.env.BREAKER_LATENCY_MS = "3000";
    process.env.BREAKER_COOLDOWN_SECONDS = "60";
    mockDynamoState = {};
    mockDynamoError = null;
    vi.clearAllMocks();
  });

  test("returns 400 when host header is missing", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/test",
      headers: {},
    });
    delete event.headers.host;

    const response = await outboundProxyHandler(event);
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toBe("Missing host header");
  });

  test("returns 404 when proxy host is not configured", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/test",
      headers: { host: "unknown-proxy.example.com" },
    });

    const response = await outboundProxyHandler(event);
    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.message).toContain("Unknown proxy host");
  });

  test("successfully proxies request to configured upstream", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/test",
      headers: { host: "test-proxy.example.com" },
      queryStringParameters: { param: "value" },
    });

    const response = await outboundProxyHandler(event);
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBeDefined();
  });
});
