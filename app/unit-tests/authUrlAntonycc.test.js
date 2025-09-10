// app/unit-tests/authUrlAntonycc.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { httpGetAntonycc as authUrlAntonyccHandler } from "@app/functions/authUrl.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

describe("httpGetAntonycc", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("should return auth URL with correct base URI format", async () => {
    // Set environment variables for this test
    process.env.DIY_SUBMIT_HOME_URL = "https://test.example.com/";
    process.env.DIY_SUBMIT_ANTONYCC_CLIENT_ID = "test-client-id";
    process.env.DIY_SUBMIT_ANTONYCC_BASE_URI = "https://oidc.antonycc.com/";

    const event = {
      queryStringParameters: {
        state: "test-state-123",
      },
    };

    const result = await authUrlAntonyccHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.authUrl).toContain("https://oidc.antonycc.com/loginDirect.html");
    expect(body.authUrl).toContain("response_type=code");
    expect(body.authUrl).toContain("client_id=test-client-id");
    expect(body.authUrl).toContain(
      "redirect_uri=https%3A%2F%2Ftest.example.com%2Fauth%2FloginWithAntonyccCallback.html",
    );
    expect(body.authUrl).toContain("scope=openid%20profile%20email");
    expect(body.authUrl).toContain("state=test-state-123");
  });

  test("should work correctly with base URI without trailing slash", async () => {
    // Test current behavior (without trailing slash)
    process.env.DIY_SUBMIT_HOME_URL = "https://test.example.com/";
    process.env.DIY_SUBMIT_ANTONYCC_CLIENT_ID = "test-client-id";
    process.env.DIY_SUBMIT_ANTONYCC_BASE_URI = "https://oidc.antonycc.com";

    const event = {
      queryStringParameters: {
        state: "test-state-456",
      },
    };

    const result = await authUrlAntonyccHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    // Should still work - the code adds the slash
    expect(body.authUrl).toContain("https://oidc.antonycc.com/loginDirect.html");
  });

  test("should work correctly with base URI with trailing slash", async () => {
    // Test expected behavior (with trailing slash)
    process.env.DIY_SUBMIT_HOME_URL = "https://test.example.com/";
    process.env.DIY_SUBMIT_ANTONYCC_CLIENT_ID = "test-client-id";
    process.env.DIY_SUBMIT_ANTONYCC_BASE_URI = "https://oidc.antonycc.com/";

    const event = {
      queryStringParameters: {
        state: "test-state-789",
      },
    };

    const result = await authUrlAntonyccHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    // Should still work correctly with trailing slash
    expect(body.authUrl).toContain("https://oidc.antonycc.com/loginDirect.html");
    // Should not have double slash
    expect(body.authUrl).not.toContain("https://oidc.antonycc.com//loginDirect.html");
  });

  test("should return 400 when state is missing", async () => {
    process.env.DIY_SUBMIT_HOME_URL = "https://test.example.com/";
    process.env.DIY_SUBMIT_ANTONYCC_CLIENT_ID = "test-client-id";
    process.env.DIY_SUBMIT_ANTONYCC_BASE_URI = "https://oidc.antonycc.com/";

    const event = {
      queryStringParameters: {},
    };

    const result = await authUrlAntonyccHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing state query parameter from URL");
  });

  test("should properly encode special characters in state", async () => {
    process.env.DIY_SUBMIT_HOME_URL = "https://test.example.com/";
    process.env.DIY_SUBMIT_ANTONYCC_CLIENT_ID = "test-client-id";
    process.env.DIY_SUBMIT_ANTONYCC_BASE_URI = "https://oidc.antonycc.com/";

    const event = {
      queryStringParameters: {
        state: "test state with spaces & symbols",
      },
    };

    const result = await authUrlAntonyccHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.authUrl).toContain("state=test%20state%20with%20spaces%20%26%20symbols");
  });
});
