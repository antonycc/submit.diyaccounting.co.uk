// app/unit-tests/getVatReturn.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";
import fetch from "node-fetch";

import { httpGet } from "../functions/hmrcVatReturnGet.js";
import { buildGovClientTestHeaders } from "./govClientTestHeader.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

vi.mock("node-fetch");

describe("getVatReturn handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set stubbed mode
    process.env.TEST_VAT_RETURN = JSON.stringify({
      periodKey: "24A1",
      vatDueSales: 1000.5,
      vatDueAcquisitions: 0.0,
      totalVatDue: 1000.5,
      vatReclaimedCurrPeriod: 0.0,
      netVatDue: 1000.5,
      totalValueSalesExVAT: 4000.0,
      totalValuePurchasesExVAT: 1000.0,
      totalValueGoodsSuppliedExVAT: 0.0,
      totalAcquisitionsExVAT: 0.0,
      finalised: true,
    });
  });

  test("should retrieve VAT return successfully", async () => {
    const event = {
      queryStringParameters: {
        vrn: "111222333",
        periodKey: "24A1",
      },
      pathParameters: {
        periodKey: "24A1",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.periodKey).toBe("24A1");
    expect(body.vatDueSales).toBe(1000.5);
    expect(body.totalVatDue).toBe(1000.5);
    expect(body.finalised).toBe(true);
  });

  test("should retrieve VAT return with Gov-Test-Scenario", async () => {
    const event = {
      queryStringParameters: {
        "vrn": "111222333",
        "Gov-Test-Scenario": "SINGLE_LIABILITY",
      },
      pathParameters: {
        periodKey: "24A1",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.periodKey).toBe("24A1");
  });

  test("should return 400 when vrn is missing", async () => {
    const event = {
      queryStringParameters: {},
      pathParameters: {
        periodKey: "24A1",
      },
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

  test("should return 400 when periodKey is missing", async () => {
    const event = {
      queryStringParameters: {
        vrn: "111222333",
      },
      pathParameters: {},
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Missing periodKey parameter");
  });

  test("should return 400 when vrn format is invalid", async () => {
    const event = {
      queryStringParameters: {
        vrn: "invalid-vrn",
      },
      pathParameters: {
        periodKey: "24A1",
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

  test("should return 400 when periodKey format is invalid", async () => {
    const event = {
      queryStringParameters: {
        vrn: "111222333",
      },
      pathParameters: {
        periodKey: "invalid-period",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Invalid periodKey format");
  });

  test("should return 400 when authorization header is missing", async () => {
    const event = {
      queryStringParameters: {
        vrn: "111222333",
      },
      pathParameters: {
        periodKey: "24A1",
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
    delete process.env.TEST_VAT_RETURN;

    const mockResponse = {
      periodKey: "24A1",
      vatDueSales: 1000.5,
      totalVatDue: 1000.5,
      finalised: true,
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const event = {
      queryStringParameters: {
        vrn: "111222333",
      },
      pathParameters: {
        periodKey: "24A1",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.periodKey).toBe("24A1");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/organisations/vat/111222333/returns/24A1"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-access-token",
          Accept: "application/vnd.hmrc.1.0+json",
        }),
      }),
    );
  });

  test("should handle HMRC API 404 error", async () => {
    // Remove stubbed mode
    delete process.env.TEST_VAT_RETURN;

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ code: "NOT_FOUND", message: "The requested resource could not be found" }),
    });

    const event = {
      queryStringParameters: {
        vrn: "111222333",
      },
      pathParameters: {
        periodKey: "24A1",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("VAT return not found for the specified period");
  });

  test("should handle HMRC API error", async () => {
    // Remove stubbed mode
    delete process.env.TEST_VAT_RETURN;

    const errorMessage = "INVALID_VRN";

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: errorMessage }),
    });

    const event = {
      queryStringParameters: {
        vrn: "111222333",
      },
      pathParameters: {
        periodKey: "24A1",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.message).toBe("HMRC VAT return retrieval failed");
  });
});
