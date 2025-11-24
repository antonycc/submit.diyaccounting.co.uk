// app/unit-tests/hmrcVatReturnGet.handler.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { handler as getVatReturnHandler } from "@app/functions/hmrc/hmrcVatReturnGet.js";
import { buildGovClientTestHeaders } from "@app/unit-tests/app-lib/govClientTestHeader.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("hmrcVatReturnGet handler (new tests)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      TEST_VAT_RETURN: JSON.stringify({
        source: "stub",
        periodKey: "24A1",
        vatDueSales: 12.34,
        totalVatDue: 12.34,
        finalised: true,
      }),
    };
  });

  test("returns VAT return details using stubbed data", async () => {
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
      pathParameters: { periodKey: "24A1" },
      headers: { ...buildGovClientTestHeaders(), authorization: "Bearer token-abc" },
    };

    const result = await getVatReturnHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body).toHaveProperty("periodKey", "24A1");
    expect(body).toHaveProperty("totalVatDue", 12.34);
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
      pathParameters: { periodKey: "24A1" },
      headers: {},
    };

    const result = await getVatReturnHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(String(body.message)).toContain("Missing Authorization Bearer token");
  });

  test("returns 400 for invalid VRN", async () => {
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
      queryStringParameters: { vrn: "abc" },
      pathParameters: { periodKey: "24A1" },
      headers: { ...buildGovClientTestHeaders(), authorization: "Bearer token-abc" },
    };

    const result = await getVatReturnHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(String(body.message)).toContain("Invalid vrn format");
  });
});
