import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { submitVatHandler } from "@src/lib/main.js";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

// Mock node-fetch
vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

import fetch from "node-fetch";
import {buildGovClientTestHeaders} from "@tests/unit/govClientTestHeader.js";

describe("submitVatHandleLocal", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "stubbed",
      DIY_SUBMIT_TEST_ACCESS_TOKEN: "eyJraWQiOiJ0ZXN0LWFwaS1zZXJ2aWNlLWhtcmMifQ.eyJhdWQiOiJ1cU1IQTZSc0RHR2E3aDhFRzJWcWZxQW12NHQiLCJzdWIiOiI4ODg3NzI2MTI3NTYiLCJpc3MiOiJodHRwczovL3Rlc3QtYXBpLnNlcnZpY2UuaG1yYy5nb3YudWsiLCJleHBpcmVkX3VzZXJuYW1lIjoiODg4NzcyNjEyNzU2IiwianRpIjoiYjA5N2QwMjItZDY5Ny00YjA5LTkzMzctYjQwZDUxMGEyN2E0IiwicmVmcmVzaF9jb250ZXh0IjoiL2FjY291bnRzLzY4ODc3MjYxMjc1NiIsInNjb3BlcyI6WyJtYWtpbmctdGF4LWluY29tZS10YXgiLCJyZWFkLXByb2ZpbGUiLCJyZWFkLWltcG9ydCIsInJlYWQtbmF0aW9uYWwtcHJvZmlsZSIsInJlYWQtbmF0aW9uYWwtcGF5bWVudCIsInJlYWQtdGF4LWltcG9ydCIsInJlYWQtdGF4LW5hdGlvbmFsLXByb2ZpbGUiLCJyZWFkLXRheC1uYXRpb25hbC1wYXltZW50Il0sIm5iZiI6MTY5OTg4MDg1OSwiaWF0IjoxNjk5ODgwODU5fQ.8e7d7",
      DIY_SUBMIT_TEST_RECEIPT: JSON.stringify({
        formBundleNumber: "local-123456789012",
        chargeRefNumber: "local-XM002610011594",
        processingDate: "2023-01-01T12:00:00.000Z",
      }),
    };
  });

  test("should submit VAT return successfully", async () => {
    const headers = buildGovClientTestHeaders();
    const mockReceipt = {
      formBundleNumber: "local-123456789012",
      chargeRefNumber: "local-XM002610011594",
      processingDate: "2023-01-01T12:00:00.000Z",
    };

    // No mock because the local version should re-direct right back.

    const event = {
      body: JSON.stringify({
        vatNumber: "193054661",
        periodKey: "23A1",
        vatDue: "1000.50",
        hmrcAccessToken: "test access token",
        ...headers,
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);
    const receipt = body.receipt;

    expect(result.statusCode).toBe(200);
    expect(receipt).toEqual(mockReceipt);

    // Verify fetch was called with correct parameters
    // NOP
  });

  test("should return 400 when vatNumber is missing", async () => {
    const event = {
      body: JSON.stringify({
        periodKey: "23A1",
        vatDue: "1000.50",
        hmrcAccessToken: "test access token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing vatNumber parameter from body");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when periodKey is missing", async () => {
    const event = {
      body: JSON.stringify({
        vatNumber: "193054661",
        vatDue: "1000.50",
        hmrcAccessToken: "test access token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing periodKey parameter from body");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when vatDue is missing", async () => {
    const event = {
      body: JSON.stringify({
        vatNumber: "193054661",
        periodKey: "23A1",
        hmrcAccessToken: "test access token",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing vatDue parameter from body");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when hmrcAccessToken is missing", async () => {
    const event = {
      body: JSON.stringify({
        vatNumber: "193054661",
        periodKey: "23A1",
        vatDue: "1000.50",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing hmrcAccessToken parameter from body");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when all parameters are missing", async () => {
    const event = {
      body: JSON.stringify({}),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing vatNumber parameter from body, Missing periodKey parameter from body, Missing vatDue parameter from body, Missing hmrcAccessToken parameter from body");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when body is empty", async () => {
    const event = {
      body: "",
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing vatNumber parameter from body, Missing periodKey parameter from body, Missing vatDue parameter from body, Missing hmrcAccessToken parameter from body");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when body is null", async () => {
    const event = {
      body: null,
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing vatNumber parameter from body, Missing periodKey parameter from body, Missing vatDue parameter from body, Missing hmrcAccessToken parameter from body");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should handle empty string parameters", async () => {
    const event = {
      body: JSON.stringify({
        vatNumber: "",
        periodKey: "",
        vatDue: "",
        hmrcAccessToken: "",
      }),
    };

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing vatNumber parameter from body, Missing periodKey parameter from body, Missing vatDue parameter from body, Missing hmrcAccessToken parameter from body");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should handle malformed JSON in request body", async () => {
    const event = {
      body: "invalid-json",
    };

    await expect(submitVatHandler(event)).rejects.toThrow();
  });

  test("should handle missing body property", async () => {
    const event = {};

    const result = await submitVatHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing vatNumber parameter from body, Missing periodKey parameter from body, Missing vatDue parameter from body, Missing hmrcAccessToken parameter from body");
    expect(fetch).not.toHaveBeenCalled();
  });
});
