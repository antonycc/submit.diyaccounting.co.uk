// app/unit-tests/getVatPenalties.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";
import fetch from "node-fetch";

import { httpGet } from "../functions/getVatPenalties.js";
import { buildGovClientTestHeaders } from "./govClientTestHeader.js";

vi.mock("node-fetch");

describe("getVatPenalties handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set stubbed mode
    process.env.DIY_SUBMIT_TEST_VAT_PENALTIES = JSON.stringify({
      penalties: [
        {
          penaltyCategory: "LPP1",
          penaltyChargeReference: "CHARGEREF123456789",
          penaltyAmount: 200.00,
          period: {
            from: "2024-01-01",
            to: "2024-03-31",
          },
          triggerDate: "2024-05-08",
          vatOutstandingAmount: 1000.50,
        },
      ],
    });
  });

  test("should retrieve VAT penalties successfully", async () => {
    const event = {
      queryStringParameters: {
        vrn: "193054661",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.penalties).toBeDefined();
    expect(body.penalties).toHaveLength(1);
    expect(body.penalties[0].penaltyCategory).toBe("LPP1");
    expect(body.penalties[0].penaltyAmount).toBe(200.00);
  });

  test("should retrieve VAT penalties with Gov-Test-Scenario", async () => {
    const event = {
      queryStringParameters: {
        vrn: "193054661",
        "Gov-Test-Scenario": "PENALTY_POINTS",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.penalties).toBeDefined();
  });

  test("should return 400 when vrn is missing", async () => {
    const event = {
      queryStringParameters: {},
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Missing vrn parameter");
  });

  test("should return 400 when vrn format is invalid", async () => {
    const event = {
      queryStringParameters: {
        vrn: "invalid-vrn",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Invalid vrn format - must be 9 digits");
  });

  test("should return 400 when authorization header is missing", async () => {
    const event = {
      queryStringParameters: {
        vrn: "193054661",
      },
      headers: {
        ...buildGovClientTestHeaders(),
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Missing Authorization Bearer token");
  });

  test("should call HMRC API when not in stubbed mode", async () => {
    // Remove stubbed mode
    delete process.env.DIY_SUBMIT_TEST_VAT_PENALTIES;

    const mockResponse = {
      penalties: [
        {
          penaltyCategory: "LPP1",
          penaltyChargeReference: "CHARGEREF123456789",
          penaltyAmount: 200.00,
          period: {
            from: "2024-01-01",
            to: "2024-03-31",
          },
          triggerDate: "2024-05-08",
          vatOutstandingAmount: 1000.50,
        },
      ],
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const event = {
      queryStringParameters: {
        vrn: "193054661",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.penalties).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/organisations/vat/193054661/penalties"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-access-token",
          Accept: "application/vnd.hmrc.1.0+json",
        }),
      })
    );
  });

  test("should handle HMRC API error", async () => {
    // Remove stubbed mode
    delete process.env.DIY_SUBMIT_TEST_VAT_PENALTIES;

    const errorMessage = "INVALID_VRN";

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: errorMessage }),
    });

    const event = {
      queryStringParameters: {
        vrn: "193054661",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.message).toBe("HMRC VAT penalties retrieval failed");
  });
});