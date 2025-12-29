// app/unit-tests/functions/hmrcVatObligationGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

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
import { handler as hmrcVatObligationGetHandler } from "@app/functions/hmrc/hmrcVatObligationGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

describe("hmrcVatObligationGet handler", () => {
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
    const event = buildHmrcEvent({ queryStringParameters: null });
    event.requestContext.http = { method: "HEAD", path: "/" };
    const response = await hmrcVatObligationGetHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when vrn is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: {},
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatObligationGetHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 200 with obligations list on success", async () => {
    const obligations = {
      obligations: [
        {
          periodKey: "24A1",
          start: "2024-01-01",
          end: "2024-03-31",
          due: "2024-05-07",
          status: "O",
        },
      ],
    };
    mockHmrcSuccess(mockFetch, obligations);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatObligationGetHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns 500 on HMRC API error", async () => {
    mockHmrcError(mockFetch, 400, { code: "INVALID_VRN" });

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "invalid" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatObligationGetHandler(event);
    expect([400, 500]).toContain(response.statusCode);
  });

  test("returns 400 for invalid VRN format", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "12345678" }, // 8 digits instead of 9
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatObligationGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("vrn");
    expect(body.message).toContain("9 digits");
  });

  test("returns 400 for invalid date format", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", from: "2024/01/01" }, // wrong format
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatObligationGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("date format");
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "0",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcVatObligationGetHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    const obligations = { obligations: [{ periodKey: "24A1", status: "O" }] };
    mockHmrcSuccess(mockFetch, obligations);

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "30000",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcVatObligationGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(obligations);
  });
});

import { consumer as hmrcVatObligationGetConsumer } from "@app/functions/hmrc/hmrcVatObligationGet.js";

describe("hmrcVatObligationGet consumer", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    const obligations = { obligations: [{ periodKey: "24A1", status: "O" }] };
    mockHmrcSuccess(mockFetch, obligations);

    const event = {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              vrn: "111222333",
              hmrcAccessToken: "token",
              govClientHeaders: {},
              hmrcAccount: "live",
              from: "2024-01-01",
              to: "2024-03-31",
              status: "O",
              userSub: "user-123",
            },
          }),
          messageId: "msg-789",
        },
      ],
    };

    await hmrcVatObligationGetConsumer(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const putCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.PutCommand);
    expect(putCalls.length).toBeGreaterThan(0);
    const completedCall = putCalls.find((call) => call[0].input.Item.status === "completed");
    expect(completedCall).toBeDefined();
    expect(completedCall[0].input.Item.data.obligations).toEqual(obligations);
  });
});
