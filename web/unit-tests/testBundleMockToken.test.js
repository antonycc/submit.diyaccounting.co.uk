// web/unit-tests/testBundleMockToken.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";

describe("Test Bundle Mock Token Logic", () => {
  // Mock storage
  let localStorage;
  let sessionStorage;

  beforeEach(() => {
    // Create simple mock storage
    localStorage = {
      data: {},
      getItem(key) {
        return this.data[key] || null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
      clear() {
        this.data = {};
      },
    };

    sessionStorage = {
      data: {},
      getItem(key) {
        return this.data[key] || null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
      clear() {
        this.data = {};
      },
    };
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  // Shared function implementation to test
  async function checkForTestBundleAndSetMockToken() {
    try {
      const existingToken = sessionStorage.getItem("hmrcAccessToken");
      if (existingToken) {
        return;
      }

      const cognitoToken = localStorage.getItem("cognitoAccessToken");
      if (!cognitoToken) {
        return;
      }

      const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
      const bundles = userInfo.bundles || [];

      const hasTestBundle = bundles.includes("test");

      if (hasTestBundle) {
        sessionStorage.setItem("hmrcAccessToken", "test-mock-token-for-stubbed-api");
      }
    } catch (error) {
      console.error("Error checking for test bundle:", error);
    }
  }

  test("should set mock HMRC token when user has test bundle", async () => {
    // Setup: User with test bundle
    localStorage.setItem("cognitoAccessToken", "test-cognito-token");
    localStorage.setItem(
      "userInfo",
      JSON.stringify({
        sub: "test-user",
        email: "test@example.com",
        bundles: ["test"],
      }),
    );

    // Execute
    await checkForTestBundleAndSetMockToken();

    // Verify
    expect(sessionStorage.getItem("hmrcAccessToken")).toBe("test-mock-token-for-stubbed-api");
  });

  test("should NOT set mock HMRC token when user does not have test bundle", async () => {
    // Setup: User without test bundle
    localStorage.setItem("cognitoAccessToken", "test-cognito-token");
    localStorage.setItem(
      "userInfo",
      JSON.stringify({
        sub: "test-user",
        email: "test@example.com",
        bundles: ["default"],
      }),
    );

    // Execute
    await checkForTestBundleAndSetMockToken();

    // Verify
    expect(sessionStorage.getItem("hmrcAccessToken")).toBeNull();
  });

  test("should NOT overwrite existing HMRC token", async () => {
    // Setup: User with test bundle and existing token
    localStorage.setItem("cognitoAccessToken", "test-cognito-token");
    localStorage.setItem(
      "userInfo",
      JSON.stringify({
        sub: "test-user",
        email: "test@example.com",
        bundles: ["test"],
      }),
    );
    sessionStorage.setItem("hmrcAccessToken", "existing-real-token");

    // Execute
    await checkForTestBundleAndSetMockToken();

    // Verify - should keep existing token
    expect(sessionStorage.getItem("hmrcAccessToken")).toBe("existing-real-token");
  });

  test("should NOT set mock token when no Cognito token exists", async () => {
    // Setup: User with test bundle but no Cognito token
    localStorage.setItem(
      "userInfo",
      JSON.stringify({
        sub: "test-user",
        email: "test@example.com",
        bundles: ["test"],
      }),
    );
    // No cognitoAccessToken set

    // Execute
    await checkForTestBundleAndSetMockToken();

    // Verify
    expect(sessionStorage.getItem("hmrcAccessToken")).toBeNull();
  });
});
