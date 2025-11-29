// app/unit-tests/app-lib/circuitBreaker.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fetchWithCircuitBreaker,
  CircuitBreakerOpenError,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
} from "../../lib/circuitBreaker.js";

describe("Circuit Breaker", () => {
  beforeEach(() => {
    // Clear environment to disable circuit breaker for most tests
    delete process.env.CIRCUIT_BREAKER_TABLE_NAME;
    vi.clearAllMocks();
  });

  describe("fetchWithCircuitBreaker when circuit breaker is disabled", () => {
    it("should pass through to fetch when CIRCUIT_BREAKER_TABLE_NAME is not set", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ success: true }),
      });

      const response = await fetchWithCircuitBreaker("https://example.com/api");

      expect(global.fetch).toHaveBeenCalledWith("https://example.com/api", {});
      expect(response.status).toBe(200);
    });

    it("should pass through options to fetch", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ success: true }),
      });

      const options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "data" }),
      };

      await fetchWithCircuitBreaker("https://example.com/api", options);

      expect(global.fetch).toHaveBeenCalledWith("https://example.com/api", options);
    });

    it("should propagate fetch errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await expect(fetchWithCircuitBreaker("https://example.com/api")).rejects.toThrow("Network error");
    });
  });

  describe("CircuitBreakerOpenError", () => {
    it("should create error with correct properties", () => {
      const state = { state: "OPEN", failureCount: 5 };
      const error = new CircuitBreakerOpenError("example.com", state);

      expect(error.name).toBe("CircuitBreakerOpenError");
      expect(error.hostName).toBe("example.com");
      expect(error.circuitBreakerState).toEqual(state);
      expect(error.message).toContain("example.com");
      expect(error.message).toContain("OPEN");
    });
  });

  describe("getCircuitBreakerStatus", () => {
    it("should return null when circuit breaker is disabled", async () => {
      const status = await getCircuitBreakerStatus("example.com");
      expect(status).toBeNull();
    });
  });

  describe("resetCircuitBreaker", () => {
    it("should return initial state when circuit breaker is disabled", async () => {
      const result = await resetCircuitBreaker("example.com");
      expect(result).toMatchObject({
        hostName: "example.com",
        state: "CLOSED",
        failureCount: 0,
        successCount: 0,
      });
    });
  });

  describe("URL parsing", () => {
    it("should handle various URL formats", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ success: true }),
      });

      const urls = [
        "https://example.com/api",
        "https://api.example.com/v1/users",
        "http://localhost:3000/test",
        "https://subdomain.example.co.uk/path?query=value",
      ];

      for (const url of urls) {
        await fetchWithCircuitBreaker(url);
        expect(global.fetch).toHaveBeenCalledWith(url, {});
      }
    });

    it("should handle malformed URLs gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to parse URL"));

      // Should still pass through to fetch even with invalid URL
      await expect(fetchWithCircuitBreaker("not-a-url")).rejects.toThrow("Failed to parse URL");
      expect(global.fetch).toHaveBeenCalledWith("not-a-url", {});
    });
  });

  describe("HTTP status handling", () => {
    it("should handle successful responses (2xx)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ success: true }),
      });

      const response = await fetchWithCircuitBreaker("https://example.com/api");
      expect(response.status).toBe(200);
    });

    it("should handle 4xx client errors", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 404,
        json: async () => ({ error: "Not found" }),
      });

      const response = await fetchWithCircuitBreaker("https://example.com/api");
      expect(response.status).toBe(404);
    });

    it("should handle 5xx server errors", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      const response = await fetchWithCircuitBreaker("https://example.com/api");
      expect(response.status).toBe(500);
    });

    it("should handle 429 rate limit errors", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 429,
        json: async () => ({ error: "Too many requests" }),
      });

      const response = await fetchWithCircuitBreaker("https://example.com/api");
      expect(response.status).toBe(429);
    });
  });
});
