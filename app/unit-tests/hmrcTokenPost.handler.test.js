// app/unit-tests/hmrcTokenPost.handler.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as postTokenHandler } from "@app/functions/hmrc/hmrcTokenPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock global fetch to avoid real network requests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("hmrcTokenPost handler (new tests)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      HMRC_CLIENT_ID: "test-client-id",
      HMRC_CLIENT_SECRET: "test-client-secret",
      DIY_SUBMIT_BASE_URL: "https://submit.diyaccounting.co.uk",
    };
  });

  test("exchanges authorization code for token successfully", async () => {
    const tokenResponse = {
      access_token: "test-access-token",
      token_type: "bearer",
      expires_in: 14400,
      refresh_token: "test-refresh-token",
      scope: "write:vat read:vat",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(tokenResponse),
    });

    const event = {
      requestContext: { requestId: "req-1" },
      body: JSON.stringify({ code: "auth-code-123" }),
    };

    const result = await postTokenHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.accessToken).toBe("test-access-token");

    // Verify fetch was called with correct URL
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/oauth/token"), expect.objectContaining({ method: "POST" }));
  });

  test("returns 400 when authorization code is missing", async () => {
    const event = {
      requestContext: { requestId: "req-2" },
      body: JSON.stringify({}),
    };

    const result = await postTokenHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(String(body.message)).toMatch(/Missing code/i);
  });
});
