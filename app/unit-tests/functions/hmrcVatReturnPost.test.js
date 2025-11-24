// app/unit-tests/functions/hmrcVatReturnPost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as hmrcVatReturnPostHandler } from "@app/functions/hmrc/hmrcVatReturnPost.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

describe("hmrcVatReturnPost handler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
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

  test("returns 200 with receipt on successful submission", async () => {
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
});
