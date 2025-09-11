// app/unit-tests/authUrlAcCog.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { httpGetAcCog as authUrlAcCogHandler } from "@app/functions/authUrl.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

describe("httpGetAcCog", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("should return auth URL with identity_provider parameter", async () => {
    // Set environment variables for this test
    process.env.DIY_SUBMIT_HOME_URL = "https://test.example.com/";
    process.env.DIY_SUBMIT_AC_COG_CLIENT_ID = "test-client-id";
    process.env.DIY_SUBMIT_AC_COG_BASE_URI = "https://ci.auth.submit.diyaccounting.co.uk";

    const event = {
      queryStringParameters: {
        state: "test-state-123",
      },
    };

    const result = await authUrlAcCogHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.authUrl).toContain("https://ci.auth.submit.diyaccounting.co.uk/oauth2/authorize");
    expect(body.authUrl).toContain("response_type=code");
    expect(body.authUrl).toContain("client_id=test-client-id");
    expect(body.authUrl).toContain(
      "redirect_uri=https%3A%2F%2Ftest.example.com%2Fauth%2FloginWithAcCogCallback.html",
    );
    expect(body.authUrl).toContain("scope=openid%20profile%20email");
    expect(body.authUrl).toContain("state=test-state-123");
    // This is the key fix - the identity_provider parameter should be included
    expect(body.authUrl).toContain("identity_provider=ac-cog");
  });

  test("should return 400 when state is missing", async () => {
    process.env.DIY_SUBMIT_HOME_URL = "https://test.example.com/";
    process.env.DIY_SUBMIT_AC_COG_CLIENT_ID = "test-client-id";
    process.env.DIY_SUBMIT_AC_COG_BASE_URI = "https://ci.auth.submit.diyaccounting.co.uk";

    const event = {
      queryStringParameters: {},
    };

    const result = await authUrlAcCogHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing state query parameter from URL");
  });

  test("should properly encode special characters in state", async () => {
    process.env.DIY_SUBMIT_HOME_URL = "https://test.example.com/";
    process.env.DIY_SUBMIT_AC_COG_CLIENT_ID = "test-client-id";
    process.env.DIY_SUBMIT_AC_COG_BASE_URI = "https://ci.auth.submit.diyaccounting.co.uk";

    const event = {
      queryStringParameters: {
        state: "test state with spaces & symbols",
      },
    };

    const result = await authUrlAcCogHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.authUrl).toContain("state=test%20state%20with%20spaces%20%26%20symbols");
    expect(body.authUrl).toContain("identity_provider=ac-cog");
  });
});