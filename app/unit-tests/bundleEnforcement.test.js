// app/unit-tests/bundleEnforcement.test.js
import { describe, test, expect, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { getBundlesStore } from "@app/functions/non-lambda-mocks/mockBundleStore.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock the bundleHelpers module
vi.mock("@app/lib/bundleHelpers.js", () => ({
  getUserBundles: vi.fn(),
  updateUserBundles: vi.fn(),
  isMockMode: vi.fn(() => true), // Always return true for tests
}));

// Import after mocking
import { enforceBundles, addBundles, removeBundles } from "@app/lib/bundleEnforcement.js";
import { getUserBundles, updateUserBundles } from "@app/lib/bundleHelpers.js";

const mockBundleStore = getBundlesStore();

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  // Using simple replace operations, not vulnerable to backtracking
  const base64 = Buffer.from(json).toString("base64");
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeIdToken(sub = "user-1", extra = {}) {
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

function buildEvent(token, headers = {}) {
  return {
    headers: token ? { Authorization: `Bearer ${token}`, ...headers } : headers,
  };
}

describe("bundleEnforcement.js - enforceBundles", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DIY_SUBMIT_ENFORCE_BUNDLES: "true",
      COGNITO_USER_POOL_ID: "test-pool-id",
      HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      TEST_BUNDLE_MOCK: "true",
    };
    vi.clearAllMocks();
    mockBundleStore.clear();
  });

  test("should pass when user has required sandbox bundle", async () => {
    const token = makeIdToken("user-with-test-api");
    const event = buildEvent(token);

    // Set up mock bundles for this user
    mockBundleStore.set("user-with-test-api", ["HMRC_TEST_API|EXPIRY=2025-12-31"]);

    const result = await enforceBundles(event, {
      hmrcBaseUri: "https://test-api.service.hmrc.gov.uk",
      userPoolId: "test-pool-id",
      sandboxBundles: ["HMRC_TEST_API"],
      productionBundles: ["HMRC_PROD_SUBMIT"],
    });

    expect(result.enforced).toBe(true);
    expect(result.userSub).toBe("user-with-test-api");
    expect(result.environment).toBe("sandbox");
  });

  test("should throw when user missing required sandbox bundle", async () => {
    const token = makeIdToken("user-without-bundle");
    const event = buildEvent(token);

    // User has no bundles
    mockBundleStore.set("user-without-bundle", []);

    await expect(
      enforceBundles(event, {
        hmrcBaseUri: "https://test-api.service.hmrc.gov.uk",
        userPoolId: "test-pool-id",
        sandboxBundles: ["HMRC_TEST_API"],
        productionBundles: ["HMRC_PROD_SUBMIT"],
      }),
    ).rejects.toThrow(/Forbidden.*sandbox.*HMRC_TEST_API/);
  });

  test("should throw MISSING_AUTHORIZATION when no token present", async () => {
    const event = buildEvent(null);

    try {
      await enforceBundles(event, {
        hmrcBaseUri: "https://api.service.hmrc.gov.uk",
        userPoolId: "test-pool-id",
        sandboxBundles: ["HMRC_TEST_API"],
        productionBundles: ["HMRC_PROD_SUBMIT"],
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error.code).toBe("MISSING_AUTHORIZATION");
      expect(error.message).toContain("Missing Authorization Bearer token");
    }
  });

  test("should skip enforcement when DIY_SUBMIT_ENFORCE_BUNDLES is false", async () => {
    process.env.DIY_SUBMIT_ENFORCE_BUNDLES = "false";
    const token = makeIdToken("any-user");
    const event = buildEvent(token);

    const result = await enforceBundles(event, {
      hmrcBaseUri: "https://api.service.hmrc.gov.uk",
      userPoolId: "test-pool-id",
      sandboxBundles: ["HMRC_TEST_API"],
      productionBundles: ["HMRC_PROD_SUBMIT"],
    });

    expect(result.enforced).toBe(false);
  });

  test("should extract user from authorizer context", async () => {
    const event = {
      headers: {},
      requestContext: {
        authorizer: {
          lambda: {
            jwt: {
              claims: {
                sub: "user-from-authorizer",
                email: "user@example.com",
              },
            },
          },
        },
      },
    };

    // Set up mock bundles
    mockBundleStore.set("user-from-authorizer", ["HMRC_TEST_API"]);

    const result = await enforceBundles(event, {
      hmrcBaseUri: "https://test-api.service.hmrc.gov.uk",
      userPoolId: "test-pool-id",
      sandboxBundles: ["HMRC_TEST_API"],
      productionBundles: ["HMRC_PROD_SUBMIT"],
    });

    expect(result.userSub).toBe("user-from-authorizer");
  });

  test("should distinguish between sandbox and production environments", async () => {
    const token = makeIdToken("prod-user");
    const event = buildEvent(token);

    // Set up production bundle
    mockBundleStore.set("prod-user", ["HMRC_PROD_SUBMIT|EXPIRY="]);

    const result = await enforceBundles(event, {
      hmrcBaseUri: "https://api.service.hmrc.gov.uk", // production URL
      userPoolId: "test-pool-id",
      sandboxBundles: ["HMRC_TEST_API"],
      productionBundles: ["HMRC_PROD_SUBMIT", "LEGACY_ENTITLEMENT"],
    });

    expect(result.environment).toBe("production");
  });

  test("should include diagnostic details in BUNDLE_FORBIDDEN error", async () => {
    const token = makeIdToken("user-without-prod");
    const event = buildEvent(token);

    // User has only test bundle
    mockBundleStore.set("user-without-prod", ["HMRC_TEST_API"]);

    try {
      await enforceBundles(event, {
        hmrcBaseUri: "https://api.service.hmrc.gov.uk",
        userPoolId: "test-pool-id",
        sandboxBundles: ["HMRC_TEST_API"],
        productionBundles: ["HMRC_PROD_SUBMIT"],
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error.code).toBe("BUNDLE_FORBIDDEN");
      expect(error.details).toBeDefined();
      expect(error.details.environment).toBe("production");
      expect(error.details.requiredBundles).toEqual(["HMRC_PROD_SUBMIT"]);
      expect(error.details.currentBundles).toEqual(["HMRC_TEST_API"]);
      expect(error.details.userSub).toBe("user-without-prod");
    }
  });

  test("should accept LEGACY_ENTITLEMENT for production", async () => {
    const token = makeIdToken("legacy-user");
    const event = buildEvent(token);

    mockBundleStore.set("legacy-user", ["LEGACY_ENTITLEMENT|EXPIRY=2025-12-31"]);

    const result = await enforceBundles(event, {
      hmrcBaseUri: "https://api.service.hmrc.gov.uk",
      userPoolId: "test-pool-id",
      sandboxBundles: ["HMRC_TEST_API"],
      productionBundles: ["HMRC_PROD_SUBMIT", "LEGACY_ENTITLEMENT"],
    });

    expect(result.enforced).toBe(true);
    expect(result.environment).toBe("production");
  });

  test("should extract token from X-Authorization header", async () => {
    const token = makeIdToken("x-auth-user");
    const event = {
      headers: {
        "X-Authorization": `Bearer ${token}`,
      },
    };

    mockBundleStore.set("x-auth-user", ["HMRC_TEST_API"]);

    const result = await enforceBundles(event, {
      hmrcBaseUri: "https://test-api.service.hmrc.gov.uk",
      userPoolId: "test-pool-id",
      sandboxBundles: ["HMRC_TEST_API"],
      productionBundles: ["HMRC_PROD_SUBMIT"],
    });

    expect(result.userSub).toBe("x-auth-user");
  });
});

describe("bundleEnforcement.js - addBundles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should add new bundles to user", async () => {
    getUserBundles.mockResolvedValue(["EXISTING_BUNDLE"]);
    updateUserBundles.mockResolvedValue(undefined);

    const result = await addBundles("user-1", "pool-1", ["NEW_BUNDLE"]);

    expect(getUserBundles).toHaveBeenCalledWith("user-1", "pool-1");
    expect(updateUserBundles).toHaveBeenCalledWith("user-1", "pool-1", ["EXISTING_BUNDLE", "NEW_BUNDLE"]);
    expect(result).toEqual(["EXISTING_BUNDLE", "NEW_BUNDLE"]);
  });

  test("should not add duplicate bundles", async () => {
    getUserBundles.mockResolvedValue(["BUNDLE_A", "BUNDLE_B|EXPIRY=2025-12-31"]);
    updateUserBundles.mockResolvedValue(undefined);

    const result = await addBundles("user-1", "pool-1", ["BUNDLE_B", "BUNDLE_C"]);

    expect(updateUserBundles).toHaveBeenCalledWith("user-1", "pool-1", ["BUNDLE_A", "BUNDLE_B|EXPIRY=2025-12-31", "BUNDLE_C"]);
    expect(result).toEqual(["BUNDLE_A", "BUNDLE_B|EXPIRY=2025-12-31", "BUNDLE_C"]);
  });

  test("should add multiple bundles at once", async () => {
    getUserBundles.mockResolvedValue([]);
    updateUserBundles.mockResolvedValue(undefined);

    const result = await addBundles("user-1", "pool-1", ["BUNDLE_A", "BUNDLE_B", "BUNDLE_C"]);

    expect(updateUserBundles).toHaveBeenCalledWith("user-1", "pool-1", ["BUNDLE_A", "BUNDLE_B", "BUNDLE_C"]);
    expect(result).toEqual(["BUNDLE_A", "BUNDLE_B", "BUNDLE_C"]);
  });
});

describe("bundleEnforcement.js - removeBundles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should remove specified bundles from user", async () => {
    getUserBundles.mockResolvedValue(["BUNDLE_A", "BUNDLE_B|EXPIRY=2025-12-31", "BUNDLE_C"]);
    updateUserBundles.mockResolvedValue(undefined);

    const result = await removeBundles("user-1", "pool-1", ["BUNDLE_B"]);

    expect(getUserBundles).toHaveBeenCalledWith("user-1", "pool-1");
    expect(updateUserBundles).toHaveBeenCalledWith("user-1", "pool-1", ["BUNDLE_A", "BUNDLE_C"]);
    expect(result).toEqual(["BUNDLE_A", "BUNDLE_C"]);
  });

  test("should remove bundles with metadata suffix", async () => {
    getUserBundles.mockResolvedValue(["BUNDLE_A|EXPIRY=2025-12-31", "BUNDLE_B"]);
    updateUserBundles.mockResolvedValue(undefined);

    const result = await removeBundles("user-1", "pool-1", ["BUNDLE_A"]);

    expect(updateUserBundles).toHaveBeenCalledWith("user-1", "pool-1", ["BUNDLE_B"]);
    expect(result).toEqual(["BUNDLE_B"]);
  });

  test("should remove multiple bundles at once", async () => {
    getUserBundles.mockResolvedValue(["BUNDLE_A", "BUNDLE_B", "BUNDLE_C", "BUNDLE_D"]);
    updateUserBundles.mockResolvedValue(undefined);

    const result = await removeBundles("user-1", "pool-1", ["BUNDLE_A", "BUNDLE_C"]);

    expect(updateUserBundles).toHaveBeenCalledWith("user-1", "pool-1", ["BUNDLE_B", "BUNDLE_D"]);
    expect(result).toEqual(["BUNDLE_B", "BUNDLE_D"]);
  });

  test("should handle removing non-existent bundles gracefully", async () => {
    getUserBundles.mockResolvedValue(["BUNDLE_A", "BUNDLE_B"]);
    updateUserBundles.mockResolvedValue(undefined);

    const result = await removeBundles("user-1", "pool-1", ["BUNDLE_X", "BUNDLE_Y"]);

    expect(updateUserBundles).toHaveBeenCalledWith("user-1", "pool-1", ["BUNDLE_A", "BUNDLE_B"]);
    expect(result).toEqual(["BUNDLE_A", "BUNDLE_B"]);
  });

  test("should remove all bundles when all are specified", async () => {
    getUserBundles.mockResolvedValue(["BUNDLE_A", "BUNDLE_B"]);
    updateUserBundles.mockResolvedValue(undefined);

    const result = await removeBundles("user-1", "pool-1", ["BUNDLE_A", "BUNDLE_B"]);

    expect(updateUserBundles).toHaveBeenCalledWith("user-1", "pool-1", []);
    expect(result).toEqual([]);
  });
});
