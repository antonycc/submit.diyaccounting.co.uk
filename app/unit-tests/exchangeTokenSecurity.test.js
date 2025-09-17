// app/unit-tests/exchangeTokenSecurity.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import dotenv from "dotenv";

import { 
  httpPostHmrc,
  httpPostCognito,
  httpPostMock 
} from "@app/functions/exchangeToken.js";

dotenv.config({ path: ".env.test" });

// Mock node-fetch
vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

// Mock AWS SDK
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: vi.fn(() => ({})),
  GetSecretValueCommand: vi.fn(),
}));

import fetch from "node-fetch";

describe("exchangeToken - Enhanced OAuth Security", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      DIY_SUBMIT_HMRC_CLIENT_ID: "test-client-id",
      DIY_SUBMIT_HMRC_CLIENT_SECRET: "test-client-secret",
      DIY_SUBMIT_HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      DIY_SUBMIT_HOME_URL: "https://example.com/",
      DIY_SUBMIT_COGNITO_CLIENT_ID: "test-cognito-client",
      DIY_SUBMIT_COGNITO_BASE_URI: "https://test.auth.eu-west-2.amazoncognito.com",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("httpPostHmrc", () => {
    test("should validate authorization code format", async () => {
      const event = {
        body: JSON.stringify({
          code: "abc", // Too short
        }),
      };

      const result = await httpPostHmrc(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Invalid authorization code: Authorization code is too short");
    });

    test("should reject missing authorization code", async () => {
      const event = {
        body: JSON.stringify({}),
      };

      const result = await httpPostHmrc(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Invalid authorization code: Authorization code is required");
    });

    test("should validate OAuth state when validation is enabled", async () => {
      process.env.DIY_SUBMIT_VALIDATE_OAUTH_STATE = "true";

      const event = {
        body: JSON.stringify({
          code: "valid-auth-code-123456",
          state: "abc", // Too short
        }),
      };

      const result = await httpPostHmrc(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Invalid OAuth state: OAuth state parameter is too short");
    });

    test("should accept valid code and state", async () => {
      process.env.DIY_SUBMIT_VALIDATE_OAUTH_STATE = "true";

      // Mock fetch for successful token exchange
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          access_token: "test-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      });

      const event = {
        body: JSON.stringify({
          code: "valid-auth-code-123456",
          state: "valid-state-parameter-1234567890",
        }),
      };

      const result = await httpPostHmrc(event);

      expect(result.statusCode).toBe(200);
      expect(fetch).toHaveBeenCalled();
    });

    test("should skip state validation when disabled", async () => {
      process.env.DIY_SUBMIT_VALIDATE_OAUTH_STATE = "false";

      // Mock fetch for successful token exchange
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          access_token: "test-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      });

      const event = {
        body: JSON.stringify({
          code: "valid-auth-code-123456",
          state: "abc", // Would be invalid if validation was enabled
        }),
      };

      const result = await httpPostHmrc(event);

      expect(result.statusCode).toBe(200);
      expect(fetch).toHaveBeenCalled();
    });

    test("should reject code with invalid characters", async () => {
      const event = {
        body: JSON.stringify({
          code: "invalid code with spaces",
        }),
      };

      const result = await httpPostHmrc(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Invalid authorization code: Authorization code contains invalid characters");
    });
  });

  describe("httpPostCognito", () => {
    test("should validate authorization code in URL-encoded body", async () => {
      const event = {
        body: Buffer.from("code=abc").toString("base64"), // Too short code
      };

      const result = await httpPostCognito(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Invalid authorization code: Authorization code is too short");
    });

    test("should accept valid code from Cognito callback", async () => {
      // Mock fetch for successful token exchange
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          access_token: "test-access-token",
          id_token: "test-id-token",
          refresh_token: "test-refresh-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      });

      const event = {
        body: Buffer.from("code=valid-cognito-code-123456&state=valid-state-123456789").toString("base64"),
      };

      const result = await httpPostCognito(event);

      expect(result.statusCode).toBe(200);
      expect(fetch).toHaveBeenCalled();
    });

    test("should validate state in Cognito flow when enabled", async () => {
      process.env.DIY_SUBMIT_VALIDATE_OAUTH_STATE = "true";

      const event = {
        body: Buffer.from("code=valid-cognito-code-123456&state=abc").toString("base64"), // Invalid state
      };

      const result = await httpPostCognito(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Invalid OAuth state: OAuth state parameter is too short");
    });
  });

  describe("httpPostMock", () => {
    test("should apply same validation as HMRC endpoint", async () => {
      const event = {
        body: JSON.stringify({
          code: "abc", // Too short
        }),
      };

      const result = await httpPostMock(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Invalid authorization code: Authorization code is too short");
    });

    test("should accept valid mock OAuth flow", async () => {
      // Mock fetch for successful token exchange
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          access_token: "mock-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      });

      const event = {
        body: JSON.stringify({
          code: "valid-mock-code-123456",
          state: "valid-state-parameter-1234567890",
        }),
      };

      const result = await httpPostMock(event);

      expect(result.statusCode).toBe(200);
      expect(fetch).toHaveBeenCalled();
    });
  });

  describe("Edge cases and security scenarios", () => {
    test("should handle malformed JSON in request body", async () => {
      const event = {
        body: "invalid-json",
      };

      const result = await httpPostHmrc(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toBe("Invalid JSON in request body");
    });

    test("should handle empty request body", async () => {
      const event = {
        body: "",
      };

      const result = await httpPostHmrc(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Authorization code is required");
    });

    test("should handle null request body", async () => {
      const event = {
        body: null,
      };

      const result = await httpPostHmrc(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Authorization code is required");
    });

    test("should handle very long authorization code", async () => {
      const longCode = "a".repeat(600);
      const event = {
        body: JSON.stringify({
          code: longCode,
        }),
      };

      const result = await httpPostHmrc(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Invalid authorization code: Authorization code is too long");
    });

    test("should handle state with invalid characters", async () => {
      process.env.DIY_SUBMIT_VALIDATE_OAUTH_STATE = "true";

      const event = {
        body: JSON.stringify({
          code: "valid-auth-code-123456",
          state: "invalid state with spaces",
        }),
      };

      const result = await httpPostHmrc(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Invalid OAuth state: OAuth state parameter contains invalid characters");
    });

    test("should handle non-string code", async () => {
      const event = {
        body: JSON.stringify({
          code: 123456, // Number instead of string
        }),
      };

      const result = await httpPostHmrc(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Invalid authorization code: Authorization code must be a string");
    });

    test("should handle non-string state", async () => {
      process.env.DIY_SUBMIT_VALIDATE_OAUTH_STATE = "true";

      const event = {
        body: JSON.stringify({
          code: "valid-auth-code-123456",
          state: 123456, // Number instead of string
        }),
      };

      const result = await httpPostHmrc(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain("Invalid OAuth state: OAuth state must be a string");
    });
  });
});