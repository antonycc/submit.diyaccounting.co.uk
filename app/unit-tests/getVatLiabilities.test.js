// app/unit-tests/getVatLiabilities.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";
import fetch from "node-fetch";

import { httpGet } from "../functions/getVatLiabilities.js";
import { buildGovClientTestHeaders } from "./govClientTestHeader.js";

vi.mock("node-fetch");

describe("getVatLiabilities handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set stubbed mode
    process.env.DIY_SUBMIT_TEST_VAT_LIABILITIES = JSON.stringify({
      liabilities: [
        {
          taxPeriod: {
            from: "2024-01-01",
            to: "2024-03-31",
          },
          type: "VAT Return Debit Charge",
          originalAmount: 1000.5,
          outstandingAmount: 500.25,
          due: "2024-05-07",
        },
      ],
    });
  });

  test("should retrieve VAT liabilities successfully", async () => {
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
    expect(body.liabilities).toBeDefined();
    expect(body.liabilities).toHaveLength(1);
    expect(body.liabilities[0].type).toBe("VAT Return Debit Charge");
    expect(body.liabilities[0].originalAmount).toBe(1000.5);
  });

  test("should retrieve VAT liabilities with date filters", async () => {
    const event = {
      queryStringParameters: {
        vrn: "193054661",
        from: "2024-01-01",
        to: "2024-06-30",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await httpGet(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.liabilities).toBeDefined();
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
    delete process.env.DIY_SUBMIT_TEST_VAT_LIABILITIES;

    const mockResponse = {
      liabilities: [
        {
          taxPeriod: {
            from: "2024-01-01",
            to: "2024-03-31",
          },
          type: "VAT Return Debit Charge",
          originalAmount: 1000.5,
          outstandingAmount: 500.25,
          due: "2024-05-07",
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
    expect(body.liabilities).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/organisations/vat/193054661/liabilities"),
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
    delete process.env.DIY_SUBMIT_TEST_VAT_LIABILITIES;

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
    expect(body.message).toBe("HMRC VAT liabilities retrieval failed");
  });
});
