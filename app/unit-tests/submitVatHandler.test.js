// app/unit-tests/submitVatHandler.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

import { handler as submitVatHandler } from "@app/functions/hmrc/hmrcVatReturnPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { buildGovClientTestHeaders } from "@app/unit-tests/govClientTestHeader.js";

describe("httpPostMock", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
      HMRC_BASE_URI: "https://test",
    };
  });

  test("should submit VAT return successfully", async () => {
    const headers = buildGovClientTestHeaders();
    const mockReceipt = {
      formBundleNumber: "mock-123456789012",
      chargeRefNumber: "mock-XM002610011594",
      processingDate: "2023-01-01T12:00:00.000Z",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockReceipt),
    });

    const event = {
      requestContext: {
        requestId: "test-request-id",
      },
      body: JSON.stringify({
        vatNumber: "111222333",
        periodKey: "23A1",
        vatDue: "1000.50",
        accessToken: "test access token",
      }),
      headers: {
        ...headers,
      },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.receipt).toEqual(mockReceipt);

    // Verify fetch was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith("https://test/organisations/vat/111222333/returns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test access token",
        ...headers,
        "Accept": "application/vnd.hmrc.1.0+json",
        "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
        "Gov-Vendor-Forwarded": "by=203.0.113.6&for=198.51.100.0",
        "Gov-Vendor-License-IDs": "my-licensed-software=8D7963490527D33716835EE7C195516D5E562E03B224E9B359836466EE40CDE1",
        "Gov-Vendor-Product-Name": "DIY Accounting Submit",
        "Gov-Vendor-Version": "web-submit-diyaccounting-co-uk-0.0.2-4",
        "x-request-id": "test-request-id",
      },
      body: JSON.stringify({
        periodKey: "23A1",
        vatDueSales: 1000.5,
        vatDueAcquisitions: 0,
        totalVatDue: 1000.5,
        vatReclaimedCurrPeriod: 0,
        netVatDue: 1000.5,
        totalValueSalesExVAT: 0,
        totalValuePurchasesExVAT: 0,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
        finalised: true,
      }),
    });
  });

  test("should return 400 when vatNumber is missing", async () => {
    const event = {
      body: JSON.stringify({
        periodKey: "23A1",
        vatDue: "1000.50",
        accessToken: "test access token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing vatNumber parameter from body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("should return 400 when periodKey is missing", async () => {
    const event = {
      body: JSON.stringify({
        vatNumber: "111222333",
        vatDue: "1000.50",
        accessToken: "test access token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing periodKey parameter from body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("should return 400 when vatDue is missing", async () => {
    const event = {
      body: JSON.stringify({
        vatNumber: "111222333",
        periodKey: "23A1",
        accessToken: "test access token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing vatDue parameter from body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("should return 400 when accessToken is missing", async () => {
    const event = {
      body: JSON.stringify({
        vatNumber: "111222333",
        periodKey: "23A1",
        vatDue: "1000.50",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Error: Invalid access token provided");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("should return 400 when all parameters are missing", async () => {
    const event = {
      body: JSON.stringify({}),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe(
      "Missing vatNumber parameter from body, Missing periodKey parameter from body, Missing vatDue parameter from body, Missing accessToken parameter from body",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("should return 400 when body is empty", async () => {
    const event = {
      body: "",
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe(
      "Missing vatNumber parameter from body, Missing periodKey parameter from body, Missing vatDue parameter from body, Missing accessToken parameter from body",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("should return 400 when body is null", async () => {
    const event = {
      body: null,
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe(
      "Missing vatNumber parameter from body, Missing periodKey parameter from body, Missing vatDue parameter from body, Missing accessToken parameter from body",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("should handle empty string parameters", async () => {
    const event = {
      body: JSON.stringify({
        vatNumber: "",
        periodKey: "",
        vatDue: "",
        accessToken: "",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe(
      "Missing vatNumber parameter from body, Missing periodKey parameter from body, Missing vatDue parameter from body, Missing accessToken parameter from body",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("should handle HMRC API error response", async () => {
    const errorMessage = "INVALID_VAT_NUMBER";

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: errorMessage }),
      text: () => Promise.resolve(errorMessage),
    });

    const event = {
      body: JSON.stringify({
        vatNumber: "111222333",
        periodKey: "23A1",
        vatDue: "1000.50",
        accessToken: "test access token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.responseBody.error).toBe(errorMessage);
  });

  test("should handle HMRC API 401 unauthorized", async () => {
    const errorMessage = "INVALID_CREDENTIALS";

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: errorMessage }),
      text: () => Promise.resolve(errorMessage),
    });

    const event = {
      body: JSON.stringify({
        vatNumber: "111222333",
        periodKey: "23A1",
        vatDue: "1000.50",
        accessToken: "invalid-token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.responseBody.error).toBe(errorMessage);
  });

  test("should handle numeric vatDue as string", async () => {
    const mockReceipt = { formBundleNumber: "123456789012" };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockReceipt),
    });

    const event = {
      body: JSON.stringify({
        vatNumber: "111222333",
        periodKey: "23A1",
        vatDue: "1500.75",
        accessToken: "test access token",
      }),
    };

    const result = await submitVatHandler(event);

    expect(result.statusCode).toBe(200);

    // Verify the payload was constructed with correct numeric values
    const fetchCall = mockFetch.mock.calls[0];
    const payload = JSON.parse(fetchCall[1].body);
    expect(payload.vatDueSales).toBe(1500.75);
    expect(payload.totalVatDue).toBe(1500.75);
    expect(payload.netVatDue).toBe(1500.75);
  });

  test("should handle numeric vatDue as number", async () => {
    const mockReceipt = { formBundleNumber: "123456789012" };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockReceipt),
    });

    const event = {
      body: JSON.stringify({
        vatNumber: "111222333",
        periodKey: "23A1",
        vatDue: 2000.25,
        accessToken: "test access token",
      }),
    };

    const result = await submitVatHandler(event);

    expect(result.statusCode).toBe(200);

    // Verify the payload was constructed with correct numeric values
    const fetchCall = mockFetch.mock.calls[0];
    const payload = JSON.parse(fetchCall[1].body);
    expect(payload.vatDueSales).toBe(2000.25);
    expect(payload.totalVatDue).toBe(2000.25);
    expect(payload.netVatDue).toBe(2000.25);
  });

  test("should handle malformed JSON in request body", async () => {
    const event = {
      body: "invalid-json",
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(400);
    expect(body.message).toBe(
      "Missing vatNumber parameter from body, Missing periodKey parameter from body, Missing vatDue parameter from body, Missing accessToken parameter from body",
    );
  });

  test("should handle network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const event = {
      body: JSON.stringify({
        vatNumber: "111222333",
        periodKey: "23A1",
        vatDue: "1000.50",
        accessToken: "test access token",
      }),
    };

    await expect(submitVatHandler(event)).rejects.toThrow("Network error");
  });

  test("should handle missing body property", async () => {
    const event = {};

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe(
      "Missing vatNumber parameter from body, Missing periodKey parameter from body, Missing vatDue parameter from body, Missing accessToken parameter from body",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
