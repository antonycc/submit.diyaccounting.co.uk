// app/unit-tests/bundleEnforcement.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { enforceBundles, BundleEntitlementError, addBundles, removeBundles, BundleAuthorizationError } from "@app/lib/bundleEnforcement.js";
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

function buildEvent(token, authorizerContext = null, urlPath = null) {
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

  if (urlPath) {
    event.requestContext = event.requestContext || {};
    event.requestContext.http = event.requestContext.http || {};
    event.requestContext.http.path = urlPath;
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
    test("should throw BundleAuthorizationError when no authorization token", async () => {
      const event = buildEvent(null);

      await expect(enforceBundles(event)).rejects.toThrow(BundleAuthorizationError);
      await expect(enforceBundles(event)).rejects.toThrow("Missing Authorization Bearer token");
    });

    test("should throw BundleEntitlementError when JWT is invalid", async () => {
      const event = buildEvent("invalid-token");

      await expect(enforceBundles(event)).rejects.toThrow(BundleAuthorizationError);
    });

    test("should allow sandbox access with test bundle", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-test-bundle");
      const authorizerContext = {
        jwt: {
          claims: {
            "sub": "user-with-test-bundle",
            "cognito:username": "test",
            "email": "test@test.submit.diyaccunting.co.uk",
            "scope": "read write",
          },
        },
      };
      const event = buildEvent(token, authorizerContext);

      bundleHelpers.getUserBundles.mockResolvedValue(["test"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-with-test-bundle");
    });

    test("should allow sandbox access with test bundle with expiry", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-test-bundle-expiry");
      const authorizerContext = {
        jwt: {
          claims: {
            "sub": "user-with-test-bundle-expiry",
            "cognito:username": "test",
            "email": "test@test.submit.diyaccunting.co.uk",
            "scope": "read write",
          },
        },
      };
      const event = buildEvent(token, authorizerContext);

      bundleHelpers.getUserBundles.mockResolvedValue(["test|EXPIRY=2025-12-31"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-with-test-bundle-expiry");
    });

    test("should deny vat return access without test or guest bundle", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const token = makeJWT("user-without-bundle");
      const authorizerContext = {
        jwt: {
          claims: {
            "sub": "user-without-bundle",
            "cognito:username": "test",
            "email": "test@test.submit.diyaccunting.co.uk",
            "scope": "read write",
          },
        },
      };
      const hmrcVatReturnGetUrlPath = "/api/v1/hmrc/vat/return";
      const event = buildEvent(token, authorizerContext, hmrcVatReturnGetUrlPath);

      bundleHelpers.getUserBundles.mockResolvedValue([]);

      await expect(enforceBundles(event)).rejects.toThrow(BundleEntitlementError);
    });

    test("should allow production access with guest bundle", async () => {
      process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-prod-bundle");
      const authorizerContext = {
        jwt: {
          claims: {
            "sub": "user-with-prod-bundle",
            "cognito:username": "test",
            "email": "test@test.submit.diyaccunting.co.uk",
            "scope": "read write",
          },
        },
      };
      const event = buildEvent(token, authorizerContext);

      bundleHelpers.getUserBundles.mockResolvedValue(["guest"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-with-prod-bundle");
    });

    test("should allow production access with business bundle", async () => {
      process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-legacy-bundle");
      const authorizerContext = {
        jwt: {
          claims: {
            "sub": "user-with-legacy-bundle",
            "cognito:username": "test",
            "email": "test@test.submit.diyaccunting.co.uk",
            "scope": "read write",
          },
        },
      };
      const event = buildEvent(token, authorizerContext);

      bundleHelpers.getUserBundles.mockResolvedValue(["business"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-with-legacy-bundle");
    });

    test("should allow production access with guest bundle with expiry", async () => {
      process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
      const token = makeJWT("user-with-prod-bundle-expiry");
      const authorizerContext = {
        jwt: {
          claims: {
            "sub": "user-with-prod-bundle-expiry",
            "cognito:username": "test",
            "email": "test@test.submit.diyaccunting.co.uk",
            "scope": "read write",
          },
        },
      };
      const event = buildEvent(token, authorizerContext);

      bundleHelpers.getUserBundles.mockResolvedValue(["guest|EXPIRY=2025-12-31"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-with-prod-bundle-expiry");
    });

    test("should extract user info from authorizer context", async () => {
      process.env.HMRC_BASE_URI = "https://test-api.service.hmrc.gov.uk";
      const authorizerContext = {
        sub: "user-from-authorizer",
        username: "testuser",
      };
      const event = buildEvent(null, authorizerContext);

      bundleHelpers.getUserBundles.mockResolvedValue(["test"]);

      // Should not throw
      await enforceBundles(event);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-from-authorizer");
    });
  });

  describe("addBundles", () => {
    test("should add new bundles to user", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["EXISTING_BUNDLE"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await addBundles("user-1", ["NEW_BUNDLE"]);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-1");
      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", ["EXISTING_BUNDLE", "NEW_BUNDLE"]);
      expect(result).toEqual(["EXISTING_BUNDLE", "NEW_BUNDLE"]);
    });

    test("should not add duplicate bundles", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["EXISTING_BUNDLE"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await addBundles("user-1", ["EXISTING_BUNDLE"]);

      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", ["EXISTING_BUNDLE"]);
      expect(result).toEqual(["EXISTING_BUNDLE"]);
    });

    test("should add multiple bundles at once", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue([]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await addBundles("user-1", ["BUNDLE_1", "BUNDLE_2", "BUNDLE_3"]);

      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", ["BUNDLE_1", "BUNDLE_2", "BUNDLE_3"]);
      expect(result).toEqual(["BUNDLE_1", "BUNDLE_2", "BUNDLE_3"]);
    });
  });

  describe("removeBundles", () => {
    test("should remove bundles from user", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["BUNDLE_1", "BUNDLE_2", "BUNDLE_3"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await removeBundles("user-1", ["BUNDLE_2"]);

      expect(bundleHelpers.getUserBundles).toHaveBeenCalledWith("user-1");
      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", ["BUNDLE_1", "BUNDLE_3"]);
      expect(result).toEqual(["BUNDLE_1", "BUNDLE_3"]);
    });

    test("should remove bundles with expiry suffix", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["BUNDLE_1|EXPIRY=2025-12-31", "BUNDLE_2"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await removeBundles("user-1", ["BUNDLE_1"]);

      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", ["BUNDLE_2"]);
      expect(result).toEqual(["BUNDLE_2"]);
    });

    test("should remove multiple bundles at once", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["BUNDLE_1", "BUNDLE_2", "BUNDLE_3", "BUNDLE_4"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await removeBundles("user-1", ["BUNDLE_1", "BUNDLE_3"]);

      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", ["BUNDLE_2", "BUNDLE_4"]);
      expect(result).toEqual(["BUNDLE_2", "BUNDLE_4"]);
    });

    test("should handle removing non-existent bundles gracefully", async () => {
      bundleHelpers.getUserBundles.mockResolvedValue(["BUNDLE_1"]);
      bundleHelpers.updateUserBundles.mockResolvedValue();

      const result = await removeBundles("user-1", ["NONEXISTENT"]);

      expect(bundleHelpers.updateUserBundles).toHaveBeenCalledWith("user-1", ["BUNDLE_1"]);
      expect(result).toEqual(["BUNDLE_1"]);
    });
  });
});
