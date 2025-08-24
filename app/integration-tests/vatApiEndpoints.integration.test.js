// app/integration-tests/vatApiEndpoints.integration.test.js

import { describe, beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import dotenv from "dotenv";

import { httpGet as getVatObligationsHandler } from "@app/functions/getVatObligations.js";
import { httpGet as getVatReturnHandler } from "@app/functions/getVatReturn.js";
import { httpGet as getVatLiabilitiesHandler } from "@app/functions/getVatLiabilities.js";

dotenv.config({ path: ".env.test" });

describe("Integration – VAT API Endpoints (Direct Handler Testing)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    // Reset environment variables with stubbed mode enabled
    process.env = {
      ...originalEnv,
      DIY_SUBMIT_BUNDLE_MOCK: "true",
      // Enable stubbed mode for predictable responses
      DIY_SUBMIT_TEST_VAT_OBLIGATIONS: JSON.stringify({
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
      DIY_SUBMIT_TEST_VAT_RETURN: JSON.stringify({
        periodKey: "24A1",
        vatDueSales: 1000.50,
        totalVatDue: 1000.50,
        finalised: true,
      }),
      DIY_SUBMIT_TEST_VAT_LIABILITIES: JSON.stringify({
        liabilities: [
          {
            taxPeriod: { from: "2024-01-01", to: "2024-03-31" },
            type: "VAT Return Debit Charge",
            originalAmount: 1000.50,
            outstandingAmount: 500.25,
            due: "2024-05-07",
          },
        ],
      }),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should retrieve VAT obligations in stubbed mode", async () => {
    const event = {
      queryStringParameters: { vrn: "193054661" },
      headers: { authorization: "Bearer test-access-token" },
    };

    const result = await getVatObligationsHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.obligations).toBeDefined();
    expect(body.obligations).toHaveLength(1);
    expect(body.obligations[0].periodKey).toBe("24A1");
  });

  it("should retrieve VAT return in stubbed mode", async () => {
    const event = {
      queryStringParameters: { vrn: "193054661" },
      pathParameters: { periodKey: "24A1" },
      headers: { authorization: "Bearer test-access-token" },
    };

    const result = await getVatReturnHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.periodKey).toBe("24A1");
    expect(body.vatDueSales).toBe(1000.50);
    expect(body.finalised).toBe(true);
  });

  it("should retrieve VAT liabilities in stubbed mode", async () => {
    const event = {
      queryStringParameters: { vrn: "193054661" },
      headers: { authorization: "Bearer test-access-token" },
    };

    const result = await getVatLiabilitiesHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.liabilities).toBeDefined();
    expect(body.liabilities).toHaveLength(1);
    expect(body.liabilities[0].type).toBe("VAT Return Debit Charge");
  });

  it("should validate VRN format consistently", async () => {
    const invalidEvent = {
      queryStringParameters: { vrn: "invalid-vrn" },
      headers: { authorization: "Bearer test-access-token" },
    };

    // Test obligations endpoint
    const obligationsResult = await getVatObligationsHandler(invalidEvent);
    const obligationsBody = JSON.parse(obligationsResult.body);
    expect(obligationsResult.statusCode).toBe(400);
    expect(obligationsBody.message).toContain("Invalid vrn format - must be 9 digits");

    // Test liabilities endpoint
    const liabilitiesResult = await getVatLiabilitiesHandler(invalidEvent);
    const liabilitiesBody = JSON.parse(liabilitiesResult.body);
    expect(liabilitiesResult.statusCode).toBe(400);
    expect(liabilitiesBody.message).toContain("Invalid vrn format - must be 9 digits");
  });

  it("should require authorization for all endpoints", async () => {
    const noAuthEvent = {
      queryStringParameters: { vrn: "193054661" },
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
      queryStringParameters: { 
        vrn: "193054661",
        "Gov-Test-Scenario": "QUARTERLY_NONE_MET"
      },
      headers: { authorization: "Bearer test-access-token" },
    };

    const result = await getVatObligationsHandler(eventWithScenario);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.obligations).toBeDefined();
  });
});