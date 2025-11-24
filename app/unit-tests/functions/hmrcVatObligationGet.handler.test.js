// app/unit-tests/hmrcVatObligationGet.handler.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as getVatObligationsHandler } from "@app/functions/hmrc/hmrcVatObligationGet.js";
import { buildGovClientTestHeaders } from "@app/unit-tests/app-lib/govClientTestHeader.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("hmrcVatObligationGet handler (new tests)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      TEST_VAT_OBLIGATIONS: JSON.stringify({
        source: "stub",
        obligations: [
          {
            start: "2024-01-01",
            end: "2024-03-31",
            due: "2024-05-07",
            status: "F",
            periodKey: "24A1",
            received: "2024-05-06",
          },
        ],
      }),
    };
  });

  test("returns obligations using stubbed data", async () => {
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
      queryStringParameters: { vrn: "111222333" },
      headers: { ...buildGovClientTestHeaders(), authorization: "Bearer token-abc" },
    };

    const result = await getVatObligationsHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.obligations?.length).toBeGreaterThan(0);
  });

  test("returns 400 when Authorization is missing", async () => {
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
      queryStringParameters: { vrn: "111222333" },
      headers: {},
    };

    const result = await getVatObligationsHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(String(body.message)).toContain("Missing Authorization Bearer token");
  });

  test("returns 400 when dates are inverted", async () => {
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
      queryStringParameters: { vrn: "111222333", from: "2024-12-31", to: "2024-01-01" },
      headers: { ...buildGovClientTestHeaders(), authorization: "Bearer token-abc" },
    };

    const result = await getVatObligationsHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(String(body.message)).toContain("Invalid date range");
  });
});
