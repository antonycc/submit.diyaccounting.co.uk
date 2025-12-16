// app/unit-tests/services/hmrcApi.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock audit write to DynamoDB to avoid AWS SDK dependency
vi.mock("@app/data/dynamoDbHmrcApiRequestRepository.js", () => ({
  putHmrcApiRequest: vi.fn().mockResolvedValue(undefined),
}));

describe("services/hmrcApi", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set base URLs so getHmrcBaseUrl is stable
    process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
    process.env.HMRC_SANDBOX_BASE_URI = "https://test-api.service.hmrc.gov.uk";
  });

  it("buildHmrcHeaders maps auth, accept, and Gov-Test-Scenario when provided", async () => {
    const { buildHmrcHeaders } = await import("@app/services/hmrcApi.js");
    const headers = buildHmrcHeaders("at-123", { "Gov-Client-Device-ID": "dev" }, "SOME_SCENARIO");
    expect(headers.Authorization).toBe("Bearer at-123");
    expect(headers.Accept).toBe("application/vnd.hmrc.1.0+json");
    expect(headers["Gov-Test-Scenario"]).toBe("SOME_SCENARIO");
    expect(headers["Gov-Client-Device-ID"]).toBe("dev");
  });

  it("validateHmrcAccessToken throws on short or missing token", async () => {
    const { validateHmrcAccessToken, UnauthorizedTokenError } = await import("@app/services/hmrcApi.js");

    // Force unauthorized branch
    process.env.TEST_FORCE_UNAUTHORIZED_TOKEN = "true";
    expect(() => validateHmrcAccessToken("anything")).toThrow(UnauthorizedTokenError);
    delete process.env.TEST_FORCE_UNAUTHORIZED_TOKEN;

    // Invalid token path
    expect(() => validateHmrcAccessToken("x")).toThrowError(/Invalid access token/);
  });

  it("hmrcHttpGet builds URL with cleaned query params and returns structured data", async () => {
    const { hmrcHttpGet } = await import("@app/services/hmrcApi.js");

    // Mock fetch
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, items: [1] }),
      headers: { forEach: (fn) => fn("application/json", "content-type") },
    });

    const res = await hmrcHttpGet(
      "/test/endpoint",
      "token-123",
      { "Gov-Client-Device-ID": "dev" },
      "SCENARIO",
      "sandbox",
      { a: "1", b: "", c: null, d: undefined },
      "user-sub-1",
    );

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true, items: [1] });
    // Ensure fetch was called with a URL containing only a=1
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/test-api\.service\.hmrc\.gov\.uk/);
    expect(calledUrl).toMatch(/\/test\/endpoint\?a=1$/);
    // Ensure Gov-Test-Scenario propagates
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers["Gov-Test-Scenario"]).toBe("SCENARIO");
  });
});
