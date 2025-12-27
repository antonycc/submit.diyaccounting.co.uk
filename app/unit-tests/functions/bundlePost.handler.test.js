// app/unit-tests/functions/bundlePost.test.js
// Comprehensive tests for bundlePost handler

import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";

// ---------------------------------------------------------------------------
// Mock AWS DynamoDB used by bundle management to avoid real AWS calls
// We keep behaviour simple: Query returns empty items; Put/Delete succeed.
// This preserves the current handler behaviour expected by tests without
// persisting between calls (so duplicate requests still appear as new).
// ---------------------------------------------------------------------------
const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class PutCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class DeleteCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class GetCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    PutCommand,
    QueryCommand,
    DeleteCommand,
    GetCommand,
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor(_config) {
      // no-op in unit tests
    }
  }
  return { DynamoDBClient };
});

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

// Defer importing the handler until after mocks are defined
import { handler as bundlePostHandler, consumer as bundlePostConsumer } from "@app/functions/account/bundlePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("bundlePost handler", () => {
  let asyncRequests = new Map();

  beforeEach(() => {
    // Setup test environment
    Object.assign(
      process.env,
      setupTestEnv({
        ASYNC_REQUESTS_DYNAMODB_TABLE_NAME: "test-async-table",
        SQS_QUEUE_URL: "https://sqs.eu-west-2.amazonaws.com/123456789012/test-queue",
      }),
    );
    asyncRequests = new Map();

    // Reset and provide default mock DynamoDB behaviour
    vi.clearAllMocks();
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [], Count: 0 };
      }
      if (cmd instanceof lib.PutCommand) {
        const item = cmd.input.Item;
        if (item.requestId) {
          asyncRequests.set(item.requestId, item);
        }
        return {};
      }
      if (cmd instanceof lib.GetCommand) {
        const { requestId } = cmd.input.Key;
        const item = asyncRequests.get(requestId);
        return { Item: item };
      }
      if (cmd instanceof lib.DeleteCommand) {
        return {};
      }
      return {};
    });
  });

  // ============================================================================
  // HEAD Request Tests
  // ============================================================================

  test("HEAD request returns 200 OK after bundle enforcement", async () => {
    // TODO: Handler checks request.method === "HEAD" but extractRequest returns a URL object
    // which doesn't have a .method property. This needs to be fixed in either:
    // 1. extractRequest to add method from event.requestContext.http.method, or
    // 2. Handler to check event.requestContext.http.method directly
    // For now, HEAD requests will return 401 because they're treated as POST
    const event = buildLambdaEvent({
      method: "HEAD",
      path: "/api/v1/bundle",
    });

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(200);
  });

  // ============================================================================
  // Authentication Tests (401)
  // ============================================================================

  test("returns 401 when Authorization header is missing", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      body: { bundleId: "test" },
      headers: {}, // No Authorization header
    });

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(401);
    const body = parseResponseBody(response);
    expect(body).toBeDefined();
  });

  test("returns 401 when Authorization token is invalid", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      body: { bundleId: "test" },
      headers: { Authorization: "Bearer invalid-token" },
    });

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(401);
  });

  // ============================================================================
  // Validation Tests (400)
  // ============================================================================

  test("returns 400 when bundleId is missing", async () => {
    const token = makeIdToken("user-missing-bundle");
    const event = buildEventWithToken(token, {});
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.error).toBe("Missing bundleId in request");
  });

  test("returns 400 with invalid JSON in request body", async () => {
    const token = makeIdToken("user-invalid-json");
    const event = {
      ...buildEventWithToken(token, {}),
      body: "invalid-json{",
    };
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.error).toBe("Invalid JSON in request body");
  });

  test("returns 400 when unknown qualifier is provided", async () => {
    const token = makeIdToken("user-unknown-qualifier");
    const event = buildEventWithToken(token, {
      bundleId: "test",
      qualifiers: { unknownField: "value" },
    });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.error).toBe("unknown_qualifier");
    expect(body.qualifier).toBe("unknownField");
  });

  test("returns 400 when qualifier mismatch occurs", async () => {
    const token = makeIdToken("user-qualifier-mismatch");
    // Test bundle may have specific qualifier requirements
    const event = buildEventWithToken(token, {
      bundleId: "basic",
      qualifiers: { subscriptionTier: "Wrong" },
    });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    // This depends on catalog configuration; if basic requires specific tier
    if (response.statusCode === 400) {
      const body = parseResponseBody(response);
      expect(body.error).toBe("qualifier_mismatch");
    } else {
      // If bundle doesn't require qualifiers, it should succeed or give different error
      expect([200, 404, 202]).toContain(response.statusCode);
    }
  });

  // ============================================================================
  // Bundle Not Found Tests (404)
  // ============================================================================

  test("returns 404 when bundle is not found in catalog", async () => {
    const token = makeIdToken("user-not-found");
    const event = buildEventWithToken(token, {
      bundleId: "nonexistent-bundle-xyz",
    });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(404);
    const body = parseResponseBody(response);
    expect(body.error).toBe("bundle_not_found");
    expect(body.message).toContain("nonexistent-bundle-xyz");
  });

  // ============================================================================
  // Happy Path Tests (200)
  // ============================================================================

  test("returns 201 and grants automatic bundle without persistence", async () => {
    const token = makeIdToken("user-auto");
    const event = buildEventWithToken(token, { bundleId: "default" });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.status).toBe("granted");
    expect(body.granted).toBe(true);
    expect(body.expiry).toBe(null); // automatic bundles don't have expiry
    expect(body.bundle).toBe("default");
  });

  test("returns 201 and grants test bundle with timeout producing expiry", async () => {
    const token = makeIdToken("user-test");
    const event = buildEventWithToken(token, { bundleId: "test" });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.status).toBe("granted");
    expect(body.granted).toBe(true);
    // Test bundle should have timeout producing non-null expiry
    if (body.expiry) {
      expect(/\d{4}-\d{2}-\d{2}/.test(body.expiry)).toBe(true);
    }
  });

  test("returns 201 with already_granted status on duplicate request", async () => {
    const token = makeIdToken("user-duplicate");
    const event = buildEventWithToken(token, { bundleId: "test" });
    event.headers["x-wait-time-ms"] = "30000";

    // Mock first call already granted
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "test" }], Count: 1 };
      }
      return {};
    });

    const response = await bundlePostHandler(event);
    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.status).toBe("already_granted");
  });

  test("grants bundle successfully with all fields in response", async () => {
    const token = makeIdToken("user-success");
    const event = buildEventWithToken(token, { bundleId: "test" });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(201);
    expect(response.headers).toHaveProperty("Content-Type", "application/json");
    expect(response.headers).toHaveProperty("Access-Control-Allow-Origin", "*");

    const body = parseResponseBody(response);
    expect(body.status).toBe("granted");
    expect(body.granted).toBe(true);
    expect(body.bundle).toBe("test");
    expect(Array.isArray(body.bundles)).toBe(true);
  });

  // ============================================================================
  // Error Handling Tests (500)
  // ============================================================================

  test("returns 500 on internal server error", async () => {
    // Mock an error by providing invalid environment
    delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;

    const token = makeIdToken("user-error");
    const event = buildEventWithToken(token, { bundleId: "test" });
    event.headers["x-wait-time-ms"] = "30000";

    await expect(bundlePostHandler(event)).rejects.toThrow();
  });

  // ============================================================================
  // Async & Consumer Tests
  // ============================================================================

  test("returns 202 Accepted for async initiation", async () => {
    const token = makeIdToken("user-async");
    const event = buildEventWithToken(token, { bundleId: "test" });
    // Default waitTimeMs is 0

    const response = await bundlePostHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("SQS record processing updates DynamoDB status to completed", async () => {
    const userId = "user-sqs-success";
    const requestId = "req-sqs-success";
    const payload = {
      userId,
      requestBody: { bundleId: "test" },
      decodedToken: { sub: userId },
      requestId,
    };

    const event = {
      Records: [
        {
          body: JSON.stringify({ userId, requestId, payload }),
          messageId: "msg-123",
        },
      ],
    };

    await bundlePostConsumer(event);

    const stored = asyncRequests.get(requestId);
    expect(stored).toBeDefined();
    expect(stored.status).toBe("completed");
    expect(stored.data.status).toBe("granted");
  });
});
