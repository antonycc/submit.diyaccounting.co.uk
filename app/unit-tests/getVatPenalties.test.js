// app/unit-tests/getVatPenalties.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";


import { httpGet } from "../functions/hmrcVatPenaltyGet.js";
import { buildGovClientTestHeaders } from "./govClientTestHeader.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe("getVatPenalties handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set stubbed mode
    process.env.TEST_VAT_PENALTIES = JSON.stringify({
      penalties: [
        {
          penaltyCategory: "LPP1",
          penaltyChargeReference: "CHARGEREF123456789",
          penaltyAmount: 200.0,
          period: {
            from: "2024-01-01",
            to: "2024-03-31",
          },
          triggerDate: "2024-05-08",
          vatOutstandingAmount: 1000.5,
        },
      ],
    });
  });

  test("should retrieve VAT penalties successfully", async () => {
    const event = {
      queryStringParameters: {
        vrn: "111222333",
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
    expect(body.penalties[0].penaltyAmount).toBe(200.0);
  });

  test("should retrieve VAT penalties with Gov-Test-Scenario", async () => {
    const event = {
      queryStringParameters: {
        "vrn": "111222333",
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
        vrn: "111222333",
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
    delete process.env.TEST_VAT_PENALTIES;

    const mockResponse = {
      penalties: [
        {
          penaltyCategory: "LPP1",
          penaltyChargeReference: "CHARGEREF123456789",
          penaltyAmount: 200.0,
          period: {
            from: "2024-01-01",
            to: "2024-03-31",
          },
          triggerDate: "2024-05-08",
          vatOutstandingAmount: 1000.5,
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const event = {
      queryStringParameters: {
        vrn: "111222333",
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
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/organisations/vat/111222333/penalties"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-access-token",
          Accept: "application/vnd.hmrc.1.0+json",
        }),
      }),
    );
  });

  test("should handle HMRC API error", async () => {
    // Remove stubbed mode
    delete process.env.TEST_VAT_PENALTIES;

    const errorMessage = "INVALID_VRN";

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: errorMessage }),
    });

    const event = {
      queryStringParameters: {
        vrn: "111222333",
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
