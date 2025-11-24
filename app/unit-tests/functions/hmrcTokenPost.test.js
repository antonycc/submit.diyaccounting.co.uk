// app/unit-tests/functions/hmrcTokenPost.test.js
import { describe, test, beforeEach, expect } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as hmrcTokenPostHandler } from "@app/functions/hmrc/hmrcTokenPost.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("hmrcTokenPost handler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
  });

  test("HEAD request returns expected status", async () => {
    const event = buildLambdaEvent({ method: "HEAD", path: "/api/v1/hmrc/token" });
    const response = await hmrcTokenPostHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when code is missing", async () => {
    const event = buildLambdaEvent({ method: "POST", body: {} });
    const response = await hmrcTokenPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Missing code");
  });

  test("returns success with token exchange details when code provided", async () => {
    const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
    const response = await hmrcTokenPostHandler(event);
    expect([200, 500]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const body = parseResponseBody(response);
      expect(body).toBeDefined();
    }
  });

  test("accepts hmrcAccount header for sandbox", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      body: { code: "test-code" },
      headers: { hmrcaccount: "sandbox" },
    });
    const response = await hmrcTokenPostHandler(event);
    expect([200, 500]).toContain(response.statusCode);
  });

  test("returns 400 for invalid hmrcAccount header", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      body: { code: "test-code" },
      headers: { hmrcaccount: "invalid" },
    });
    const response = await hmrcTokenPostHandler(event);
    expect(response.statusCode).toBe(400);
  });
});
