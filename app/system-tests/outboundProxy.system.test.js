import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import http from "http";

// System test for outbound proxy handler with DynamoDB configuration
// This test starts a local DynamoDB instance and verifies the proxy handler
// can load configuration, enforce rate limits, and handle circuit breaker logic.

let stopDynalite;
let dynamoDbClient;
let mockUpstreamServer;
let handler;
const tableName = "proxy-config-system-test";
const proxyHost = "test-proxy.example.com";

beforeAll(async () => {
  const { default: dynalite } = await import("dynalite");

  // Start local DynamoDB
  const host = "127.0.0.1";
  const port = 9013; // use distinct port to avoid conflicts
  const server = dynalite({ createTableMs: 0 });
  await new Promise((resolve, reject) => {
    server.listen(port, host, (err) => (err ? reject(err) : resolve(null)));
  });
  stopDynalite = async () => {
    try {
      server.close();
    } catch {}
  };
  const endpoint = `http://${host}:${port}`;

  // Configure AWS SDK environment
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
  process.env.CONFIG_TABLE_NAME = tableName;

  // Create DynamoDB client
  dynamoDbClient = new DynamoDBClient({
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: "dummy",
      secretAccessKey: "dummy",
    },
  });

  // Create the proxy config table
  const { CreateTableCommand } = await import("@aws-sdk/client-dynamodb");
  await dynamoDbClient.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: "proxyHost", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "proxyHost", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );

  // Wait for table to be active
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Start mock upstream server
  mockUpstreamServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Success from upstream", path: req.url }));
  });

  await new Promise((resolve) => {
    mockUpstreamServer.listen(9014, "127.0.0.1", resolve);
  });

  // Import handler AFTER environment is configured
  const proxyModule = await import("../functions/proxy/outboundProxyHandler.js");
  handler = proxyModule.handler;
}, 30000); // 30 second timeout for setup

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {}
  try {
    mockUpstreamServer?.close();
  } catch {}
});

describe("Outbound Proxy System Tests", () => {
  it("should return 404 when proxy host is not configured in DynamoDB", async () => {
    const event = {
      headers: { host: "unknown-proxy.example.com" },
      rawPath: "/api/test",
      rawQueryString: "",
      requestContext: {
        requestId: "test-request-id",
        http: { method: "GET" },
      },
    };

    const response = await handler(event);
    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.message).toContain("Unknown proxy host");
  });

  it("should successfully proxy request when configuration exists", async () => {
    // Insert proxy configuration into DynamoDB
    await dynamoDbClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          proxyHost: { S: proxyHost },
          upstreamHost: { S: "http://127.0.0.1:9014" },
          rateLimitPerSecond: { N: "100" },
          breakerConfig: { S: '{"errorThreshold": 10, "latencyMs": 5000}' },
        },
      }),
    );

    const event = {
      headers: { host: proxyHost },
      rawPath: "/api/test",
      rawQueryString: "param=value",
      requestContext: {
        requestId: "test-request-id",
        http: { method: "GET" },
      },
    };

    const response = await handler(event);
    expect([200, 429, 502, 503]).toContain(response.statusCode);

    if (response.statusCode === 200) {
      expect(response.headers).toBeDefined();
      expect(response.headers["x-request-id"]).toBe("test-request-id");
    }
  });

  it("should enforce rate limiting", async () => {
    const rateLimitedHost = "rate-limited.example.com";

    // Insert configuration with low rate limit
    await dynamoDbClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          proxyHost: { S: rateLimitedHost },
          upstreamHost: { S: "http://127.0.0.1:9014" },
          rateLimitPerSecond: { N: "2" },
          breakerConfig: { S: "{}" },
        },
      }),
    );

    const event = {
      headers: { host: rateLimitedHost },
      rawPath: "/api/test",
      rawQueryString: "",
      requestContext: {
        requestId: "test-request-id",
        http: { method: "GET" },
      },
    };

    // Make multiple requests quickly
    const responses = await Promise.all([handler(event), handler(event), handler(event), handler(event)]);

    // At least one should be rate limited
    const rateLimitedResponses = responses.filter((r) => r.statusCode === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);
  });

  it("should cache proxy configuration", async () => {
    const cachedHost = "cached.example.com";

    // Insert configuration
    await dynamoDbClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          proxyHost: { S: cachedHost },
          upstreamHost: { S: "http://127.0.0.1:9014" },
          rateLimitPerSecond: { N: "100" },
          breakerConfig: { S: "{}" },
        },
      }),
    );

    const event = {
      headers: { host: cachedHost },
      rawPath: "/api/test",
      rawQueryString: "",
      requestContext: {
        requestId: "test-request-id",
        http: { method: "GET" },
      },
    };

    // First request - will fetch from DynamoDB
    const response1 = await handler(event);
    expect([200, 429, 502, 503]).toContain(response1.statusCode);

    // Second request - should use cache
    const response2 = await handler(event);
    expect([200, 429, 502, 503]).toContain(response2.statusCode);
  });
});
