// app/unit-tests/hmrcVatReturnPost.handler.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

import { handler as submitVatHandler } from "@app/functions/hmrc/hmrcVatReturnPost.js";
import { buildGovClientTestHeaders } from "@app/unit-tests/app-lib/govClientTestHeader.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock global fetch to avoid real network requests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("hmrcVatReturnPost handler (new tests)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME: "test-hmrc-requests-table",
    };
  });

  test("submits VAT return successfully and returns receipt", async () => {
    const headers = buildGovClientTestHeaders();
    const receipt = {
      formBundleNumber: "bundle-123",
      chargeRefNumber: "charge-456",
      processingDate: "2025-01-01T00:00:00Z",
    };

    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(receipt) });

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
      body: JSON.stringify({ vatNumber: "111222333", periodKey: "24A1", vatDue: 99.99, accessToken: "token-abc" }),
      headers,
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.receipt).toEqual(receipt);

    // Relaxed assertion: verify POST request URL and method
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/organisations/vat/111222333/returns"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("returns 400 when Authorization token is invalid or missing", async () => {
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
      body: JSON.stringify({ vatNumber: "111222333", periodKey: "24A1", vatDue: 100.0 }),
      headers: buildGovClientTestHeaders(),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    // Keep relaxed to avoid brittleness in exact wording
    expect(String(body.message)).toMatch(/access token|Authorization/i);
  });
});
