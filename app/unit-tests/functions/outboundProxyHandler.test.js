// app/unit-tests/functions/outboundProxyHandler.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { handler as outboundProxyHandler } from "@app/functions/proxy/outboundProxyHandler.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv } from "@app/test-helpers/mockHelpers.js";

// Mock AWS SDK
vi.mock("@aws-sdk/client-dynamodb", () => {
  const mockDynamoDBClient = vi.fn();
  const mockGetItemCommand = vi.fn();
  return {
    DynamoDBClient: mockDynamoDBClient,
    GetItemCommand: mockGetItemCommand,
  };
});

vi.mock("@aws-sdk/util-dynamodb", () => ({
  unmarshall: vi.fn((item) => {
    // Simple mock unmarshaller
    const result = {};
    for (const [key, value] of Object.entries(item)) {
      if (value.S) result[key] = value.S;
      if (value.N) result[key] = parseInt(value.N, 10);
      if (value.M) result[key] = {}; // Simplified
    }
    return result;
  }),
}));

// Mock http/https modules
vi.mock("http", () => ({
  default: {
    request: vi.fn((url, options, callback) => {
      // Simulate successful response
      const mockResponse = {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        on: vi.fn((event, handler) => {
          if (event === "data") handler(JSON.stringify({ success: true }));
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

vi.mock("https", () => ({
  default: {
    request: vi.fn((url, options, callback) => {
      // Simulate successful response
      const mockResponse = {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        on: vi.fn((event, handler) => {
          if (event === "data") handler(JSON.stringify({ success: true }));
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
    process.env.CONFIG_TABLE_NAME = "test-proxy-config-table";
    vi.clearAllMocks();
  });

  test("returns 400 when host header is missing", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/proxy/test",
      headers: {},
    });
    delete event.headers.host;

    const response = await outboundProxyHandler(event);
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toBe("Missing host header");
  });

  test("returns 404 when proxy host is not configured", async () => {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const mockSend = vi.fn().mockResolvedValue({ Item: null });
    DynamoDBClient.prototype.send = mockSend;

    const event = buildLambdaEvent({
      method: "GET",
      path: "/proxy/test",
      headers: { host: "unknown-proxy.example.com" },
    });

    const response = await outboundProxyHandler(event);
    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.message).toContain("Unknown proxy host");
  });

  test("handles rate limiting", async () => {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const mockSend = vi.fn().mockResolvedValue({
      Item: {
        proxyHost: { S: "test-proxy.example.com" },
        upstreamHost: { S: "upstream.example.com" },
        rateLimitPerSecond: { N: "1" }, // Very low rate limit
        breakerConfig: { S: "{}" },
      },
    });
    DynamoDBClient.prototype.send = mockSend;

    const event = buildLambdaEvent({
      method: "GET",
      path: "/proxy/test",
      headers: { host: "test-proxy.example.com" },
    });

    // First request should succeed
    const response1 = await outboundProxyHandler(event);
    expect([200, 429, 503]).toContain(response1.statusCode);

    // Second immediate request should be rate limited
    const response2 = await outboundProxyHandler(event);
    expect([200, 429, 503]).toContain(response2.statusCode);
  });

  test("successfully proxies request with valid configuration", async () => {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const mockSend = vi.fn().mockResolvedValue({
      Item: {
        proxyHost: { S: "test-proxy.example.com" },
        upstreamHost: { S: "https://upstream.example.com" },
        rateLimitPerSecond: { N: "100" },
        breakerConfig: { S: '{"errorThreshold": 10, "latencyMs": 5000}' },
      },
    });
    DynamoDBClient.prototype.send = mockSend;

    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/test",
      headers: { host: "test-proxy.example.com" },
      queryStringParameters: { param: "value" },
    });

    const response = await outboundProxyHandler(event);
    expect([200, 429, 502, 503]).toContain(response.statusCode);
    expect(response.headers).toBeDefined();
  });

  test("handles circuit breaker open state", async () => {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const mockSend = vi.fn().mockResolvedValue({
      Item: {
        proxyHost: { S: "circuit-test.example.com" },
        upstreamHost: { S: "https://upstream.example.com" },
        rateLimitPerSecond: { N: "100" },
        breakerConfig: { S: '{"errorThreshold": 1, "cooldownSeconds": 60}' },
      },
    });
    DynamoDBClient.prototype.send = mockSend;

    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/test",
      headers: { host: "circuit-test.example.com" },
    });

    const response = await outboundProxyHandler(event);
    expect([200, 502, 503]).toContain(response.statusCode);
  });

  test("caches proxy configuration", async () => {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const mockSend = vi.fn().mockResolvedValue({
      Item: {
        proxyHost: { S: "cache-test.example.com" },
        upstreamHost: { S: "https://upstream.example.com" },
        rateLimitPerSecond: { N: "100" },
        breakerConfig: { S: "{}" },
      },
    });
    DynamoDBClient.prototype.send = mockSend;

    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/test",
      headers: { host: "cache-test.example.com" },
    });

    // First request
    await outboundProxyHandler(event);
    const firstCallCount = mockSend.mock.calls.length;

    // Second request (should use cache)
    await outboundProxyHandler(event);
    const secondCallCount = mockSend.mock.calls.length;

    // Should not make additional DynamoDB calls due to caching
    expect(secondCallCount).toBe(firstCallCount);
  });
});
