// app/unit-tests/functions/httpProxy.overwire.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { handler as httpProxy } from "@app/functions/infra/hmrcHttpProxy.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { createFailingServer, createRedirectServer, createHttpsEchoServer } from "@app/test-helpers/httpTestServers.js";

// DynamoDB mocks (same pattern as existing tests)
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

// Do not mock http/https: tests spin real local servers on ephemeral ports

describe("httpProxy integration tests", () => {
  beforeEach(() => {
    // reset Dynamo state & errors before each test
    mockDynamoState = {};
    mockDynamoError = null;
    vi.clearAllMocks();
    // Set common defaults
    process.env.STATE_TABLE_NAME = "test-proxy-state-table";
    process.env.RATE_LIMIT_PER_SECOND = "50";
    process.env.BREAKER_ERROR_THRESHOLD = "10";
    process.env.BREAKER_LATENCY_MS = "5000";
    process.env.BREAKER_COOLDOWN_SECONDS = "60";
  });

  test("circuit breaker opens after consecutive errors and resets after cooldown", async () => {
    const failingServer = createFailingServer();
    const port = await failingServer.listen();

    // Configure proxy mapping
    process.env.HMRC_API_PROXY_MAPPED_URL = "https://proxy:7000/proxy/test";
    process.env.HMRC_API_PROXY_EGRESS_URL = `http://localhost:${port}`;
    process.env.RATE_LIMIT_PER_SECOND = "100"; // avoid throttling
    process.env.BREAKER_ERROR_THRESHOLD = "2";
    process.env.BREAKER_COOLDOWN_SECONDS = "1";
    process.env.BREAKER_LATENCY_MS = "10000";

    // Build event once (only path matters here)
    const buildEvent = () =>
      buildLambdaEvent({
        method: "GET",
        protocol: "https",
        host: "proxy:7000",
        path: "/proxy/test/resource",
        headers: {},
      });

    // Two failures should increment error count but still pass through as 500
    const res1 = await httpProxy(buildEvent());
    expect(res1.statusCode).toBe(500);

    const res2 = await httpProxy(buildEvent());
    expect(res2.statusCode).toBe(500);

    // Third call triggers circuit breaker → 503
    const res3 = await httpProxy(buildEvent());
    expect(res3.statusCode).toBe(503);

    // Clear upstream failure and wait for cooldown
    failingServer.setShouldFail(false);
    await new Promise((r) => setTimeout(r, 1100));

    const resAfter = await httpProxy(buildEvent());
    expect(resAfter.statusCode).toBe(200);

    await failingServer.close();
  });

  // TODO: Check this does follow redirects
  test("proxy returns 200 after following", async () => {
    const redirectServer = createRedirectServer();
    const port = await redirectServer.listen();

    process.env.HMRC_API_PROXY_MAPPED_URL = "https://proxy:7000/proxy/redirect";
    process.env.HMRC_API_PROXY_EGRESS_URL = `http://localhost:${port}`;
    process.env.RATE_LIMIT_PER_SECOND = "100";

    const event = buildLambdaEvent({
      method: "GET",
      protocol: "https",
      host: "proxy:7000",
      path: "/proxy/redirect",
      headers: {},
    });

    const response = await httpProxy(event);
    expect(response.statusCode).toBe(200);

    await redirectServer.close();
  });

  test("HTTPS proxy preserves headers and body", async () => {
    // Let Node trust self-signed cert
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const httpsServer = createHttpsEchoServer();
    const port = await httpsServer.listen();

    process.env.HMRC_API_PROXY_MAPPED_URL = "https://proxy:7000/proxy/ssltest/test-hmrc-api";
    process.env.HMRC_API_PROXY_EGRESS_URL = `https://localhost:${port}`;
    process.env.RATE_LIMIT_PER_SECOND = "100";

    const payload = { message: "Hello Proxy" };
    const event = buildLambdaEvent({
      method: "POST",
      protocol: "https",
      host: "proxy:7000",
      path: "/proxy/ssltest/test-hmrc-api",
      headers: { "content-type": "application/json", "x-custom-header": "TestValue" },
      body: JSON.stringify(payload),
    });

    const response = await httpProxy(event);
    expect(response.statusCode).toBe(200);

    const data = JSON.parse(response.body);
    // Received headers should include our custom header (lower-cased by Node)
    expect(data.receivedHeaders["x-custom-header"]).toBe("TestValue");
    // Payload should be echoed back intact
    const body = JSON.parse(data.receivedBody);
    expect(body).toEqual(payload);

    await httpsServer.close();
  });
});
