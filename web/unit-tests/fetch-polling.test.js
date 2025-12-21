import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Load the script content and eval it in this context to populate window.* functions
const submitJsPath = path.join(process.cwd(), "web/public/submit.js");
const scriptContent = fs.readFileSync(submitJsPath, "utf-8");

describe("fetchWithIdToken polling", () => {
  let originalFetch;
  let consoleSpy;

  beforeEach(() => {
    // Setup global window and localStorage
    global.window = {
      sessionStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      location: {
        href: "http://localhost:3000",
        origin: "http://localhost:3000",
        search: "",
      },
      crypto: {
        getRandomValues: (arr) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        },
        randomUUID: () => "test-uuid-" + Math.random().toString(36).substring(7),
      },
    };

    global.localStorage = {
      getItem: vi.fn((key) => {
        if (key === "cognitoIdToken") return "mock-id-token";
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    global.Headers = class {
      constructor(init = {}) {
        this.map = new Map();
        if (init instanceof Map) {
          init.forEach((v, k) => this.map.set(k.toLowerCase(), v));
        } else if (init instanceof global.Headers) {
          init.map.forEach((v, k) => this.map.set(k, v));
        } else {
          Object.entries(init).forEach(([k, v]) => this.map.set(k.toLowerCase(), v));
        }
      }
      set(k, v) {
        this.map.set(k.toLowerCase(), v);
      }
      get(k) {
        return this.map.get(k.toLowerCase());
      }
      has(k) {
        return this.map.has(k.toLowerCase());
      }
    };

    // Mock document for DOM-related code
    const mockElement = {
      appendChild: vi.fn(),
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      style: {},
      onclick: null,
      addEventListener: vi.fn(),
      innerHTML: "",
    };

    global.document = {
      readyState: "complete",
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      getElementById: vi.fn(() => mockElement),
      createElement: vi.fn(() => ({ ...mockElement })),
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      head: {
        appendChild: vi.fn(),
      },
    };

    originalFetch = global.fetch;
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Evaluate the submit.js script
    eval(scriptContent);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("polls when receiving 202 Accepted and logs correctly", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 202,
        headers: new Headers({ "x-request-id": "test-req-id" }),
      })
      .mockResolvedValueOnce({
        status: 202,
        headers: new Headers({ "x-request-id": "test-req-id" }),
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: () => Promise.resolve({ success: true }),
      });

    global.fetch = fetchMock;
    global.window.fetch = fetchMock;

    // fetchWithIdToken is defined in submit.js and should be on global scope (or window)
    const response = await window.fetchWithIdToken("/api/v1/bundle");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(consoleSpy).toHaveBeenCalledWith("Waiting for async response...");
    expect(consoleSpy).toHaveBeenCalledWith("re-trying async request...");
    expect(consoleSpy).toHaveBeenCalledWith("Async response came back with status: 200");

    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify x-request-id was passed back in retries
    const secondCallHeaders = fetchMock.mock.calls[1][1].headers;
    expect(secondCallHeaders.get("x-request-id")).toBe("test-req-id");
  });
});
