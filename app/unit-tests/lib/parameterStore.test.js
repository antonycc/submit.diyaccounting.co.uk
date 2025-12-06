// app/unit-tests/lib/parameterStore.test.js
// Tests for Parameter Store utility

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { getParameter, getSecret, clearCache, getCacheStats } from "../../lib/parameterStore.js";

const ssmMock = mockClient(SSMClient);

describe("Parameter Store", () => {
  beforeEach(() => {
    ssmMock.reset();
    clearCache(); // Clear cache between tests
  });

  it("should retrieve a parameter from SSM", async () => {
    const testValue = "test-secret-value";
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: "/test/param",
        Value: testValue,
      },
    });

    const result = await getParameter("/test/param");
    expect(result).toBe(testValue);
  });

  it("should cache parameter values", async () => {
    const testValue = "cached-value";
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: "/test/cached",
        Value: testValue,
      },
    });

    // First call should hit SSM
    const result1 = await getParameter("/test/cached");
    expect(result1).toBe(testValue);

    // Second call should use cache
    const result2 = await getParameter("/test/cached");
    expect(result2).toBe(testValue);

    // SSM should only be called once
    expect(ssmMock.calls()).toHaveLength(1);
  });

  it("should force refresh when requested", async () => {
    const testValue1 = "value-1";
    const testValue2 = "value-2";

    ssmMock
      .on(GetParameterCommand)
      .resolvesOnce({
        Parameter: {
          Name: "/test/refresh",
          Value: testValue1,
        },
      })
      .resolvesOnce({
        Parameter: {
          Name: "/test/refresh",
          Value: testValue2,
        },
      });

    // First call
    const result1 = await getParameter("/test/refresh");
    expect(result1).toBe(testValue1);

    // Second call with force refresh
    const result2 = await getParameter("/test/refresh", { forceRefresh: true });
    expect(result2).toBe(testValue2);

    // SSM should be called twice
    expect(ssmMock.calls()).toHaveLength(2);
  });

  it("should throw error if parameter not found", async () => {
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {},
    });

    await expect(getParameter("/test/notfound")).rejects.toThrow("not found or has no value");
  });

  it("should work with getSecret alias", async () => {
    const testSecret = "super-secret";
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: "/test/secret",
        Value: testSecret,
      },
    });

    const result = await getSecret("/test/secret");
    expect(result).toBe(testSecret);
  });

  it("should clear cache for specific parameter", async () => {
    const testValue = "test-value";
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: "/test/clear",
        Value: testValue,
      },
    });

    // First call
    await getParameter("/test/clear");
    expect(ssmMock.calls()).toHaveLength(1);

    // Clear cache for this parameter
    clearCache("/test/clear");

    // Next call should hit SSM again
    await getParameter("/test/clear");
    expect(ssmMock.calls()).toHaveLength(2);
  });

  it("should return cache statistics", async () => {
    const testValue = "test-value";
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: "/test/stats",
        Value: testValue,
      },
    });

    // Initially empty
    let stats = getCacheStats();
    expect(stats.size).toBe(0);

    // Add a parameter
    await getParameter("/test/stats");

    stats = getCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.keys).toContain("/test/stats");
  });
});
