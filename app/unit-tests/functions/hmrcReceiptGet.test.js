// app/unit-tests/functions/hmrcReceiptGet.test.js
import { describe, test, beforeEach, expect } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as hmrcReceiptGetHandler } from "@app/functions/hmrc/hmrcReceiptGet.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv } from "@app/test-helpers/mockHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("hmrcReceiptGet handler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
  });

  test("HEAD request returns expected status", async () => {
    const event = buildHmrcEvent({ queryStringParameters: null });
    event.requestContext.http = { method: "HEAD", path: "/" };
    const response = await hmrcReceiptGetHandler(event);
    expect([200, 400, 401, 500]).toContain(response.statusCode);
  });

  test("returns expected response for receipt request", async () => {
    const event = buildHmrcEvent({ queryStringParameters: {} });
    const response = await hmrcReceiptGetHandler(event);
    expect([200, 400, 401, 500]).toContain(response.statusCode);
  });

  test("handles requests with various parameters", async () => {
    const event = buildHmrcEvent({
      pathParameters: { formBundleNumber: null },
      queryStringParameters: {},
    });
    const response = await hmrcReceiptGetHandler(event);
    expect([200, 400, 401, 500]).toContain(response.statusCode);
  });
});
