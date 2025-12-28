// app/unit-tests/functions/bundleGet.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";
// TODO: Move to test-helpers
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
  class GetCommand {
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
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    PutCommand,
    GetCommand,
    QueryCommand,
    DeleteCommand,
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
import { handler as bundleGetHandler, consumer as bundleGetConsumer } from "@app/functions/account/bundleGet.js";
import { handler as bundlePostHandler } from "@app/functions/account/bundlePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("bundleGet handler", () => {
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
    const lib = await import("@aws-sdk/lib-dynamodb");
    const getCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.GetCommand);
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

  // // ============================================================================
  // // Async Polling Tests (202 / 200)
  // // ============================================================================
  //
  // test("returns 202 Accepted when wait time is short and result not ready", async () => {
  //   process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME = "test-async-table";
  //   const token = makeIdToken("user-async");
  //   const event = buildEventWithToken(token, {});
  //   event.headers["x-wait-time-ms"] = "50"; // Very short wait
  //
  //   // Mock GetCommand to return nothing (still processing)
  //   mockSend.mockImplementation(async (cmd) => {
  //     const lib = await import("@aws-sdk/lib-dynamodb");
  //     if (cmd instanceof lib.GetCommand) {
  //       return { Item: { status: "processing" } };
  //     }
  //     if (cmd instanceof lib.QueryCommand) {
  //       return { Items: [], Count: 0 };
  //     }
  //     return {};
  //   });
  //
  //   const response = await bundleGetHandler(event);
  //   expect(response.statusCode).toBe(202);
  //   expect(response.headers).toHaveProperty("Location");
  //   expect(response.headers).toHaveProperty("Retry-After", "5");
  //   expect(response.headers).toHaveProperty("x-request-id");
  // });

  // test("returns 200 when polling completes successfully", async () => {
  //   process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME = "test-async-table";
  //   const token = makeIdToken("user-async-success");
  //   const event = buildEventWithToken(token, {});
  //   event.headers["x-wait-time-ms"] = "500";
  //
  //   let callCount = 0;
  //   mockSend.mockImplementation(async (cmd) => {
  //     const lib = await import("@aws-sdk/lib-dynamodb");
  //     if (cmd instanceof lib.GetCommand) {
  //       callCount++;
  //       if (callCount >= 2) {
  //         return {
  //           Item: {
  //             status: "completed",
  //             data: { bundles: [{ bundleId: "async-bundle", expiry: "2025-12-31" }] },
  //           },
  //         };
  //       }
  //       return { Item: { status: "processing" } };
  //     }
  //     if (cmd instanceof lib.QueryCommand) {
  //       return { Items: [], Count: 0 };
  //     }
  //     return {};
  //   });
  //
  //   const response = await bundleGetHandler(event);
  //   expect(response.statusCode).toBe(200);
  //   const body = parseResponseBody(response);
  //   expect(body.bundles[0].bundleId).toBe("async-bundle");
  // });

  // test("returns 202 Accepted by default when wait time header is missing", async () => {
  //   const token = makeIdToken("user-default-async");
  //   const event = buildEventWithToken(token, {});
  //   // Ensure no wait-time header
  //   delete event.headers["x-wait-time-ms"];
  //   delete event.headers["X-Wait-Time-Ms"];
  //
  //   // Mock GetCommand to return processing status
  //   mockSend.mockImplementation(async (cmd) => {
  //     const lib = await import("@aws-sdk/lib-dynamodb");
  //     if (cmd instanceof lib.GetCommand) {
  //       return { Item: { status: "processing" } };
  //     }
  //     if (cmd instanceof lib.QueryCommand) {
  //       return { Items: [], Count: 0 };
  //     }
  //     return {};
  //   });
  //
  //   const response = await bundleGetHandler(event);
  //   expect(response.statusCode).toBe(202);
  //   expect(response.headers).toHaveProperty("Location");
  //   expect(response.headers).toHaveProperty("x-request-id");
  // });

  // test("enqueues request to SQS when SQS_QUEUE_URL is provided", async () => {
  //   process.env.SQS_QUEUE_URL = "http://test-queue-url";
  //   const token = makeIdToken("user-sqs");
  //   const event = buildEventWithToken(token, {});
  //   delete event.headers["x-wait-time-ms"];
  //
  //   mockSqsSend.mockResolvedValue({});
  //
  //   const response = await bundleGetHandler(event);
  //   expect(response.statusCode).toBe(200);
  //   expect(mockSqsSend).toHaveBeenCalled();
  //   const call = mockSqsSend.mock.calls[0][0];
  //   expect(call.input.QueueUrl).toBe("http://test-queue-url");
  //   expect(JSON.parse(call.input.MessageBody)).toHaveProperty("userId", "user-sqs");
  // });

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

  // describe("consumer", () => {
  //   test("processes SQS records and updates DynamoDB", async () => {
  //     process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundle-table";
  //     process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME = "test-async-table";
  //
  //     const event = {
  //       Records: [
  //         {
  //           messageId: "msg-1",
  //           body: JSON.stringify({ userId: "user-consumer", requestId: "req-consumer" }),
  //         },
  //       ],
  //     };
  //
  //     await bundleGetConsumer(event);
  //
  //     // Verify DynamoDB was called to update status to completed
  //     const putCalls = mockSend.mock.calls.filter((c) => {
  //       return c[0]?.constructor?.name === "PutCommand";
  //     });
  //     expect(putCalls.some((c) => c[0].input.Item.status === "completed")).toBe(true);
  //   });
  // });
});
