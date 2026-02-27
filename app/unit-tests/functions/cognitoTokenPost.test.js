// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, it, expect } from "vitest";
import { extractUserInfoFromResponse } from "@app/functions/auth/cognitoTokenPost.js";

/**
 * Build a minimal JWT with the given payload (no signature verification needed).
 */
function buildMockJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.mock-signature`;
}

describe("cognitoTokenPost", () => {
  describe("extractUserInfoFromResponse", () => {
    it("should extract email and provider from a Google federated ID token", () => {
      const idToken = buildMockJwt({
        email: "customer@gmail.com",
        identities: JSON.stringify([
          { providerName: "Google", providerType: "Google", userId: "123", primary: true },
        ]),
      });

      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ idToken }),
      });

      expect(result).toEqual({ email: "customer@gmail.com", provider: "Google" });
    });

    it("should extract email without provider for native Cognito users", () => {
      const idToken = buildMockJwt({
        email: "test-abc@test.diyaccounting.co.uk",
        sub: "abc-123",
      });

      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ idToken }),
      });

      expect(result).toEqual({ email: "test-abc@test.diyaccounting.co.uk", provider: "" });
    });

    it("should return empty strings when statusCode is not 200", () => {
      const result = extractUserInfoFromResponse({
        statusCode: 500,
        body: JSON.stringify({ error: "Token exchange failed" }),
      });

      expect(result).toEqual({ email: "", provider: "" });
    });

    it("should return empty strings when no idToken in response", () => {
      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ accessToken: "abc" }),
      });

      expect(result).toEqual({ email: "", provider: "" });
    });

    it("should return empty strings for non-JWT idToken (graceful fallback)", () => {
      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ idToken: "not-a-jwt" }),
      });

      expect(result).toEqual({ email: "", provider: "" });
    });

    it("should handle identities as an array (not stringified)", () => {
      const idToken = buildMockJwt({
        email: "user@example.com",
        identities: [{ providerName: "Google", providerType: "Google" }],
      });

      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ idToken }),
      });

      expect(result).toEqual({ email: "user@example.com", provider: "Google" });
    });

    it("should handle empty identities array", () => {
      const idToken = buildMockJwt({
        email: "user@example.com",
        identities: "[]",
      });

      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: JSON.stringify({ idToken }),
      });

      expect(result).toEqual({ email: "user@example.com", provider: "" });
    });

    it("should handle malformed body JSON gracefully", () => {
      const result = extractUserInfoFromResponse({
        statusCode: 200,
        body: "not-json",
      });

      expect(result).toEqual({ email: "", provider: "" });
    });
  });
});
