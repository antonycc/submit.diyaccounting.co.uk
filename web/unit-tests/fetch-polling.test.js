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
      delete(k) {
        this.map.delete(k.toLowerCase());
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

  it("polls when receiving 202 Accepted and follows delay strategy", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      headers: new Headers({ "x-request-id": "test-req-id" }),
    });

    // Final response after 5 polls
    fetchMock
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 1
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 2
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 3
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 4
      .mockResolvedValueOnce({ status: 202, headers: new Headers({ "x-request-id": "test-req-id" }) }) // 5
      .mockResolvedValueOnce({
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: () => Promise.resolve({ success: true }),
      });

    global.fetch = fetchMock;
    global.window.fetch = fetchMock;

    const promise = window.fetchWithIdToken("/api/v1/bundle", {
      method: "POST",
      body: JSON.stringify({ bundleId: "test-bundle" }),
    });

    // Advance 5 polls at 1000ms each
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    const response = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(response.status).toBe(200);

    // Verify polling logs
    expect(logSpy).toHaveBeenCalledWith("waiting async request [POST /api/v1/bundle] (timeout: 90000ms)...");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /re-trying async request \[POST \/api\/v1\/bundle\] \(poll #1, elapsed: \d+ms, timeout: 90000ms, last status: 202\)\.\.\./,
      ),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /re-trying async request \[POST \/api\/v1\/bundle\] \(poll #5, elapsed: \d+ms, timeout: 90000ms, last status: 202\)\.\.\./,
      ),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/finished async request \[POST \/api\/v1\/bundle\] \(poll #5, elapsed: \d+ms, status: 200\)/),
    );

    vi.useRealTimers();
  });

  it("terminates polling after 90 seconds timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      headers: new Headers({ "x-request-id": "timeout-id" }),
    });

    global.fetch = fetchMock;
    global.window.fetch = fetchMock;

    const promise = window.fetchWithIdToken("/api/v1/bundle", {
      method: "POST",
      body: JSON.stringify({ bundleId: "test-bundle" }),
    });

    // Advance time by 91 seconds
    await vi.advanceTimersByTimeAsync(91000);

    const response = await promise;
    expect(response.status).toBe(202); // Returns the last 202 response
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/timed out async request \[POST \/api\/v1\/bundle\] \(poll #\d+, elapsed: \d+ms, timeout: 90000ms\)/),
    );
    vi.useRealTimers();
  });
});

describe("fetchWithIdToken fire-and-forget", () => {
  let originalFetch;
  let logSpy;

  beforeEach(() => {
    // Setup global window and localStorage
    global.window = {
      location: {
        origin: "http://localhost:3000",
      },
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    global.localStorage = {
      getItem: vi.fn((key) => {
        if (key === "cognitoIdToken") return "mock-id-token";
        return null;
      }),
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
      delete(k) {
        this.map.delete(k.toLowerCase());
      }
    };

    originalFetch = global.fetch;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Evaluate the submit.js script
    eval(scriptContent);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    logSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("skips polling when x-wait-time-ms header is '0'", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      headers: new Headers({ "x-request-id": "no-poll-id" }),
    });

    global.fetch = fetchMock;
    global.window.fetch = fetchMock;

    const response = await window.fetchWithIdToken("/api/v1/bundle", {
      method: "POST",
      headers: { "x-wait-time-ms": "0" },
      body: JSON.stringify({ bundleId: "test-bundle" }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(202);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringMatching(/waiting async request/));
  });

  it("skips polling when fireAndForget option is true", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      headers: new Headers({ "x-request-id": "ff-id" }),
    });

    global.fetch = fetchMock;
    global.window.fetch = fetchMock;

    const response = await window.fetchWithIdToken("/api/v1/bundle", {
      method: "POST",
      fireAndForget: true,
      body: JSON.stringify({ bundleId: "test-bundle" }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(202);
    // Verify internal header set
    const sentHeaders = fetchMock.mock.calls[0][1].headers;
    expect(sentHeaders.get("x-wait-time-ms")).toBe("0");
    expect(sentHeaders.get("x-initial-request")).toBe("true");
  });

  it("sends x-initial-request: true only on the first call and removes it for polls", async () => {
    vi.useFakeTimers();
    let firstCallHeaders;
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (!firstCallHeaders) {
        firstCallHeaders = new Map(init.headers.map);
      }
      if (fetchMock.mock.calls.length === 1) {
        return {
          status: 202,
          headers: new Headers({ "x-request-id": "polling-id" }),
        };
      }
      return {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: () => Promise.resolve({ success: true }),
      };
    });

    global.fetch = fetchMock;
    global.window.fetch = fetchMock;

    const promise = window.fetchWithIdToken("/api/v1/bundle", {
      method: "POST",
      body: JSON.stringify({ bundleId: "test-bundle" }),
    });

    await vi.advanceTimersByTimeAsync(1000);

    const response = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // First call should have initial request header (checked via captured map)
    expect(firstCallHeaders.get("x-initial-request")).toBe("true");

    // Second call (poll) should NOT have initial request header
    const secondHeaders = fetchMock.mock.calls[1][1].headers;
    expect(secondHeaders.has("x-initial-request")).toBe(false);
    expect(secondHeaders.get("x-request-id")).toBe("polling-id");

    vi.useRealTimers();
  });
});

describe("fetchWithIdToken AbortController", () => {
  let originalFetch;
  let logSpy;

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
      DOMException: class extends Error {
        constructor(message, name) {
          super(message);
          this.name = name;
        }
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
      delete(k) {
        this.map.delete(k.toLowerCase());
      }
    };

    global.DOMException = global.window.DOMException;

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

    // Evaluate the submit.js script
    eval(scriptContent);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    logSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("terminates polling when AbortSignal is triggered", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      headers: new Headers({ "x-request-id": "abort-id" }),
    });

    global.fetch = fetchMock;
    global.window.fetch = fetchMock;

    const controller = new AbortController();
    const promise = window.fetchWithIdToken("/api/v1/bundle", {
      method: "POST",
      body: JSON.stringify({ bundleId: "test-bundle" }),
      signal: controller.signal,
    });

    // Let the first request finish and start the wait
    await vi.advanceTimersByTimeAsync(0);

    // Trigger abort
    controller.abort();

    // The promise should reject with AbortError
    await expect(promise).rejects.toThrow("Aborted");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/aborted async request \[POST \/api\/v1\/bundle\] \(poll #\d+, elapsed: \d+ms\)/),
    );

    vi.useRealTimers();
  });
});
