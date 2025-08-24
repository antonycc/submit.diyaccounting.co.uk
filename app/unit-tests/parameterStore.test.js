// app/unit-tests/parameterStore.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getParameter,
  getBooleanParameter,
  isBundleMockMode,
  isAuthMockMode,
  clearParameterCache,
  __getParameterCache,
} from "../lib/parameterStore.js";

// Mock the AWS SDK
const mockSend = vi.fn();
const mockSSMClient = {
  send: mockSend,
};

vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: vi.fn(() => mockSSMClient),
  GetParameterCommand: vi.fn((params) => ({ params })),
}));

describe("Parameter Store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearParameterCache();
    // Clear environment variables
    delete process.env.DIY_SUBMIT_BUNDLE_MOCK;
    delete process.env.DIY_SUBMIT_TEST_MOCK_OAUTH2;
  });

  describe("getParameter", () => {
    it("should return parameter value from AWS SSM", async () => {
      mockSend.mockResolvedValue({
        Parameter: { Value: "test-value" },
      });

      const result = await getParameter("/test/param", "fallback");
      expect(result).toBe("test-value");
    });

    it("should return fallback value when parameter not found", async () => {
      mockSend.mockRejectedValue(new Error("ParameterNotFound"));

      const result = await getParameter("/test/param", "fallback");
      expect(result).toBe("fallback");
    });

    it("should cache parameter values", async () => {
      mockSend.mockResolvedValue({
        Parameter: { Value: "cached-value" },
      });

      // First call
      const result1 = await getParameter("/test/param", "fallback");
      expect(result1).toBe("cached-value");
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await getParameter("/test/param", "fallback");
      expect(result2).toBe("cached-value");
      expect(mockSend).toHaveBeenCalledTimes(1); // Still only called once
    });
  });

  describe("getBooleanParameter", () => {
    it("should return true for 'true' string", async () => {
      mockSend.mockResolvedValue({
        Parameter: { Value: "true" },
      });

      const result = await getBooleanParameter("/test/bool", false);
      expect(result).toBe(true);
    });

    it("should return true for '1' string", async () => {
      mockSend.mockResolvedValue({
        Parameter: { Value: "1" },
      });

      const result = await getBooleanParameter("/test/bool", false);
      expect(result).toBe(true);
    });

    it("should return false for 'false' string", async () => {
      mockSend.mockResolvedValue({
        Parameter: { Value: "false" },
      });

      const result = await getBooleanParameter("/test/bool", true);
      expect(result).toBe(false);
    });

    it("should return fallback value on error", async () => {
      mockSend.mockRejectedValue(new Error("Network error"));

      const result = await getBooleanParameter("/test/bool", true);
      expect(result).toBe(true);
    });
  });

  describe("isBundleMockMode", () => {
    it("should return parameter store value when available", async () => {
      mockSend.mockResolvedValue({
        Parameter: { Value: "true" },
      });

      const result = await isBundleMockMode();
      expect(result).toBe(true);
    });

    it("should fallback to environment variable when parameter store fails", async () => {
      // Mock getBooleanParameter to return null (parameter not found)
      mockSend.mockRejectedValue(new Error("Parameter not found"));
      process.env.DIY_SUBMIT_BUNDLE_MOCK = "true";

      const result = await isBundleMockMode();
      expect(result).toBe(true);
    });

    it("should return false when both parameter store and env var are false", async () => {
      mockSend.mockRejectedValue(new Error("Parameter not found"));
      process.env.DIY_SUBMIT_BUNDLE_MOCK = "false";

      const result = await isBundleMockMode();
      expect(result).toBe(false);
    });
  });

  describe("isAuthMockMode", () => {
    it("should return parameter store value when available", async () => {
      mockSend.mockResolvedValue({
        Parameter: { Value: "true" },
      });

      const result = await isAuthMockMode();
      expect(result).toBe(true);
    });

    it("should fallback to environment variable when parameter store fails", async () => {
      // Mock getBooleanParameter to return null (parameter not found)
      mockSend.mockRejectedValue(new Error("Parameter not found"));
      process.env.DIY_SUBMIT_TEST_MOCK_OAUTH2 = "run";

      const result = await isAuthMockMode();
      expect(result).toBe(true);
    });

    it("should return false when both parameter store and env var are false", async () => {
      mockSend.mockRejectedValue(new Error("Parameter not found"));
      process.env.DIY_SUBMIT_TEST_MOCK_OAUTH2 = "off";

      const result = await isAuthMockMode();
      expect(result).toBe(false);
    });
  });

  describe("clearParameterCache", () => {
    it("should clear the cache", async () => {
      // First populate cache
      mockSend.mockResolvedValue({
        Parameter: { Value: "cached-value" },
      });

      await getParameter("/test/param", "fallback");
      expect(__getParameterCache().size).toBe(1);

      // Clear cache
      clearParameterCache();
      expect(__getParameterCache().size).toBe(0);
    });
  });
});
