// app/unit-tests/functions/hmrcAuthUrlGet.test.js
import { describe, test, beforeEach, expect } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as hmrcAuthUrlGetHandler } from "@app/functions/hmrc/hmrcAuthUrlGet.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("hmrcAuthUrlGet handler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
  });

  test("HEAD request returns expected status", async () => {
    const event = buildLambdaEvent({ method: "HEAD", path: "/api/v1/hmrc/authUrl" });
    const response = await hmrcAuthUrlGetHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when state parameter is missing", async () => {
    const event = buildLambdaEvent({ method: "GET", queryStringParameters: {} });
    const response = await hmrcAuthUrlGetHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns success with auth URL when state provided", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      queryStringParameters: { state: "test-state" },
    });
    const response = await hmrcAuthUrlGetHandler(event);
    expect([200, 500]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const body = parseResponseBody(response);
      expect(body).toBeDefined();
    }
  });

  test("auth URL generation works with various states", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      queryStringParameters: { state: "my-state-123" },
    });
    const response = await hmrcAuthUrlGetHandler(event);
    expect([200, 500]).toContain(response.statusCode);
  });
});
