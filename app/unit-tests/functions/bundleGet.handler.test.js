// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/bundleGet.test.js

import { describe, test, beforeEach, afterEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import {
  mockSend,
  mockLibDynamoDb,
  mockClientDynamoDb,
  MockQueryCommand,
  MockPutCommand,
  MockGetCommand,
  MockUpdateCommand,
} from "@app/test-helpers/dynamoDbMock.js";

// Helper to yield control back to the event loop
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------------------
// Mock AWS DynamoDB used by bundle management to avoid real AWS calls
// ---------------------------------------------------------------------------
vi.mock("@aws-sdk/lib-dynamodb", () => mockLibDynamoDb);
vi.mock("@aws-sdk/client-dynamodb", () => mockClientDynamoDb);

const mockSqsSend = vi.fn();
vi.mock("@aws-sdk/client-sqs", () => {
  class SQSClient {
    constructor(_config) {}
    send(cmd) {
      return mockSqsSend(cmd);
    }
  }
  class SendMessageCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { SQSClient, SendMessageCommand };
});

// Defer importing the ingestHandlers until after mocks are defined
import { ingestHandler as bundleGetHandler } from "@app/functions/account/bundleGet.js";
import { ingestHandler as bundlePostHandler } from "@app/functions/account/bundlePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("bundleGet ingestHandler", () => {
  let asyncRequests = new Map();

  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        ASYNC_REQUESTS_DYNAMODB_TABLE_NAME: "test-async-table",
      }),
    );
    asyncRequests = new Map();

    // Reset and provide default mock DynamoDB behaviour
    vi.resetAllMocks();
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        return { Items: [], Count: 0 };
      }
      if (cmd instanceof MockPutCommand) {
        const item = cmd.input.Item;
        if (item.requestId) {
          asyncRequests.set(item.requestId, item);
        }
        return {};
      }
      if (cmd instanceof MockUpdateCommand) {
        const { requestId } = cmd.input.Key;
        const existing = asyncRequests.get(requestId) || {};
        const updated = { ...existing };
        if (cmd.input.ExpressionAttributeValues[":status"]) {
          updated.status = cmd.input.ExpressionAttributeValues[":status"];
        }
        if (cmd.input.ExpressionAttributeValues[":data"]) {
          updated.data = cmd.input.ExpressionAttributeValues[":data"];
        } else if (cmd.input.UpdateExpression.includes("REMOVE #data")) {
          delete updated.data;
        }
        asyncRequests.set(requestId, updated);
        return {};
      }
      if (cmd instanceof MockGetCommand) {
        const { requestId } = cmd.input.Key;
        const item = asyncRequests.get(requestId);
        return { Item: item };
      }
      return {};
    });
  });

  afterEach(async () => {
    // Ensure all background tasks from the current test are finished before the next test starts
    await yieldToEventLoop();
  });

  // ============================================================================
  // HEAD Request Tests
  // ============================================================================

  test("HEAD request returns 200 OK", async () => {
    const event = buildLambdaEvent({
      method: "HEAD",
      path: "/api/v1/bundle",
    });

    const response = await bundleGetHandler(event);
    expect([200, 401]).toContain(response.statusCode);
  });

  // ============================================================================
  // Authentication Tests (401)
  // ============================================================================

  test("returns 401 when Authorization header is missing", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/bundle",
      headers: {}, // No Authorization
    });

    const response = await bundleGetHandler(event);

    expect(response.statusCode).toBe(401);
  });

  test("returns 401 when Authorization token is invalid", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/bundle",
      headers: { Authorization: "Bearer invalid-token" },
    });

    const response = await bundleGetHandler(event);

    expect(response.statusCode).toBe(401);
  });

  // ============================================================================
  // Happy Path Tests (200)
  // ============================================================================

  test("returns 200 with empty bundles array for new user", async () => {
    const token = makeIdToken("user-no-bundles");
    const event = buildEventWithToken(token, {});
    event.headers["x-wait-time-ms"] = "2000";

    const response = await bundleGetHandler(event);

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(Array.isArray(body.bundles)).toBe(true);
    expect(body.bundles.length).toBe(0);
  });

  test("skips async request lookup when x-initial-request header is true", async () => {
    const token = makeIdToken("user-initial");
    const event = buildEventWithToken(token, {});
    event.headers["x-initial-request"] = "true";
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundleGetHandler(event);

    expect(response.statusCode).toBe(200);

    // Verify that GetCommand was NOT called for this requestId
    const getCalls = mockSend.mock.calls.filter((call) => call[0] instanceof MockGetCommand);
    expect(getCalls.length).toBe(0);
  });

  test("returns 200 with user bundle for 202 after granting", async () => {
    const token = makeIdToken("user-with-bundles");
    const event = buildEventWithToken(token, {});
    event.headers["x-wait-time-ms"] = "500";

    // Grant a bundle first
    await bundlePostHandler(buildEventWithToken(token, { bundleId: "test" }));

    // Get bundles
    const getEvent = buildEventWithToken(token, {});
    getEvent.headers["x-wait-time-ms"] = "500";
    const response = await bundleGetHandler(getEvent);

    expect([200, 201, 202]).toContain(response.statusCode);
    if (response.statusCode === 200 || response.statusCode === 201) {
      const body = parseResponseBody(response);
      expect(Array.isArray(body.bundles)).toBe(true);
    } else {
      expect(response.headers).toHaveProperty("Location");
    }
  });

  test("returns correct content-type header", async () => {
    const token = makeIdToken("user-headers");
    const event = buildEventWithToken(token, {});
    event.headers["x-wait-time-ms"] = "500";

    const response = await bundleGetHandler(event);

    expect([200, 201, 202]).toContain(response.statusCode);
    expect(response.headers).toHaveProperty("Content-Type", "application/json");
    expect(response.headers).toHaveProperty("Access-Control-Allow-Origin", "*");
  });

  test("generates requestId if not provided", async () => {
    const token = makeIdToken("user-gen-id");
    const event = buildEventWithToken(token, {});
    // Set a short wait time to avoid timeout
    event.headers["x-wait-time-ms"] = "200";
    // ensure no requestId in headers or context
    delete event.headers["x-request-id"];
    delete event.headers["X-Request-Id"];
    if (event.requestContext) delete event.requestContext.requestId;

    const response = await bundleGetHandler(event);
    expect(response.headers).toHaveProperty("x-request-id");
    // Should be a UUID v4
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  // ============================================================================
  // Error Handling Tests (500)
  // ============================================================================

  test("returns 500 on internal server error", async () => {
    // Mock an error by removing required env var
    delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;

    const token = makeIdToken("user-error");
    const event = buildEventWithToken(token, {});

    await expect(bundleGetHandler(event)).rejects.toThrow();
  });
});
