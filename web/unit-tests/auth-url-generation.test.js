import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Helper to load and evaluate a script in a mock browser environment
function evaluateScript(filePath, context) {
  const content = fs.readFileSync(filePath, "utf-8");
  // Wrap in a function that provides the necessary globals
  const wrapper = new Function("window", "fetch", "Headers", "localStorage", "sessionStorage", "console", content);
  wrapper(context, global.fetch, global.Headers, context.localStorage, context.sessionStorage, context.console);
}

describe("Auth URL Generation (Phase 2)", () => {
  let mockWindow;

  beforeEach(() => {
    mockWindow = {
      location: {
        origin: "https://submit.diyaccounting.co.uk",
      },
      console: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      __env: null,
    };

    global.fetch = vi.fn();
    vi.stubGlobal("fetch", global.fetch);
    global.Headers = class {
      constructor(init) {
        this.map = new Map(Object.entries(init || {}));
      }
      get(k) {
        return this.map.get(k);
      }
    };
    vi.stubGlobal("Headers", global.Headers);

    // Load scripts
    evaluateScript(path.join(process.cwd(), "web/public/lib/env-loader.js"), mockWindow);
    evaluateScript(path.join(process.cwd(), "web/public/lib/auth-url-builder.js"), mockWindow);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("env-loader parses .env file correctly", async () => {
    const mockEnvContent = `
# This is a comment
COGNITO_CLIENT_ID=test-client-id
COGNITO_BASE_URI=https://auth.example.com
HMRC_CLIENT_ID=hmrc-id
DIY_SUBMIT_BASE_URL=https://submit.example.com/
    `;

    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockEnvContent),
    });

    await mockWindow.loadEnv();

    expect(mockWindow.__env).toEqual({
      COGNITO_CLIENT_ID: "test-client-id",
      COGNITO_BASE_URI: "https://auth.example.com",
      HMRC_CLIENT_ID: "hmrc-id",
      DIY_SUBMIT_BASE_URL: "https://submit.example.com/",
    });
  });

  it("buildCognitoAuthUrl generates correct URL", () => {
    mockWindow.__env = {
      COGNITO_CLIENT_ID: "client123",
      COGNITO_BASE_URI: "https://auth.example.com/",
      DIY_SUBMIT_BASE_URL: "https://submit.example.com",
    };

    const state = "xyz789";
    const url = mockWindow.authUrlBuilder.buildCognitoAuthUrl(state);

    expect(url).toContain("https://auth.example.com/oauth2/authorize");
    expect(url).toContain("client_id=client123");
    expect(url).toContain("state=xyz789");
    expect(url).toContain("redirect_uri=" + encodeURIComponent("https://submit.example.com/auth/loginWithCognitoCallback.html"));
  });

  it("buildHmrcAuthUrl generates correct URL for live", () => {
    mockWindow.__env = {
      HMRC_CLIENT_ID: "hmrc-live-id",
      HMRC_BASE_URI: "https://api.service.hmrc.gov.uk/",
      DIY_SUBMIT_BASE_URL: "https://submit.example.com/",
    };

    const state = "abc123";
    const url = mockWindow.authUrlBuilder.buildHmrcAuthUrl(state, "read:vat", "live");

    expect(url).toContain("https://api.service.hmrc.gov.uk/oauth/authorize");
    expect(url).toContain("client_id=hmrc-live-id");
    expect(url).toContain("scope=read%3Avat");
    expect(url).toContain("state=abc123");
    expect(url).toContain("redirect_uri=" + encodeURIComponent("https://submit.example.com/activities/submitVatCallback.html"));
  });

  it("buildHmrcAuthUrl generates correct URL for sandbox", () => {
    mockWindow.__env = {
      HMRC_SANDBOX_CLIENT_ID: "hmrc-sandbox-id",
      HMRC_SANDBOX_BASE_URI: "https://test-api.service.hmrc.gov.uk",
      DIY_SUBMIT_BASE_URL: "https://submit.example.com",
    };

    const state = "def456";
    const url = mockWindow.authUrlBuilder.buildHmrcAuthUrl(state, "write:vat", "sandbox");

    expect(url).toContain("https://test-api.service.hmrc.gov.uk/oauth/authorize");
    expect(url).toContain("client_id=hmrc-sandbox-id");
    expect(url).toContain("scope=write%3Avat");
    expect(url).toContain("state=def456");
  });
});
