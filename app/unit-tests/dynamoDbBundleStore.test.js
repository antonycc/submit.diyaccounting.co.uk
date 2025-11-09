// app/unit-tests/dynamoDbBundleStore.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import * as dynamoDbBundleStore from "@app/lib/dynamoDbBundleStore.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("dynamoDbBundleStore.js", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  describe("isDynamoDbEnabled", () => {
    test("should return false when BUNDLE_DYNAMODB_TABLE_NAME is not set", () => {
      delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;
      expect(dynamoDbBundleStore.isDynamoDbEnabled()).toBe(false);
    });

    test("should return true when BUNDLE_DYNAMODB_TABLE_NAME is set", () => {
      process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-table";
      expect(dynamoDbBundleStore.isDynamoDbEnabled()).toBe(true);
    });
  });

  describe("putBundle", () => {
    test("should skip operation when DynamoDB is not enabled", async () => {
      delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;
      // Should not throw
      await dynamoDbBundleStore.putBundle("user-123", "TEST_BUNDLE|EXPIRY=2025-12-31");
    });
  });

  describe("deleteBundle", () => {
    test("should skip operation when DynamoDB is not enabled", async () => {
      delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;
      // Should not throw
      await dynamoDbBundleStore.deleteBundle("user-123", "TEST_BUNDLE");
    });
  });

  describe("deleteAllBundles", () => {
    test("should skip operation when DynamoDB is not enabled", async () => {
      delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;
      // Should not throw
      await dynamoDbBundleStore.deleteAllBundles("user-123");
    });
  });

  describe("getUserBundles", () => {
    test("should return empty array when DynamoDB is not enabled", async () => {
      delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;
      const bundles = await dynamoDbBundleStore.getUserBundles("user-123");
      expect(bundles).toEqual([]);
    });
  });
});
