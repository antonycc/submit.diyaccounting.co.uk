import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { authUrlHandler } from "@src/lib/main.js";

describe("authUrlHandler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PORT: "3000",
      HMRC_BASE_URI: "https://test",
      HMRC_CLIENT_ID: "test client id",
      HMRC_REDIRECT_URI: "http://hmrc.redirect:3000",
      HMRC_CLIENT_SECRET: "test hmrc client secret",
      TEST_REDIRECT_URI: "http://test.redirect:3000/",
      TEST_ACCESS_TOKEN: "test access token",
      TEST_RECEIPT: JSON.stringify({
        formBundleNumber: "test-123456789012",
        chargeRefNumber: "test-XM002610011594",
        processingDate: "2023-01-01T12:00:00.000Z",
      }),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("should return auth URL when state is provided", async () => {
    const event = {
      queryStringParameters: {
        state: "test-state-123",
      },
    };

    const result = await authUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.authUrl).toContain("https://test/oauth/authorize");
    expect(body.authUrl).toContain("response_type=code");
    expect(body.authUrl).toContain("client_id=test%20client%20id");
    expect(body.authUrl).toContain("redirect_uri=http%3A%2F%2Fhmrc.redirect%3A3000");
    expect(body.authUrl).toContain("scope=write%3Avat%20read%3Avat");
    expect(body.authUrl).toContain("state=test-state-123");
  });

  test("should return 400 when state is missing", async () => {
    const event = {
      queryStringParameters: {},
    };

    const result = await authUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing state query parameter from URL");
  });

  test("should return 400 when queryStringParameters is null", async () => {
    const event = {
      queryStringParameters: null,
    };

    const result = await authUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing state query parameter from URL");
  });

  test("should return 400 when state is empty string", async () => {
    const event = {
      queryStringParameters: {
        state: "",
      },
    };

    const result = await authUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing state query parameter from URL");
  });

  test("should properly encode special characters in state", async () => {
    const event = {
      queryStringParameters: {
        state: "test state with spaces & symbols",
      },
    };

    const result = await authUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.authUrl).toContain("state=test%20state%20with%20spaces%20%26%20symbols");
  });

  test("should handle undefined queryStringParameters", async () => {
    const event = {};

    const result = await authUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing state query parameter from URL");
  });
});
