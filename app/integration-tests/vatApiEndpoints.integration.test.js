// app/integration-tests/vatApiEndpoints.integration.test.js

import { describe, afterAll, beforeEach, it, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

import { handler as getVatObligationsHandler } from "@app/functions/hmrc/hmrcVatObligationGet.js";
import { handler as getVatReturnHandler } from "@app/functions/hmrc/hmrcVatReturnGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("Integration – VAT API Endpoints (Direct Handler Testing)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    // Reset environment variables with stubbed mode enabled
    process.env = {
      ...originalEnv,
      TEST_BUNDLE_MOCK: "true",
      // Enable stubbed mode for predictable responses
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
      TEST_VAT_RETURN: JSON.stringify({
        source: "stub",
        periodKey: "24A1",
        vatDueSales: 1000.5,
        totalVatDue: 1000.5,
        finalised: true,
      }),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should validate VRN format consistently", async () => {
    const invalidEvent = {
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
      queryStringParameters: { vrn: "invalid-vrn" },
      headers: { authorization: "Bearer test-access-token" },
    };

    // Test obligations endpoint
    const obligationsResult = await getVatObligationsHandler(invalidEvent);
    const obligationsBody = JSON.parse(obligationsResult.body);
    expect(obligationsResult.statusCode).toBe(400);
    expect(obligationsBody.message).toContain("Invalid vrn format - must be 9 digits");
  });

  it("should require authorization for all endpoints", async () => {
    const noAuthEvent = {
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

    // Test obligations endpoint
    const obligationsResult = await getVatObligationsHandler(noAuthEvent);
    const obligationsBody = JSON.parse(obligationsResult.body);
    expect(obligationsResult.statusCode).toBe(400);
    expect(obligationsBody.message).toContain("Missing Authorization Bearer token");

    // Test return endpoint
    const returnEvent = {
      ...noAuthEvent,
      pathParameters: { periodKey: "24A1" },
    };
    const returnResult = await getVatReturnHandler(returnEvent);
    const returnBody = JSON.parse(returnResult.body);
    expect(returnResult.statusCode).toBe(400);
    expect(returnBody.message).toContain("Missing Authorization Bearer token");
  });

  it("should handle Gov-Test-Scenario headers", async () => {
    const eventWithScenario = {
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
      queryStringParameters: {
        "vrn": "111222333",
        "Gov-Test-Scenario": "QUARTERLY_NONE_MET",
      },
      headers: { authorization: "Bearer test-access-token" },
    };

    const result = await getVatObligationsHandler(eventWithScenario);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.obligations).toBeDefined();
  });
});
