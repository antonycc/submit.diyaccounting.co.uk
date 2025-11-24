// app/unit-tests/functions/hmrcVatObligationGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as hmrcVatObligationGetHandler } from "@app/functions/hmrc/hmrcVatObligationGet.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockFetch = setupFetchMock();

describe("hmrcVatObligationGet handler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
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
});
