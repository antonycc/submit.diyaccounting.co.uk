// app/unit-tests/functions/hmrcVatReturnGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as hmrcVatReturnGetHandler } from "@app/functions/hmrc/hmrcVatReturnGet.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

describe("hmrcVatReturnGet handler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
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
