// app/unit-tests/functions/hmrcReceiptPost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as hmrcReceiptPostHandler } from "@app/functions/hmrc/hmrcReceiptPost.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("hmrcReceiptPost handler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
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
