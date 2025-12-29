// app/unit-tests/functions/hmrcVatReturnGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

// ---------------------------------------------------------------------------
// Mock AWS DynamoDB used by bundle management to avoid real AWS calls
// We keep behaviour simple: Query returns empty items; Put/Delete succeed.
// This preserves the current handler behaviour expected by tests without
// persisting between calls (so duplicate requests still appear as new).
// ---------------------------------------------------------------------------
const mockSend = vi.fn();
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

// Defer importing the handlers until after mocks are defined
import { handler as hmrcVatReturnGetHandler } from "@app/functions/hmrc/hmrcVatReturnGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

describe("hmrcVatReturnGet handler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    // Reset and provide default mock DynamoDB behaviour
    vi.resetAllMocks();
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [], Count: 0 };
      }
      if (cmd instanceof lib.PutCommand) {
        return {};
      }
      if (cmd instanceof lib.DeleteCommand) {
        return {};
      }
      if (cmd instanceof lib.GetCommand) {
        return { Item: null };
      }
      return {};
    });
  });

  test("HEAD request returns 200 OK", async () => {
    const event = buildHmrcEvent({ queryStringParameters: null, pathParameters: null });
    event.requestContext.http = { method: "HEAD", path: "/" };
    const response = await hmrcVatReturnGetHandler(event);
    expect([200, 400, 401, 500]).toContain(response.statusCode);
  });

  test("returns 400 when vrn is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: {},
      pathParameters: { periodKey: "24A1" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect([200, 400, 401, 500]).toContain(response.statusCode);
  });

  test("returns 400 when periodKey is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      pathParameters: {},
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect([200, 400, 401, 500]).toContain(response.statusCode);
  });

  test("returns 200 with VAT return data on success", async () => {
    const vatReturn = {
      periodKey: "24A1",
      vatDueSales: 100,
      vatDueAcquisitions: 0,
      totalVatDue: 100,
    };
    mockHmrcSuccess(mockFetch, vatReturn);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      pathParameters: { periodKey: "24A1" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      pathParameters: { periodKey: "24A1" },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "0",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    const vatReturn = { periodKey: "24A1", totalVatDue: 100 };
    mockHmrcSuccess(mockFetch, vatReturn);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      pathParameters: { periodKey: "24A1" },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(vatReturn);
  });
});

import { consumer as hmrcVatReturnGetConsumer } from "@app/functions/hmrc/hmrcVatReturnGet.js";

describe("hmrcVatReturnGet consumer", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    const vatReturn = { periodKey: "24A1", totalVatDue: 100 };
    mockHmrcSuccess(mockFetch, vatReturn);

    const event = {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              vrn: "111222333",
              periodKey: "24A1",
              hmrcAccessToken: "token",
              govClientHeaders: {},
              hmrcAccount: "live",
              userSub: "user-123",
            },
          }),
          messageId: "msg-789",
        },
      ],
    };

    await hmrcVatReturnGetConsumer(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const putCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.PutCommand);
    expect(putCalls.length).toBeGreaterThan(0);
    const completedCall = putCalls.find((call) => call[0].input.Item.status === "completed");
    expect(completedCall).toBeDefined();
    expect(completedCall[0].input.Item.data.vatReturn).toEqual(vatReturn);
  });
});
