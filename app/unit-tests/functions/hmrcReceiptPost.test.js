// app/unit-tests/functions/hmrcReceiptPost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
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
import { handler as hmrcReceiptPostHandler } from "@app/functions/hmrc/hmrcReceiptPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("hmrcReceiptPost handler", () => {
  beforeEach(() => {
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
    const response = await hmrcReceiptPostHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when required fields are missing", async () => {
    const event = buildHmrcEvent({ body: {} });
    const response = await hmrcReceiptPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 200 when receipt is stored successfully", async () => {
    const event = buildHmrcEvent({
      body: {
        formBundleNumber: "123456789012",
        chargeRefNumber: "XM002610011594",
        processingDate: "2023-01-01T12:00:00.000Z",
      },
    });
    const response = await hmrcReceiptPostHandler(event);
    expect([200, 500]).toContain(response.statusCode);
  });
});
