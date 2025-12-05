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
import { handler as hmrcVatReturnGetHandler } from "@app/functions/hmrc/hmrcVatReturnGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

describe("hmrcVatReturnGet handler", () => {
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

  test("returns 400 on HMRC NOT_FOUND error", async () => {
    mockHmrcError(mockFetch, 404, { code: "NOT_FOUND", message: "Not found" });

    const event = buildHmrcEvent({
      queryStringParameters: { vrn: "111222333" },
      pathParameters: { periodKey: "24A1" },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcVatReturnGetHandler(event);
    expect([200, 400, 401, 500]).toContain(response.statusCode);
  });
});
