import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Load the script content and eval it in this context to populate window.* functions
const submitJsPath = path.join(process.cwd(), "web/public/submit.js");
const scriptContent = fs.readFileSync(submitJsPath, "utf-8");

describe("fetchWithIdToken polling", () => {
  let originalFetch;
  let logSpy;
  let errorSpy;

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
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Evaluate the submit.js script
    eval(scriptContent);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("polls when receiving 202 Accepted and follows tiered delay strategy", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      headers: new Headers({ "x-request-id": "test-req-id" }),
    });

    // Final response after 12 polls
    fetchMock
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 1
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 2
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 3
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 4
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 5
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 6
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 7
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 8
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 9
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 10
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 11
      .mockResolvedValueOnce({
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: () => Promise.resolve({ success: true }),
      });

    global.fetch = fetchMock;
    global.window.fetch = fetchMock;

    const promise = window.fetchWithIdToken("/api/v1/bundle");

    // Advance 10 polls at 10ms each
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(10);
    }
    // Poll 11 starts after 10th delay
    await vi.advanceTimersByTimeAsync(1000); // 11th poll delay

    const response = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(response.status).toBe(200);
    vi.useRealTimers();
  });

  it("terminates polling after 1 minute timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      headers: new Headers({ "x-request-id": "timeout-id" }),
    });

    global.fetch = fetchMock;
    global.window.fetch = fetchMock;

    const promise = window.fetchWithIdToken("/api/v1/bundle");

    // Advance time by 61 seconds
    await vi.advanceTimersByTimeAsync(61000);

    const response = await promise;
    expect(response.status).toBe(202); // Returns the last 202 response
    expect(errorSpy).toHaveBeenCalledWith("Async request timed out after 1 minute");
    vi.useRealTimers();
  });
});
