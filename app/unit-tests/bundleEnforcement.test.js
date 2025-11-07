// app/unit-tests/bundleEnforcement.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { enforceBundles, BundleEntitlementError, addBundles, removeBundles } from "@app/lib/bundleEnforcement.js";
import * as bundleHelpers from "@app/lib/bundleHelpers.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock the bundleHelpers module
vi.mock("@app/lib/bundleHelpers.js", () => ({
  getUserBundles: vi.fn(),
  updateUserBundles: vi.fn(),
  isMockMode: vi.fn(() => true),
}));

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJWT(sub = "user-123", extra = {}) {
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    sub,
    email: `${sub}@example.com`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  };
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.`;
}

function buildEvent(token, authorizerContext = null) {
  const event = {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };

  if (authorizerContext) {
    event.requestContext = {
      authorizer: {
        lambda: authorizerContext,
      },
    };
  }

  return event;
}

describe("bundleEnforcement.js", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      DIY_SUBMIT_ENFORCE_BUNDLES: "true",
      COGNITO_USER_POOL_ID: "test-pool-id",
      HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
    };
  });

  describe("enforceBundles", () => {
    test("should skip enforcement when disabled", async () => {
      process.env.DIY_SUBMIT_ENFORCE_BUNDLES = "false";
      const token = makeJWT("user-1");
      const event = buildEvent(token);

      // Should not throw
      await enforceBundles(event);

      // getUserBundles should not be called
      expect(bundleHelpers.getUserBundles).not.toHaveBeenCalled();
    });

    test("should skip enforcement when userPoolId is not configured", async () => {
      delete process.env.COGNITO_USER_POOL_ID;
      const token = makeJWT("user-1");
      const event = buildEvent(token);

      // Should not throw
      await enforceBundles(event);

      // getUserBundles should not be called
      expect(bundleHelpers.getUserBundles).not.toHaveBeenCalled();
    });

    test("should throw BundleEntitlementError when no authorization token", async () => {
      const event = buildEvent(null);

      await expect(enforceBundles(event)).rejects.toThrow(BundleEntitlementError);
      await expect(enforceBundles(event)).rejects.toThrow("Missing Authorization Bearer token");
    });

    test("should throw BundleEntitlementError when JWT is invalid", async () => {
      const event = buildEvent("invalid-token");

      await expect(enforceBundles(event)).rejects.toThrow(BundleEntitlementError);
    });

    test("should allow sandbox access with HMRC_TEST_API bundle", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-test-bundle");
      const event = buildEvent(token);

      bundleHelpers.getUserBundles.mockResolvedValue(["HMRC_TEST_API"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-with-test-bundle", "test-pool-id");
    });

    test("should allow sandbox access with HMRC_TEST_API bundle with expiry", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-test-bundle-expiry");
      const event = buildEvent(token);

      bundleHelpers.getUserBundles.mockResolvedValue(["HMRC_TEST_API|EXPIRY=2025-12-31"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-with-test-bundle-expiry", "test-pool-id");
    });

    test("should deny sandbox access without HMRC_TEST_API bundle", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const token = makeJWT("user-without-bundle");
      const event = buildEvent(token);

      bundleHelpers.getUserBundles.mockResolvedValue([]);

      await expect(enforceBundles(event)).rejects.toThrow(BundleEntitlementError);
      await expect(enforceBundles(event)).rejects.toThrow("Forbidden: HMRC Sandbox submission requires HMRC_TEST_API bundle");
    });

    test("should allow production access with HMRC_PROD_SUBMIT bundle", async () => {
      process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-prod-bundle");
      const event = buildEvent(token);

      bundleHelpers.getUserBundles.mockResolvedValue(["HMRC_PROD_SUBMIT"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-with-prod-bundle", "test-pool-id");
    });

    test("should allow production access with LEGACY_ENTITLEMENT bundle", async () => {
      process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-legacy-bundle");
      const event = buildEvent(token);

      bundleHelpers.getUserBundles.mockResolvedValue(["LEGACY_ENTITLEMENT"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-with-legacy-bundle", "test-pool-id");
    });

    test("should allow production access with HMRC_PROD_SUBMIT bundle with expiry", async () => {
      process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-prod-bundle-expiry");
      const event = buildEvent(token);

      bundleHelpers.getUserBundles.mockResolvedValue(["HMRC_PROD_SUBMIT|EXPIRY=2025-12-31"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-with-prod-bundle-expiry", "test-pool-id");
    });

    test("should deny production access without required bundles", async () => {
      process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
      const token = makeJWT("user-without-prod-bundle");
      const event = buildEvent(token);

      bundleHelpers.getUserBundles.mockResolvedValue(["SOME_OTHER_BUNDLE"]);

      await expect(enforceBundles(event)).rejects.toThrow(BundleEntitlementError);
      await expect(enforceBundles(event)).rejects.toThrow("Production submission requires HMRC_PROD_SUBMIT or LEGACY_ENTITLEMENT bundle");
    });

    test("should extract user info from authorizer context", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const authorizerContext = {
        sub: "user-from-authorizer",
        username: "testuser",
      };
      const event = buildEvent(null, authorizerContext);

      bundleHelpers.getUserBundles.mockResolvedValue(["HMRC_TEST_API"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-from-authorizer", "test-pool-id");
    });

    test("should include detailed error information in BundleEntitlementError", async () => {
      process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
      const token = makeJWT("user-error-details");
      const event = buildEvent(token);

      bundleHelpers.getUserBundles.mockResolvedValue(["WRONG_BUNDLE"]);

      try {
        await enforceBundles(event);
        expect.fail("Should have thrown BundleEntitlementError");
      } catch (error) {
        expect(error).toBeInstanceOf(BundleEntitlementError);
        expect(error.details).toHaveProperty("code", "BUNDLE_FORBIDDEN");
        expect(error.details).toHaveProperty("requiredBundle");
        expect(error.details).toHaveProperty("currentBundles");
        expect(error.details).toHaveProperty("environment", "production");
        expect(error.details).toHaveProperty("userSub", "user-error-details");
        expect(error.details).toHaveProperty("claims");
        expect(error.details).toHaveProperty("customBundlesAttribute");
      }
    });
  });

  describe("addBundles", () => {
    test("should add new bundles to user", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["EXISTING_BUNDLE"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await addBundles("user-1", "test-pool-id", ["NEW_BUNDLE"]);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-1", "test-pool-id");
      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", "test-pool-id", ["EXISTING_BUNDLE", "NEW_BUNDLE"]);
      expect(result).toEqual(["EXISTING_BUNDLE", "NEW_BUNDLE"]);
    });

    test("should not add duplicate bundles", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["EXISTING_BUNDLE"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await addBundles("user-1", "test-pool-id", ["EXISTING_BUNDLE"]);

      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", "test-pool-id", ["EXISTING_BUNDLE"]);
      expect(result).toEqual(["EXISTING_BUNDLE"]);
    });

    test("should add multiple bundles at once", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue([]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await addBundles("user-1", "test-pool-id", ["BUNDLE_1", "BUNDLE_2", "BUNDLE_3"]);

      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", "test-pool-id", ["BUNDLE_1", "BUNDLE_2", "BUNDLE_3"]);
      expect(result).toEqual(["BUNDLE_1", "BUNDLE_2", "BUNDLE_3"]);
    });
  });

  describe("removeBundles", () => {
    test("should remove bundles from user", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["BUNDLE_1", "BUNDLE_2", "BUNDLE_3"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await removeBundles("user-1", "test-pool-id", ["BUNDLE_2"]);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-1", "test-pool-id");
      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", "test-pool-id", ["BUNDLE_1", "BUNDLE_3"]);
      expect(result).toEqual(["BUNDLE_1", "BUNDLE_3"]);
    });

    test("should remove bundles with expiry suffix", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["BUNDLE_1|EXPIRY=2025-12-31", "BUNDLE_2"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await removeBundles("user-1", "test-pool-id", ["BUNDLE_1"]);

      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", "test-pool-id", ["BUNDLE_2"]);
      expect(result).toEqual(["BUNDLE_2"]);
    });

    test("should remove multiple bundles at once", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["BUNDLE_1", "BUNDLE_2", "BUNDLE_3", "BUNDLE_4"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await removeBundles("user-1", "test-pool-id", ["BUNDLE_1", "BUNDLE_3"]);

      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", "test-pool-id", ["BUNDLE_2", "BUNDLE_4"]);
      expect(result).toEqual(["BUNDLE_2", "BUNDLE_4"]);
    });

    test("should handle removing non-existent bundles gracefully", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["BUNDLE_1"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await removeBundles("user-1", "test-pool-id", ["NONEXISTENT"]);

      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", "test-pool-id", ["BUNDLE_1"]);
      expect(result).toEqual(["BUNDLE_1"]);
    });
  });
});
