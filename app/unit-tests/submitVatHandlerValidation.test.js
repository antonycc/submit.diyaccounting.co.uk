// app/unit-tests/submitVatHandlerValidation.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import dotenv from "dotenv";

import { httpPost as submitVatHandler } from "@app/functions/submitVat.js";

dotenv.config({ path: ".env.test" });

// Mock node-fetch
vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

import fetch from "node-fetch";
import { buildGovClientTestHeaders } from "@app/unit-tests/govClientTestHeader.js";

describe("submitVatHandler - Enhanced Validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("should reject invalid VRN with proper error message", async () => {
    const headers = buildGovClientTestHeaders();
    const event = {
      body: JSON.stringify({
        vatNumber: "123456789", // Invalid VRN checksum
        periodKey: "24A1",
        vatDue: "1000.50",
        accessToken: "test access token",
      }),
      headers: { ...headers },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("VRN: VRN checksum validation failed");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should reject invalid period key format", async () => {
    const headers = buildGovClientTestHeaders();
    const event = {
      body: JSON.stringify({
        vatNumber: "193054638", // Valid VRN
        periodKey: "2024A1", // Invalid format (too many digits)
        vatDue: "1000.50",
        accessToken: "test access token",
      }),
      headers: { ...headers },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("Period: Period key must be in format");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should reject invalid VAT amount", async () => {
    const headers = buildGovClientTestHeaders();
    const event = {
      body: JSON.stringify({
        vatNumber: "193054638", // Valid VRN
        periodKey: "24A1",
        vatDue: "-100", // Negative amount
        accessToken: "test access token",
      }),
      headers: { ...headers },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("VAT Amount: VAT amount cannot be negative");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should reject multiple validation errors", async () => {
    const headers = buildGovClientTestHeaders();
    const event = {
      body: JSON.stringify({
        vatNumber: "12345678", // Too short
        periodKey: "24A5", // Invalid quarter
        vatDue: "abc", // Non-numeric
        accessToken: "test access token",
      }),
      headers: { ...headers },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("VRN:");
    expect(body.message).toContain("Period:");
    expect(body.message).toContain("VAT Amount:");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should accept valid inputs and proceed with submission", async () => {
    const headers = buildGovClientTestHeaders();
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
        vatNumber: "193054638", // Valid VRN
        periodKey: "24A1", // Valid period
        vatDue: "1000.50", // Valid amount
        accessToken: "test access token",
      }),
      headers: { ...headers },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.receipt).toEqual(mockReceipt);
    expect(fetch).toHaveBeenCalled();
  });

  test("should handle VAT amount with excessive decimal places", async () => {
    const headers = buildGovClientTestHeaders();
    const event = {
      body: JSON.stringify({
        vatNumber: "193054638",
        periodKey: "24A1",
        vatDue: "1000.123", // Too many decimal places
        accessToken: "test access token",
      }),
      headers: { ...headers },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("VAT Amount: VAT amount cannot have more than 2 decimal places");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should handle zero VAT amount", async () => {
    const headers = buildGovClientTestHeaders();
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
        vatNumber: "193054638",
        periodKey: "24A1",
        vatDue: "0", // Zero amount should be valid
        accessToken: "test access token",
      }),
      headers: { ...headers },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.receipt).toEqual(mockReceipt);
    expect(fetch).toHaveBeenCalled();
  });

  test("should handle annual period key", async () => {
    const headers = buildGovClientTestHeaders();
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
        vatNumber: "193054638",
        periodKey: "24AA", // Annual period
        vatDue: "1000.50",
        accessToken: "test access token",
      }),
      headers: { ...headers },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.receipt).toEqual(mockReceipt);
    expect(fetch).toHaveBeenCalled();
  });

  test("should handle very large VAT amount within limits", async () => {
    const headers = buildGovClientTestHeaders();
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
        vatNumber: "193054638",
        periodKey: "24A1",
        vatDue: "9999999.99", // Large but valid amount
        accessToken: "test access token",
      }),
      headers: { ...headers },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.receipt).toEqual(mockReceipt);
    expect(fetch).toHaveBeenCalled();
  });

  test("should reject extremely large VAT amount", async () => {
    const headers = buildGovClientTestHeaders();
    const event = {
      body: JSON.stringify({
        vatNumber: "193054638",
        periodKey: "24A1",
        vatDue: "20000000", // Exceeds limit
        accessToken: "test access token",
      }),
      headers: { ...headers },
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toContain("VAT Amount: VAT amount exceeds reasonable limit");
    expect(fetch).not.toHaveBeenCalled();
  });
});