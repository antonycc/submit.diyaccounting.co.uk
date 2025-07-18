import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { exchangeTokenHandler } from "@src/lib/main.js";

// Mock node-fetch
vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

import fetch from "node-fetch";

describe("exchangeTokenHandler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      HMRC_CLIENT_ID: "test-client-id",
      HMRC_CLIENT_SECRET: "test-client-secret",
      HMRC_REDIRECT_URI: "https://example.com/callback",
      HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("should exchange code for access token successfully", async () => {
    const mockResponse = {
      access_token: "test-access-token",
      token_type: "Bearer",
      expires_in: 3600,
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const event = {
      body: JSON.stringify({ code: "test-auth-code" }),
    };

    const result = await exchangeTokenHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.accessToken).toBe("test-access-token");

    // Verify fetch was called with correct parameters
    expect(fetch).toHaveBeenCalledWith("https://test-api.service.hmrc.gov.uk/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: expect.any(URLSearchParams),
    });

    // Verify the URLSearchParams contains correct data
    const fetchCall = fetch.mock.calls[0];
    const params = fetchCall[1].body;
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("client_id")).toBe("test-client-id");
    expect(params.get("client_secret")).toBe("test-client-secret");
    expect(params.get("redirect_uri")).toBe("https://example.com/callback");
    expect(params.get("code")).toBe("test-auth-code");
  });

  test("should return 400 when code is missing", async () => {
    const event = {
      body: JSON.stringify({}),
    };

    const result = await exchangeTokenHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing code");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when body is empty", async () => {
    const event = {
      body: "",
    };

    const result = await exchangeTokenHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing code");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when body is null", async () => {
    const event = {
      body: null,
    };

    const result = await exchangeTokenHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing code");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should return 400 when code is empty string", async () => {
    const event = {
      body: JSON.stringify({ code: "" }),
    };

    const result = await exchangeTokenHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing code");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("should handle HMRC API error response", async () => {
    const errorMessage = "invalid_grant";

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(errorMessage),
    });

    const event = {
      body: JSON.stringify({ code: "invalid-code" }),
    };

    const result = await exchangeTokenHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe(errorMessage);
  });

  test("should handle HMRC API 401 unauthorized", async () => {
    const errorMessage = "unauthorized_client";

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(errorMessage),
    });

    const event = {
      body: JSON.stringify({ code: "test-code" }),
    };

    const result = await exchangeTokenHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(401);
    expect(body.error).toBe(errorMessage);
  });

  test("should handle malformed JSON in request body", async () => {
    const event = {
      body: "invalid-json",
    };

    // This should throw an error when parsing JSON
    await expect(exchangeTokenHandler(event)).rejects.toThrow();
  });

  test("should handle network errors", async () => {
    fetch.mockRejectedValueOnce(new Error("Network error"));

    const event = {
      body: JSON.stringify({ code: "test-code" }),
    };

    await expect(exchangeTokenHandler(event)).rejects.toThrow("Network error");
  });

  test("should handle missing body property", async () => {
    const event = {};

    const result = await exchangeTokenHandler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe("Missing code");
    expect(fetch).not.toHaveBeenCalled();
  });
});
