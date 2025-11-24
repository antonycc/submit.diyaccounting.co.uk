// app/unit-tests/hmrcAuthUrlGet.handler.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as getAuthUrlHandler } from "@app/functions/hmrc/hmrcAuthUrlGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("hmrcAuthUrlGet handler (new tests)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      HMRC_CLIENT_ID: "test-client-id",
      DIY_SUBMIT_BASE_URL: "https://submit.diyaccounting.co.uk",
    };
  });

  test("generates HMRC authorization URL successfully", async () => {
    const event = {
      queryStringParameters: { state: "test-state-123", scope: "write:vat read:vat" },
    };

    const result = await getAuthUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.authUrl).toContain("https://test-api.service.hmrc.gov.uk/oauth/authorize");
    expect(body.authUrl).toContain("state=test-state-123");
    expect(body.authUrl).toContain("scope=write%3Avat%20read%3Avat");
    expect(body.authUrl).toContain("client_id=test-client-id");
  });

  test("uses default scope when not provided", async () => {
    const event = {
      queryStringParameters: { state: "test-state-456" },
    };

    const result = await getAuthUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.authUrl).toContain("scope=write%3Avat%20read%3Avat");
  });

  test("returns 400 when state parameter is missing", async () => {
    const event = {
      queryStringParameters: {},
    };

    const result = await getAuthUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(String(body.message)).toContain("Missing state query parameter");
  });

  test("returns 400 when scope is invalid", async () => {
    const event = {
      queryStringParameters: { state: "test-state", scope: "invalid-scope" },
    };

    const result = await getAuthUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(String(body.message)).toContain("Invalid scope parameter");
  });
});
