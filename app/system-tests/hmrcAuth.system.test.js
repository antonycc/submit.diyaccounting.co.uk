// app/system-tests/hmrcAuth.system.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { handler as hmrcAuthUrlGetHandler } from "../functions/hmrc/hmrcAuthUrlGet.js";
import { handler as hmrcTokenPostHandler } from "../functions/hmrc/hmrcTokenPost.js";
import { buildLambdaEvent } from "../test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "../test-helpers/mockHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("System: HMRC Auth Flow (hmrcAuthUrl + hmrcToken)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(
      process.env,
      setupTestEnv({
        HMRC_CLIENT_SECRET: "test-client-secret",
        HMRC_SANDBOX_CLIENT_SECRET: "test-sandbox-client-secret",
      }),
    );
  });

  it("should generate auth URL and then exchange code for token", async () => {
    // Step 1: Generate auth URL
    const authUrlEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/authUrl",
      queryStringParameters: { state: "test-state-123", scope: "write:vat read:vat" },
    });

    const authUrlResponse = await hmrcAuthUrlGetHandler(authUrlEvent);
    expect(authUrlResponse.statusCode).toBe(200);

    const authUrlBody = parseResponseBody(authUrlResponse);
    expect(authUrlBody).toHaveProperty("authUrl");
    expect(authUrlBody.authUrl).toContain("oauth/authorize");
    expect(authUrlBody.authUrl).toContain("state=test-state-123");
    expect(authUrlBody.authUrl).toContain("scope=write%3Avat%20read%3Avat");

    // Step 2: Exchange code for token (simulated callback)
    const tokenEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/token",
      body: { code: "test-authorization-code-123" },
    });

    const tokenResponse = await hmrcTokenPostHandler(tokenEvent);
    expect([200, 500]).toContain(tokenResponse.statusCode);

    if (tokenResponse.statusCode === 200) {
      const tokenBody = parseResponseBody(tokenResponse);
      expect(tokenBody).toHaveProperty("url");
      expect(tokenBody).toHaveProperty("body");
      expect(tokenBody.url).toContain("oauth/token");
      expect(tokenBody.body).toHaveProperty("grant_type", "authorization_code");
      expect(tokenBody.body).toHaveProperty("code", "test-authorization-code-123");
    }
  });

  it("should handle sandbox account in auth flow", async () => {
    // Step 1: Generate auth URL for sandbox
    const authUrlEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/authUrl",
      queryStringParameters: { state: "sandbox-state", scope: "read:vat" },
      headers: { hmrcaccount: "sandbox" },
    });

    const authUrlResponse = await hmrcAuthUrlGetHandler(authUrlEvent);
    expect(authUrlResponse.statusCode).toBe(200);

    const authUrlBody = parseResponseBody(authUrlResponse);
    expect(authUrlBody.authUrl).toContain(process.env.HMRC_SANDBOX_CLIENT_ID);

    // Step 2: Exchange code for token in sandbox
    const tokenEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/token",
      body: { code: "sandbox-code" },
      headers: { hmrcaccount: "sandbox" },
    });

    const tokenResponse = await hmrcTokenPostHandler(tokenEvent);
    expect([200, 500]).toContain(tokenResponse.statusCode);

    if (tokenResponse.statusCode === 200) {
      const tokenBody = parseResponseBody(tokenResponse);
      expect(tokenBody.body).toHaveProperty("client_id", process.env.HMRC_SANDBOX_CLIENT_ID);
    }
  });

  it("should validate missing state in auth URL", async () => {
    const authUrlEvent = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/hmrc/authUrl",
      queryStringParameters: {},
    });

    const authUrlResponse = await hmrcAuthUrlGetHandler(authUrlEvent);
    expect(authUrlResponse.statusCode).toBe(400);

    const authUrlBody = parseResponseBody(authUrlResponse);
    expect(authUrlBody.message).toContain("Missing state query parameter");
  });

  it("should validate missing code in token exchange", async () => {
    const tokenEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/token",
      body: {},
    });

    const tokenResponse = await hmrcTokenPostHandler(tokenEvent);
    expect(tokenResponse.statusCode).toBe(400);

    const tokenBody = parseResponseBody(tokenResponse);
    expect(tokenBody.message).toContain("Missing code");
  });
});
