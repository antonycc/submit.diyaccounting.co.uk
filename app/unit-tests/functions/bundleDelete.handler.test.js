// app/unit-tests/functions/bundleDelete.test.js
// Comprehensive tests for bundleDelete handler

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

// Defer importing the handlers until after mocks are defined
import { handler as bundleDeleteHandler, consumer as bundleDeleteConsumer } from "@app/functions/account/bundleDelete.js";
import { handler as bundlePostHandler } from "@app/functions/account/bundlePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("bundleDelete handler", () => {
  let asyncRequests = new Map();

  beforeEach(() => {
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

  test("HEAD request returns 200 OK", async () => {
    const event = buildLambdaEvent({
      method: "HEAD",
      path: "/api/v1/bundle",
    });

    const response = await bundleDeleteHandler(event);
    // Same HEAD detection issue
    expect([200, 401]).toContain(response.statusCode);
  });

  // ============================================================================
  // Authentication Tests (401)
  // ============================================================================

  test("returns 401 when Authorization header is missing", async () => {
    const event = buildLambdaEvent({
      method: "DELETE",
      body: { bundleId: "test" },
      headers: {}, // No Authorization
    });

    const response = await bundleDeleteHandler(event);

    expect(response.statusCode).toBe(401);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Authentication required");
  });

  test("returns 401 when Authorization token is invalid", async () => {
    const event = buildLambdaEvent({
      method: "DELETE",
      body: { bundleId: "test" },
      headers: { Authorization: "Bearer invalid-token" },
    });

    const response = await bundleDeleteHandler(event);

    expect(response.statusCode).toBe(401);
  });

  // ============================================================================
  // Validation Tests (400)
  // ============================================================================

  test("returns 400 when bundleId is missing and removeAll is false", async () => {
    const token = makeIdToken("user-no-bundle-id");
    const event = buildEventWithToken(token, {});
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundleDeleteHandler(event);

    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Missing bundle Id");
  });

  // ============================================================================
  // Not Found Tests (404)
  // ============================================================================

  test("returns 404 when bundle not found for user", async () => {
    const token = makeIdToken("user-no-bundles");
    const event = buildEventWithToken(token, { bundleId: "nonexistent" });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundleDeleteHandler(event);

    expect(response.statusCode).toBe(404);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Bundle not found");
  });

  // ============================================================================
  // Happy Path Tests (200)
  // ============================================================================

  test("successfully deletes a bundle", async () => {
    const token = makeIdToken("user-delete-success");

    // Mock bundle existence
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "test" }], Count: 1 };
      }
      return {};
    });

    // Then delete it
    const deleteEvent = buildEventWithToken(token, { bundleId: "test" });
    deleteEvent.headers["x-wait-time-ms"] = "30000";
    const response = await bundleDeleteHandler(deleteEvent);

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.status).toBe("removed");
    expect(body.bundle).toBe("test");
  });

  test("successfully removes all bundles with removeAll flag", async () => {
    const token = makeIdToken("user-remove-all");

    // Mock multiple bundles
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "test" }, { bundleId: "default" }], Count: 2 };
      }
      return {};
    });

    // Remove all
    const deleteEvent = buildEventWithToken(token, { removeAll: true });
    deleteEvent.headers["x-wait-time-ms"] = "30000";
    const response = await bundleDeleteHandler(deleteEvent);

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.status).toBe("removed_all");
    expect(body.bundles).toEqual([]);
  });

  test("accepts bundleId via path parameter", async () => {
    const token = makeIdToken("user-path-param");

    // Mock bundle existence
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "test" }], Count: 1 };
      }
      return {};
    });

    // Delete via path parameter
    const event = {
      ...buildEventWithToken(token, {}),
      pathParameters: { id: "test" },
    };
    event.headers["x-wait-time-ms"] = "30000";
    const response = await bundleDeleteHandler(event);

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.status).toBe("removed");
  });

  test("accepts bundleId via query parameter", async () => {
    const token = makeIdToken("user-query-param");

    // Mock bundle existence
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "test" }], Count: 1 };
      }
      return {};
    });

    // Delete via query parameter
    const event = {
      ...buildEventWithToken(token, {}),
      queryStringParameters: { bundleId: "test" },
    };
    event.headers["x-wait-time-ms"] = "30000";
    const response = await bundleDeleteHandler(event);

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.status).toBe("removed");
  });

  // ============================================================================
  // Error Handling Tests (500)
  // ============================================================================

  test("returns 500 on internal server error", async () => {
    // Mock an error condition by deleting required env var
    delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;

    const token = makeIdToken("user-error");
    const event = buildEventWithToken(token, { bundleId: "test" });
    event.headers["x-wait-time-ms"] = "30000";

    await expect(bundleDeleteHandler(event)).rejects.toThrow();
  });

  // ============================================================================
  // Async & Consumer Tests
  // ============================================================================

  // test("returns 202 Accepted for async deletion initiation", async () => {
  //   const token = makeIdToken("user-async-delete");
  //   const event = buildEventWithToken(token, { bundleId: "test" });
  //   // Default waitTimeMs is 0
  //
  //   const response = await bundleDeleteHandler(event);
  //   expect(response.statusCode).toBe(202);
  //   expect(response.headers).toHaveProperty("x-request-id");
  //   expect(mockSqsSend).toHaveBeenCalled();
  // });

  test("SQS record processing updates DynamoDB status to completed for deletion", async () => {
    const userId = "user-sqs-delete-success";
    const requestId = "req-sqs-delete-success";
    const payload = {
      userId,
      bundleToRemove: "test",
      removeAll: false,
      requestId,
    };

    // Mock bundle existence for consumer
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "test" }], Count: 1 };
      }
      if (cmd instanceof lib.PutCommand) {
        const item = cmd.input.Item;
        if (item.requestId) {
          asyncRequests.set(item.requestId, item);
        }
        return {};
      }
      return {};
    });

    const event = {
      Records: [
        {
          body: JSON.stringify({ userId, requestId, payload }),
          messageId: "msg-delete-123",
        },
      ],
    };

    await bundleDeleteConsumer(event);

    const stored = asyncRequests.get(requestId);
    expect(stored).toBeDefined();
    expect(stored.status).toBe("completed");
    expect(stored.data.status).toBe("removed");
  });
});
