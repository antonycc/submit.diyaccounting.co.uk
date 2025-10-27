// app/unit-tests/getVatLiabilities.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";

import { httpGet } from "../functions/hmrcVatLiabilityGet.js";
import { buildGovClientTestHeaders } from "./govClientTestHeader.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe("getVatLiabilities handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set stubbed mode
    process.env.TEST_VAT_LIABILITIES = JSON.stringify({
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
    expect(body.liabilities).toBeDefined();
    expect(body.liabilities).toHaveLength(1);
    expect(body.liabilities[0].type).toBe("VAT Return Debit Charge");
    expect(body.liabilities[0].originalAmount).toBe(1000.5);
  });

  test("should retrieve VAT liabilities with date filters", async () => {
    const event = {
      queryStringParameters: {
        vrn: "111222333",
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
    delete process.env.TEST_VAT_LIABILITIES;

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
    expect(body.liabilities).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/organisations/vat/111222333/liabilities"),
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
    delete process.env.TEST_VAT_LIABILITIES;

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
    expect(body.message).toBe("HMRC VAT liabilities retrieval failed");
  });
});
