// app/unit-tests/getVatPayments.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";

import { handler } from "./hmrcVatPaymentGet.js";
import { buildGovClientTestHeaders } from "@app/unit-tests/govClientTestHeader.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("getVatPayments handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set stubbed mode
    process.env.TEST_VAT_PAYMENTS = JSON.stringify({
      payments: [
        {
          amount: 1000.5,
          received: "2024-05-06",
          allocatedToLiability: "2024-05-07",
        },
        {
          amount: 250.0,
          received: "2024-08-06",
          allocatedToLiability: "2024-08-07",
        },
      ],
    });
  });

  test("should retrieve VAT payments successfully", async () => {
    const event = {
      queryStringParameters: {
        vrn: "111222333",
      },
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.payments).toBeDefined();
    expect(body.payments).toHaveLength(2);
    expect(body.payments[0].amount).toBe(1000.5);
    expect(body.payments[1].amount).toBe(250.0);
  });

  test("should retrieve VAT payments with date filters", async () => {
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

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.payments).toBeDefined();
  });

  test("should return 400 when vrn is missing", async () => {
    const event = {
      queryStringParameters: {},
      headers: {
        ...buildGovClientTestHeaders(),
        authorization: "Bearer test-access-token",
      },
    };

    const result = await handler(event);
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

    const result = await handler(event);
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

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Missing Authorization Bearer token");
  });

  test("should call HMRC API when not in stubbed mode", async () => {
    // Remove stubbed mode
    delete process.env.TEST_VAT_PAYMENTS;

    const mockResponse = {
      payments: [
        {
          amount: 1000.5,
          received: "2024-05-06",
          allocatedToLiability: "2024-05-07",
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

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.payments).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/organisations/vat/111222333/payments"),
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
    delete process.env.TEST_VAT_PAYMENTS;

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

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(500);
    expect(body.message).toBe("HMRC VAT payments retrieval failed");
  });
});
