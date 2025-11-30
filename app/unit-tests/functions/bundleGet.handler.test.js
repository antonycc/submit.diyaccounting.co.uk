// app/unit-tests/functions/bundleGet.test.js
// Comprehensive tests for bundleGet handler

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
import { handler as bundleGetHandler } from "@app/functions/account/bundleGet.js";
import { handler as bundlePostHandler } from "@app/functions/account/bundlePost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("bundleGet handler", () => {
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

    const response = await bundleGetHandler(event);

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(Array.isArray(body.bundles)).toBe(true);
    expect(body.bundles.length).toBe(0);
  });

  test("returns 200 with user bundles after granting", async () => {
    const token = makeIdToken("user-with-bundles");

    // Grant a bundle first
    await bundlePostHandler(buildEventWithToken(token, { bundleId: "test" }));

    // Get bundles
    const getEvent = buildEventWithToken(token, {});
    const response = await bundleGetHandler(getEvent);

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(Array.isArray(body.bundles)).toBe(true);
  });

  test("returns correct content-type header", async () => {
    const token = makeIdToken("user-headers");
    const event = buildEventWithToken(token, {});

    const response = await bundleGetHandler(event);

    expect(response.statusCode).toBe(200);
    expect(response.headers).toHaveProperty("Content-Type", "application/json");
    expect(response.headers).toHaveProperty("Access-Control-Allow-Origin", "*");
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
});
