// app/unit-tests/gotoWithRetries.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as nav from "../../../behaviour-tests/helpers/gotoWithRetries.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function makeMockPage() {
  return {
    goto: vi.fn(),
    waitForSelector: vi.fn(),
  };
}

describe("gotoWithRetries", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries on transient error and eventually succeeds", async () => {
    const page = makeMockPage();
    const transient = new Error("net::ERR_NETWORK_CHANGED");

    page.goto.mockRejectedValueOnce(transient).mockRejectedValueOnce(transient).mockResolvedValueOnce(undefined);
    page.screenshot = vi.fn().mockResolvedValue();

    const sleepFn = vi.fn().mockResolvedValue();

    await nav.gotoWithRetries(page, "https://example.com", {
      maxRetries: 4,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      sleepFn,
    });

    expect(page.goto).toHaveBeenCalledTimes(3);
    // backoff called twice (between the three attempts)
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-transient error", async () => {
    const page = makeMockPage();
    const fatal = new Error("HTTP 401 Unauthorized");
    page.goto.mockRejectedValueOnce(fatal);
    page.screenshot = vi.fn().mockResolvedValue();

    await expect(nav.gotoWithRetries(page, "https://example.com", { maxRetries: 4 })).rejects.toThrowError(/Unauthorized/);

    expect(page.goto).toHaveBeenCalledTimes(1);
  });

  it("respects maxRetries and throws last error when exhausted", async () => {
    const page = makeMockPage();
    const transient = new Error("net::ERR_NAME_NOT_RESOLVED");
    page.goto.mockRejectedValue(transient);
    page.screenshot = vi.fn().mockResolvedValue();

    const sleepFn = vi.fn().mockResolvedValue();

    await expect(
      nav.gotoWithRetries(page, "https://example.com", { maxRetries: 3, baseDelayMs: 50, maxDelayMs: 100, sleepFn }),
    ).rejects.toThrowError(/ERR_NAME_NOT_RESOLVED/);

    // 3 attempts => 2 delays
    expect(page.goto).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenNthCalledWith(1, 50);
    expect(sleepFn).toHaveBeenNthCalledWith(2, 100); // capped at maxDelayMs
  });

  it("waits for readySelector when provided", async () => {
    const page = makeMockPage();
    page.goto.mockResolvedValue();
    page.waitForSelector.mockResolvedValue();
    page.screenshot = vi.fn().mockResolvedValue();

    await nav.gotoWithRetries(page, "https://example.com", {
      readySelector: "#welcomeHeading",
      readySelectorTimeout: 1234,
    });

    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(page.waitForSelector).toHaveBeenCalledWith("#welcomeHeading", { state: "visible", timeout: 1234 });
  });
});
