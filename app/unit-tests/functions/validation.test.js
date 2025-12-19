// app/unit-tests/functions/validation.test.js
/**
 * Tests for enhanced input validation across VAT handlers
 */

import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock } from "@app/test-helpers/mockHelpers.js";

// Mock AWS DynamoDB
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

// Import handlers after mocks
import { handler as hmrcVatReturnPostHandler } from "@app/functions/hmrc/hmrcVatReturnPost.js";
import { handler as hmrcVatReturnGetHandler } from "@app/functions/hmrc/hmrcVatReturnGet.js";
import { handler as hmrcVatObligationGetHandler } from "@app/functions/hmrc/hmrcVatObligationGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

describe("Enhanced Validation Tests", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
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

  describe("Period Key Validation", () => {
    test("hmrcVatReturnPost accepts valid period key format 24A1", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ formBundleNumber: "123" }),
        headers: new Map(),
      });

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
    });

    test("hmrcVatReturnPost accepts valid period key format #001", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ formBundleNumber: "123" }),
        headers: new Map(),
      });

      const event = buildHmrcEvent({
        body: {
          vatNumber: "111222333",
          periodKey: "#001",
          vatDue: 100,
          accessToken: "test-token",
        },
      });
      const response = await hmrcVatReturnPostHandler(event);
      expect(response.statusCode).toBe(200);
    });

    test("hmrcVatReturnPost rejects invalid period key format", async () => {
      const event = buildHmrcEvent({
        body: {
          vatNumber: "111222333",
          periodKey: "INVALID",
          vatDue: 100,
          accessToken: "test-token",
        },
      });
      const response = await hmrcVatReturnPostHandler(event);
      expect(response.statusCode).toBe(400);
      const body = parseResponseBody(response);
      expect(body.message).toContain("periodKey");
    });

    test("hmrcVatReturnPost rejects period key with wrong number of digits", async () => {
      const event = buildHmrcEvent({
        body: {
          vatNumber: "111222333",
          periodKey: "2024A1",
          vatDue: 100,
          accessToken: "test-token",
        },
      });
      const response = await hmrcVatReturnPostHandler(event);
      expect(response.statusCode).toBe(400);
    });

    test("hmrcVatReturnGet accepts valid period key format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ periodKey: "24A1", vatDueSales: 100 }),
        headers: new Map(),
      });

      const event = buildHmrcEvent({
        pathParameters: { periodKey: "24A1" },
        queryStringParameters: { vrn: "111222333" },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcVatReturnGetHandler(event);
      expect(response.statusCode).toBe(200);
    });

    test("hmrcVatReturnGet rejects invalid period key format", async () => {
      const event = buildHmrcEvent({
        pathParameters: { periodKey: "BAD" },
        queryStringParameters: { vrn: "111222333" },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcVatReturnGetHandler(event);
      expect(response.statusCode).toBe(400);
    });
  });

  describe("Date Validation", () => {
    test("hmrcVatObligationGet accepts valid dates", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ obligations: [] }),
        headers: new Map(),
      });

      const event = buildHmrcEvent({
        queryStringParameters: {
          vrn: "111222333",
          from: "2024-01-01",
          to: "2024-12-31",
        },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcVatObligationGetHandler(event);
      expect(response.statusCode).toBe(200);
    });

    test("hmrcVatObligationGet rejects invalid from date (Feb 30)", async () => {
      const event = buildHmrcEvent({
        queryStringParameters: {
          vrn: "111222333",
          from: "2024-02-30",
          to: "2024-12-31",
        },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcVatObligationGetHandler(event);
      expect(response.statusCode).toBe(400);
      const body = parseResponseBody(response);
      expect(body.message).toContain("from date");
      expect(body.message).toContain("does not exist");
    });

    test("hmrcVatObligationGet rejects invalid to date (13th month)", async () => {
      const event = buildHmrcEvent({
        queryStringParameters: {
          vrn: "111222333",
          from: "2024-01-01",
          to: "2024-13-01",
        },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcVatObligationGetHandler(event);
      expect(response.statusCode).toBe(400);
      const body = parseResponseBody(response);
      expect(body.message).toContain("to date");
    });

    test("hmrcVatObligationGet rejects from date after to date", async () => {
      const event = buildHmrcEvent({
        queryStringParameters: {
          vrn: "111222333",
          from: "2024-12-31",
          to: "2024-01-01",
        },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcVatObligationGetHandler(event);
      expect(response.statusCode).toBe(400);
      const body = parseResponseBody(response);
      expect(body.message).toContain("date range");
      expect(body.message).toContain("cannot be after");
    });
  });

  describe("VRN Validation", () => {
    test("accepts valid 9-digit VRN", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ obligations: [] }),
        headers: new Map(),
      });

      const event = buildHmrcEvent({
        queryStringParameters: { vrn: "123456789" },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcVatObligationGetHandler(event);
      expect(response.statusCode).toBe(200);
    });

    test("rejects VRN with letters", async () => {
      const event = buildHmrcEvent({
        queryStringParameters: { vrn: "12345678A" },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcVatObligationGetHandler(event);
      expect(response.statusCode).toBe(400);
      const body = parseResponseBody(response);
      expect(body.message).toContain("9 digits");
    });

    test("rejects VRN with wrong length", async () => {
      const event = buildHmrcEvent({
        queryStringParameters: { vrn: "12345" },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcVatObligationGetHandler(event);
      expect(response.statusCode).toBe(400);
    });
  });
});
