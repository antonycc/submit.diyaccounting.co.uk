import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { authUrlHandler } from "@src/lib/main.js";

describe("authUrlHandler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      HMRC_CLIENT_ID: "test-client-id",
      HMRC_REDIRECT_URI: "https://example.com/callback",
      HMRC_BASE: "https://test-api.service.hmrc.gov.uk",
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
    expect(body.authUrl).toContain("https://test-api.service.hmrc.gov.uk/oauth/authorize");
    expect(body.authUrl).toContain("response_type=code");
    expect(body.authUrl).toContain("client_id=test-client-id");
    expect(body.authUrl).toContain("redirect_uri=https%3A%2F%2Fexample.com%2Fcallback");
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
    expect(body.error).toBe("Missing state");
  });

  test("should return 400 when queryStringParameters is null", async () => {
    const event = {
      queryStringParameters: null,
    };

    const result = await authUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing state");
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
    expect(body.error).toBe("Missing state");
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
    expect(body.error).toBe("Missing state");
  });
});
