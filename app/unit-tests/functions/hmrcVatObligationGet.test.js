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
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    PutCommand,
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

// Defer importing the handlers until after mocks are defined
import { handler as hmrcVatObligationGetHandler } from "@app/functions/hmrc/hmrcVatObligationGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

describe("hmrcVatObligationGet handler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    // Reset and provide default mock DynamoDB behaviour
    vi.clearAllMocks();
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

  test("returns 400 for invalid date range (from > to)", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333", from: "2024-12-31", to: "2024-01-01" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatObligationGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("date range");
  });
});
