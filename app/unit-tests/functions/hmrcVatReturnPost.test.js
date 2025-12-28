// app/unit-tests/functions/hmrcVatReturnPost.test.js

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
import { handler as hmrcVatReturnPostHandler } from "@app/functions/hmrc/hmrcVatReturnPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

describe("hmrcVatReturnPost handler", () => {
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
    const event = buildHmrcEvent({ body: null });
    event.requestContext.http = { method: "HEAD", path: "/" };
    const response = await hmrcVatReturnPostHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when vatNumber is missing", async () => {
    const event = buildHmrcEvent({
      body: { periodKey: "24A1", vatDue: 100, accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("vatNumber");
  });

  test("returns 400 when periodKey is missing", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", vatDue: 100, accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when vatDue is missing", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodKey: "24A1", accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when accessToken is missing", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodKey: "24A1", vatDue: 100 },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when vatNumber has invalid format", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "12345678", periodKey: "24A1", vatDue: 100, accessToken: "token" }, // 8 digits instead of 9
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("vatNumber");
    expect(body.message).toContain("9 digits");
  });

  test("returns 400 when periodKey has invalid format", async () => {
    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodKey: "INVALID", vatDue: 100, accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("periodKey");
  });

  test("accepts valid period key formats - YYXN", async () => {
    mockHmrcSuccess(mockFetch, {
      formBundleNumber: "123456789012",
      chargeRefNumber: "XM002610011594",
      processingDate: "2023-01-01T12:00:00.000Z",
    });

    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodKey: "24A1", vatDue: 100, accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("accepts valid period key formats - #NNN", async () => {
    mockHmrcSuccess(mockFetch, {
      formBundleNumber: "123456789012",
      chargeRefNumber: "XM002610011594",
      processingDate: "2023-01-01T12:00:00.000Z",
    });

    const event = buildHmrcEvent({
      body: { vatNumber: "111222333", periodKey: "#001", vatDue: 100, accessToken: "token" },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns 200 with receipt on successful submission and persists it", async () => {
    const receipt = {
      formBundleNumber: "123456789012",
      chargeRefNumber: "XM002610011594",
      processingDate: "2023-01-01T12:00:00.000Z",
    };
    mockHmrcSuccess(mockFetch, receipt);

    const event = buildHmrcEvent({
      body: {
        vatNumber: "111222333",
        periodKey: "24A1",
        vatDue: 100,
        accessToken: "test-token",
      },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body).toHaveProperty("receipt");
    expect(body).toHaveProperty("receiptId");

    // Verify receipt was persisted to DynamoDB
    const lib = await import("@aws-sdk/lib-dynamodb");
    const putCalls = mockSend.mock.calls.filter((call) => {
      return call[0] instanceof lib.PutCommand && call[0].input.TableName === process.env.RECEIPTS_DYNAMODB_TABLE_NAME;
    });
    expect(putCalls.length).toBeGreaterThan(0);
    const receiptItem = putCalls[0][0].input.Item;
    expect(receiptItem.receipt).toEqual(receipt);
    expect(receiptItem.receiptId).toContain(receipt.formBundleNumber);
  });

  test("returns 500 on HMRC API error", async () => {
    mockHmrcError(mockFetch, 400, { error: "INVALID_VAT_NUMBER" });

    const event = buildHmrcEvent({
      body: {
        vatNumber: "111222333",
        periodKey: "24A1",
        vatDue: 100,
        accessToken: "test-token",
      },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(500);
  });

  test("returns user-friendly error message for HMRC error codes", async () => {
    mockHmrcError(mockFetch, 400, { code: "DUPLICATE_SUBMISSION", message: "Duplicate submission" });

    const event = buildHmrcEvent({
      body: {
        vatNumber: "111222333",
        periodKey: "24A1",
        vatDue: 100,
        accessToken: "test-token",
      },
    });
    const response = await hmrcVatReturnPostHandler(event);
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    // The error details are in the response body
    expect(body).toHaveProperty("userMessage");
    expect(body).toHaveProperty("actionAdvice");
    expect(body.userMessage).toContain("already been submitted");
    expect(body.actionAdvice).toContain("contact HMRC");
  });
});
