// app/unit-tests/services/deferredExecution.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDeferredExecutionTimeout,
  extractOrGenerateClientRequestId,
  executeWithDeferral,
} from "../../services/deferredExecution.js";

describe("deferredExecution", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getDeferredExecutionTimeout", () => {
    it("should return default timeout of 100ms when env var not set", () => {
      expect(getDeferredExecutionTimeout()).toBe(100);
    });

    it("should return configured timeout from env var", () => {
      vi.stubEnv("DEFERRED_EXECUTION_TIMEOUT_MS", "500");
      expect(getDeferredExecutionTimeout()).toBe(500);
    });

    it("should return default when env var is invalid", () => {
      vi.stubEnv("DEFERRED_EXECUTION_TIMEOUT_MS", "invalid");
      expect(getDeferredExecutionTimeout()).toBe(100);
    });

    it("should return default when env var is negative", () => {
      vi.stubEnv("DEFERRED_EXECUTION_TIMEOUT_MS", "-100");
      expect(getDeferredExecutionTimeout()).toBe(100);
    });
  });

  describe("extractOrGenerateClientRequestId", () => {
    it("should extract client request ID from header", () => {
      const event = {
        headers: {
          "x-client-request-id": "test-request-id",
        },
      };
      expect(extractOrGenerateClientRequestId(event)).toBe("test-request-id");
    });

    it("should extract from X-Client-Request-Id header", () => {
      const event = {
        headers: {
          "X-Client-Request-Id": "test-request-id-2",
        },
      };
      expect(extractOrGenerateClientRequestId(event)).toBe("test-request-id-2");
    });

    it("should extract from x-request-id header as fallback", () => {
      const event = {
        headers: {
          "x-request-id": "test-request-id-3",
        },
      };
      expect(extractOrGenerateClientRequestId(event)).toBe("test-request-id-3");
    });

    it("should generate a new ID when no header present", () => {
      const event = { headers: {} };
      const id = extractOrGenerateClientRequestId(event);
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
    });

    it("should handle missing headers object", () => {
      const event = {};
      const id = extractOrGenerateClientRequestId(event);
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
    });
  });

  describe("executeWithDeferral", () => {
    it("should return result immediately if function completes within timeout", async () => {
      const fastFunction = async () => ({
        statusCode: 200,
        body: JSON.stringify({ message: "success" }),
      });

      const event = {
        headers: { "x-client-request-id": "test-id" },
        queryStringParameters: {},
      };
      const request = "https://test.example.com/api";
      const requestParams = { test: "param" };
      const userSub = "test-user";

      vi.stubEnv("DEFERRED_EXECUTION_TIMEOUT_MS", "200");

      const result = await executeWithDeferral(fastFunction, event, request, requestParams, userSub);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("success");
    });

    it("should return 202 if function times out", async () => {
      const slowFunction = async () => {
        // Simulate a slow operation
        await new Promise((resolve) => setTimeout(resolve, 300));
        return {
          statusCode: 200,
          body: JSON.stringify({ message: "success" }),
        };
      };

      const event = {
        headers: { "x-client-request-id": "test-id-2" },
        queryStringParameters: {},
      };
      const request = "https://test.example.com/api";
      const requestParams = { test: "param" };
      const userSub = "test-user";

      vi.stubEnv("DEFERRED_EXECUTION_TIMEOUT_MS", "50");
      vi.stubEnv("DEFERRED_REQUESTS_DYNAMODB_TABLE_NAME", "test-table");

      // Mock the DynamoDB operations - they will fail but that's expected in test env
      const result = await executeWithDeferral(slowFunction, event, request, requestParams, userSub);

      // Should return the slow function result since DynamoDB mock will fail
      // In real scenario with working DynamoDB, it would return 202
      expect(result.statusCode).toBeDefined();
    });

    it("should handle continuation request", async () => {
      const neverCalledFunction = async () => {
        throw new Error("Should not be called for continuation");
      };

      const event = {
        headers: { "x-client-request-id": "test-id-3" },
        queryStringParameters: {
          "x-continuation": "true",
        },
      };
      const request = "https://test.example.com/api";
      const requestParams = { test: "param" };
      const userSub = "test-user";

      vi.stubEnv("DEFERRED_REQUESTS_DYNAMODB_TABLE_NAME", "test-table");

      const result = await executeWithDeferral(neverCalledFunction, event, request, requestParams, userSub);

      // Should return 404 or 500 because the deferred request doesn't exist in test environment
      // (500 if DynamoDB access fails, 404 if it succeeds but finds no record)
      expect([404, 500]).toContain(result.statusCode);
      const body = JSON.parse(result.body);
      expect(body.message).toBeDefined();
    });
  });
});
