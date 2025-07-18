import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { submitVatHandler } from "@src/lib/main.js";

// Mock node-fetch
vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

import fetch from "node-fetch";

describe("submitVatHandler", () => {

  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      PORT: "3000",
      HMRC_BASE_URI: "https://test",
      HMRC_CLIENT_ID: "test client id",
      HMRC_REDIRECT_URI: "http://hmrc.redirect:3000",
      HMRC_CLIENT_SECRET: "test hmrc client secret",
      TEST_REDIRECT_URI: "http://test.redirect:3000/",
      TEST_ACCESS_TOKEN: "test access token",
      TEST_RECEIPT: JSON.stringify({
        formBundleNumber: "test-123456789012",
        chargeRefNumber: "test-XM002610011594",
        processingDate: "2023-01-01T12:00:00.000Z"
      }),
    };
  });

  test("should submit VAT return successfully", async () => {
    const mockReceipt = {
      formBundleNumber: "mock-123456789012",
      chargeRefNumber: "mock-XM002610011594",
      processingDate: "2023-01-01T12:00:00.000Z",
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockReceipt),
    });

    const event = {
      body: JSON.stringify({
        vatNumber: "123456789",
        periodKey: "23A1",
        vatDue: "1000.50",
        accessToken: "test-access-token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body).toEqual(mockReceipt);

    // Verify fetch was called with correct parameters
    expect(fetch).toHaveBeenCalledWith("https://test/organisations/vat/123456789/returns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test-access-token",
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
        accessToken: "test-access-token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing parameters");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when periodKey is missing", async () => {
    const event = {
      body: JSON.stringify({
        vatNumber: "123456789",
        vatDue: "1000.50",
        accessToken: "test-access-token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing parameters");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when vatDue is missing", async () => {
    const event = {
      body: JSON.stringify({
        vatNumber: "123456789",
        periodKey: "23A1",
        accessToken: "test-access-token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing parameters");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when accessToken is missing", async () => {
    const event = {
      body: JSON.stringify({
        vatNumber: "123456789",
        periodKey: "23A1",
        vatDue: "1000.50",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing parameters");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when all parameters are missing", async () => {
    const event = {
      body: JSON.stringify({}),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing parameters");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when body is empty", async () => {
    const event = {
      body: "",
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing parameters");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when body is null", async () => {
    const event = {
      body: null,
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing parameters");
    expect(fetch).not.toHaveBeenCalled();
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
    expect(body.error).toBe("Missing parameters");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should handle HMRC API error response", async () => {
    const errorMessage = "INVALID_VAT_NUMBER";

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(errorMessage),
    });

    const event = {
      body: JSON.stringify({
        vatNumber: "invalid",
        periodKey: "23A1",
        vatDue: "1000.50",
        accessToken: "test-access-token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe(errorMessage);
  });

  test("should handle HMRC API 401 unauthorized", async () => {
    const errorMessage = "INVALID_CREDENTIALS";

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(errorMessage),
    });

    const event = {
      body: JSON.stringify({
        vatNumber: "123456789",
        periodKey: "23A1",
        vatDue: "1000.50",
        accessToken: "invalid-token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(401);
    expect(body.error).toBe(errorMessage);
  });

  test("should handle numeric vatDue as string", async () => {
    const mockReceipt = { formBundleNumber: "123456789012" };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockReceipt),
    });

    const event = {
      body: JSON.stringify({
        vatNumber: "123456789",
        periodKey: "23A1",
        vatDue: "1500.75",
        accessToken: "test-access-token",
      }),
    };

    const result = await submitVatHandler(event);

    expect(result.statusCode).toBe(200);

    // Verify the payload was constructed with correct numeric values
    const fetchCall = fetch.mock.calls[0];
    const payload = JSON.parse(fetchCall[1].body);
    expect(payload.vatDueSales).toBe(1500.75);
    expect(payload.totalVatDue).toBe(1500.75);
    expect(payload.netVatDue).toBe(1500.75);
  });

  test("should handle numeric vatDue as number", async () => {
    const mockReceipt = { formBundleNumber: "123456789012" };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockReceipt),
    });

    const event = {
      body: JSON.stringify({
        vatNumber: "123456789",
        periodKey: "23A1",
        vatDue: 2000.25,
        accessToken: "test-access-token",
      }),
    };

    const result = await submitVatHandler(event);

    expect(result.statusCode).toBe(200);

    // Verify the payload was constructed with correct numeric values
    const fetchCall = fetch.mock.calls[0];
    const payload = JSON.parse(fetchCall[1].body);
    expect(payload.vatDueSales).toBe(2000.25);
    expect(payload.totalVatDue).toBe(2000.25);
    expect(payload.netVatDue).toBe(2000.25);
  });

  test("should handle malformed JSON in request body", async () => {
    const event = {
      body: "invalid-json",
    };

    await expect(submitVatHandler(event)).rejects.toThrow();
  });

  test("should handle network errors", async () => {
    fetch.mockRejectedValueOnce(new Error("Network error"));

    const event = {
      body: JSON.stringify({
        vatNumber: "123456789",
        periodKey: "23A1",
        vatDue: "1000.50",
        accessToken: "test-access-token",
      }),
    };

    await expect(submitVatHandler(event)).rejects.toThrow("Network error");
  });

  test("should handle missing body property", async () => {
    const event = {};

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing parameters");
    expect(fetch).not.toHaveBeenCalled();
  });
});
