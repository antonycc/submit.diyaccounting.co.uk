// app/unit-tests/submitVatHandlerUnauthorized.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as submitVatHandler } from "@app/functions/hmrc/hmrcVatReturnPost.js";
import { buildGovClientTestHeaders } from "@app/unit-tests/app-lib/govClientTestHeader.js";

// Ensure env test file is loaded if present
dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock global fetch to avoid real HTTP calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("submitVatHandler Unauthorized token handling", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      HMRC_BASE_URI: "https://test",
      TEST_FORCE_UNAUTHORIZED_TOKEN: "true",
    };
  });

  test("returns 401 when validateHmrcAccessToken throws UnauthorizedTokenError", async () => {
    // Prepare stubbed HMRC response (should not be called in this path)
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const headers = buildGovClientTestHeaders();
    const event = {
      requestContext: {
        requestId: "test-request-id",
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                "sub": "test-sub",
                "cognito:username": "test",
                "email": "test@test.submit.diyaccunting.co.uk",
                "scope": "read write",
              },
            },
          },
        },
      },
      body: JSON.stringify({
        vatNumber: "111222333",
        periodKey: "23A1",
        vatDue: "1000.50",
        accessToken: "some-token",
      }),
      headers: {
        ...headers,
      },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(401);
    expect(body.message).toMatch(/Unauthorized/i);
    // Ensure HMRC API was not called since token was rejected pre-call
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
