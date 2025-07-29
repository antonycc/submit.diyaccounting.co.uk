import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { authUrlHandler } from "@app/bin/main.js";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

describe("httpGet", () => {
  const originalEnv = process.env;

  // YOU ARE HERE: The default environment from .env should be the highly stubbed environment for unit testing
  // So the envronment section below should be mostly empty unless you need to override something for a specific test.
  // Then the behaviour tests will override
  // as will the npm runn start and npm run proxy commands
  // and the ci tests so we can test; local via proxy, ci, and prod.
  // This so that npm test will run the unit tests with the default (no) environment
  // So we also need tests that do load the environment variables to check the default behaviour
  // Also check in test.env with the default environment variables that don't include secrets.

  // Maybe all the tests should use dotenv to comsult the checked in test.env,

  beforeEach(() => {

    process.env = {
      ...originalEnv,
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
    expect(body.authUrl).toContain("redirect_uri=http%3A%2F%2Fhmrc.test.redirect%3A3000");
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
    expect(body.message).toBe("Missing state query parameter from URL");
  });

  test("should return 400 when queryStringParameters is null", async () => {
    const event = {
      queryStringParameters: null,
    };

    const result = await authUrlHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.message).toBe("Missing state query parameter from URL");
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
    expect(body.message).toBe("Missing state query parameter from URL");
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
    expect(body.message).toBe("Missing state query parameter from URL");
  });
});
