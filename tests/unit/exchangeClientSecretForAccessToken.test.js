// tests/unit/exchangeClientSecretForAccessToken.test.js
import { describe, beforeEach, afterEach, test, expect, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import exchangeClientSecretForAccessToken from "../../app/lib/exchangeClientSecretForAccessToken.js";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

// Mock node-fetch
vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

// Mock logger
vi.mock("@app/lib/logger.js", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const secretsManagerMock = mockClient(SecretsManagerClient);

describe("exchangeClientSecretForAccessToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    secretsManagerMock.reset();
    
    // Reset environment variables
    process.env = {
      ...originalEnv,
      DIY_SUBMIT_HMRC_CLIENT_ID: "test-client-id",
      DIY_SUBMIT_HOME_URL: "http://localhost:3000",
      DIY_SUBMIT_HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      NODE_ENV: "test",
    };
    
    // Clear any cached secrets by resetting the module
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    secretsManagerMock.restore();
  });

  describe("secret retrieval", () => {
    test("should use environment variable when DIY_SUBMIT_HMRC_CLIENT_SECRET is set", async () => {
      // Arrange
      const testSecret = "test-client-secret-from-env";
      process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET = testSecret;
      
      const fetch = await import("node-fetch");
      fetch.default.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "test-access-token" }),
      });

      // Re-import the module to get fresh instance
      const { default: exchangeFunction } = await import("../../app/lib/exchangeClientSecretForAccessToken.js");

      // Act
      const result = await exchangeFunction("test-auth-code");

      // Assert
      expect(result.hmrcAccessToken).toBe("test-access-token");
      expect(secretsManagerMock.calls()).toHaveLength(0); // Should not call Secrets Manager
      
      // Verify the fetch was called with correct parameters
      const fetchCall = fetch.default.mock.calls[0];
      expect(fetchCall[1].body.toString()).toContain(`client_secret=${testSecret}`);
    });

    test("should retrieve secret from AWS Secrets Manager when environment variable is not set", async () => {
      // Arrange
      const testSecretArn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret";
      const testSecretValue = "test-client-secret-from-secrets-manager";
      
      process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN = testSecretArn;
      delete process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET;

      // Mock Secrets Manager response
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: testSecretValue,
      });

      const fetch = await import("node-fetch");
      fetch.default.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "test-access-token" }),
      });

      // Re-import the module to get fresh instance
      const { default: exchangeFunction } = await import("../../app/lib/exchangeClientSecretForAccessToken.js");

      // Act
      const result = await exchangeFunction("test-auth-code");

      // Assert
      expect(result.hmrcAccessToken).toBe("test-access-token");
      
      // Verify GetSecretValueCommand was called with correct parameters
      const secretsManagerCalls = secretsManagerMock.calls();
      expect(secretsManagerCalls).toHaveLength(1);
      expect(secretsManagerCalls[0].args[0].input).toEqual({
        SecretId: testSecretArn,
      });
      
      // Verify the fetch was called with the secret from Secrets Manager
      const fetchCall = fetch.default.mock.calls[0];
      expect(fetchCall[1].body.toString()).toContain(`client_secret=${testSecretValue}`);
    });

    test("should cache the secret and not call Secrets Manager on subsequent calls", async () => {
      // Arrange
      const testSecretArn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret";
      const testSecretValue = "cached-secret-value";
      
      process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN = testSecretArn;
      delete process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET;

      // Mock Secrets Manager response
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: testSecretValue,
      });

      const fetch = await import("node-fetch");
      fetch.default.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "test-access-token" }),
      });

      // Re-import the module to get fresh instance
      const { default: exchangeFunction } = await import("../../app/lib/exchangeClientSecretForAccessToken.js");

      // Act - call the function twice
      await exchangeFunction("test-auth-code-1");
      await exchangeFunction("test-auth-code-2");

      // Assert
      // Should only call Secrets Manager once due to caching
      const secretsManagerCalls = secretsManagerMock.calls();
      expect(secretsManagerCalls).toHaveLength(1);
      
      // Both fetch calls should use the same cached secret
      expect(fetch.default).toHaveBeenCalledTimes(2);
      const firstFetchCall = fetch.default.mock.calls[0];
      const secondFetchCall = fetch.default.mock.calls[1];
      expect(firstFetchCall[1].body.toString()).toContain(`client_secret=${testSecretValue}`);
      expect(secondFetchCall[1].body.toString()).toContain(`client_secret=${testSecretValue}`);
    });

    test("should handle GetSecretValueCommand response structure correctly", async () => {
      // Arrange
      const testSecretArn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret";
      const testSecretValue = "secret-with-special-chars!@#$%";
      
      process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN = testSecretArn;
      delete process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET;

      // Mock Secrets Manager response with the expected structure
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: testSecretValue,
        VersionId: "test-version-id",
        VersionStages: ["AWSCURRENT"],
        CreatedDate: new Date(),
      });

      const fetch = await import("node-fetch");
      fetch.default.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "test-access-token" }),
      });

      // Re-import the module to get fresh instance
      const { default: exchangeFunction } = await import("../../app/lib/exchangeClientSecretForAccessToken.js");

      // Act
      const result = await exchangeFunction("test-auth-code");

      // Assert
      expect(result.hmrcAccessToken).toBe("test-access-token");
      
      // Verify the secret was extracted correctly from the response
      const fetchCall = fetch.default.mock.calls[0];
      const bodyString = fetchCall[1].body.toString();
      // URLSearchParams encodes special characters, so we need to check for the encoded version
      expect(bodyString).toContain(`client_secret=secret-with-special-chars%21%40%23%24%25`);
    });

    test("should prioritize environment variable over Secrets Manager when both are available", async () => {
      // Arrange
      const envSecret = "env-secret";
      const secretsManagerSecret = "secrets-manager-secret";
      const testSecretArn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret";
      
      process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET = envSecret;
      process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN = testSecretArn;

      // Mock Secrets Manager response (should not be called)
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: secretsManagerSecret,
      });

      const fetch = await import("node-fetch");
      fetch.default.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "test-access-token" }),
      });

      // Re-import the module to get fresh instance
      const { default: exchangeFunction } = await import("../../app/lib/exchangeClientSecretForAccessToken.js");

      // Act
      const result = await exchangeFunction("test-auth-code");

      // Assert
      expect(result.hmrcAccessToken).toBe("test-access-token");
      expect(secretsManagerMock.calls()).toHaveLength(0); // Should not call Secrets Manager
      
      // Verify the fetch was called with the environment variable secret
      const fetchCall = fetch.default.mock.calls[0];
      expect(fetchCall[1].body.toString()).toContain(`client_secret=${envSecret}`);
      expect(fetchCall[1].body.toString()).not.toContain(secretsManagerSecret);
    });
  });

  describe("stubbed mode", () => {
    test("should return test access token in stubbed mode", async () => {
      // Arrange
      const testAccessToken = "stubbed-test-token";
      process.env.NODE_ENV = "stubbed";
      process.env.DIY_SUBMIT_TEST_ACCESS_TOKEN = testAccessToken;
      process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET = "any-secret";

      // Re-import the module to get fresh instance
      const { default: exchangeFunction } = await import("../../app/lib/exchangeClientSecretForAccessToken.js");

      // Act
      const result = await exchangeFunction("test-auth-code");

      // Assert
      expect(result.hmrcAccessToken).toBe(testAccessToken);
      expect(result.hmrcResponse.status).toBe(200);
      
      // Should not make actual HTTP calls in stubbed mode
      const fetch = await import("node-fetch");
      expect(fetch.default).not.toHaveBeenCalled();
    });
  });
});