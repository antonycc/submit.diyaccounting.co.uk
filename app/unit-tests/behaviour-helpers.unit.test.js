import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @playwright/test so behaviour-helpers' test.step just runs the callback
vi.mock("@playwright/test", () => ({
  test: { step: async (_name, fn) => await fn() },
}));

// Lightweight Page/Locator stubs
class StubLocator {
  constructor(page, selector) {
    this.page = page;
    this.selector = selector || "[Locator]";
    this.calls = [];
  }
  async waitFor(_opts) {
    this.calls.push({ op: "waitFor" });
  }
  async focus() {
    this.page.focused.push(this.selector);
    this.calls.push({ op: "focus" });
  }
  async click() {
    this.page.clicked.push(this.selector);
    this.calls.push({ op: "click" });
  }
  async fill(v) {
    this.page.filled.push({ selector: this.selector, value: String(v) });
    this.calls.push({ op: "fill", value: v });
  }
  async selectOption(v) {
    this.page.selected.push({ selector: this.selector, value: v });
    // Simulate failure on value "FAIL" unless selecting by label
    if (v === "FAIL") throw new Error("simulated select failure by value");
  }
}

class StubPage {
  constructor() {
    this.waitedFor = [];
    this.focused = [];
    this.clicked = [];
    this.filled = [];
    this.selected = [];
    this.shots = [];
    this.gotos = [];
  }
  locator(selector) {
    return new StubLocator(this, selector);
  }
  async waitForSelector(sel, _opts) {
    this.waitedFor.push(sel);
  }
  async focus(sel) {
    this.focused.push(sel);
  }
  async click(sel) {
    this.clicked.push(sel);
  }
  async fill(sel, v) {
    this.filled.push({ selector: sel, value: String(v) });
  }
  async selectOption(sel, v) {
    this.selected.push({ selector: sel, value: v });
    if (v === "FAIL") throw new Error("simulated select failure by value");
  }
  async screenshot(opts) {
    this.shots.push(opts?.path || "screenshot");
  }
  async goto(url, _opts) {
    this.gotos.push(url);
  }
}

// Import after mocks are set up
import { loggedClick, loggedFill, loggedGoto, loggedFocus, loggedSelectOption } from "../../behaviour-tests/helpers/behaviour-helpers.js";

describe("behaviour-helpers interaction helpers", () => {
  let page;
  beforeEach(() => {
    page = new StubPage();
  });

  it("loggedFocus focuses a selector and takes a screenshot", async () => {
    await loggedFocus(page, "#status", "status field", { screenshotPath: "target/test-shots" });
    expect(page.waitedFor).toContain("#status");
    expect(page.focused).toContain("#status");
    expect(page.shots.length).toBeGreaterThan(0);
  });

  it("loggedSelectOption selects by value then falls back to label if needed (selector)", async () => {
    await loggedSelectOption(page, "#testScenario", "FAIL", "test scenario", { screenshotPath: "target/test-shots" });
    // First attempt by value
    expect(page.selected[0]).toEqual({ selector: "#testScenario", value: "FAIL" });
    // Fallback attempt by label
    expect(page.selected[1].selector).toBe("#testScenario");
    expect(page.selected[1].value).toEqual({ label: "FAIL" });
  });

  it("loggedSelectOption uses locator path too", async () => {
    const loc = page.locator("#status");
    await loggedSelectOption(page, loc, "OPEN", "status", { screenshotPath: "target/test-shots" });
    // Locator path stores on page.selected with the locator's selector
    expect(page.selected[0]).toEqual({ selector: "#status", value: "OPEN" });
  });

  it("loggedClick waits, focuses and clicks", async () => {
    await loggedClick(page, "#submitBtn", "submit", { screenshotPath: "target/test-shots" });
    expect(page.waitedFor).toContain("#submitBtn");
    expect(page.focused).toContain("#submitBtn");
    expect(page.clicked).toContain("#submitBtn");
    expect(page.shots.length).toBeGreaterThan(0);
  });

  it("loggedFill waits, focuses and fills", async () => {
    await loggedFill(page, "#vatDue", 123.45, "vat due", { screenshotPath: "target/test-shots" });
    expect(page.waitedFor).toContain("#vatDue");
    expect(page.focused).toContain("#vatDue");
    expect(page.filled[0]).toEqual({ selector: "#vatDue", value: "123.45" });
    expect(page.shots.length).toBeGreaterThan(0);
  });

  it("loggedGoto delegates to gotoWithRetries and takes navigation screenshots", async () => {
    await loggedGoto(page, "http://example.test/page", "Example Page", "target/test-shots");
    // gotoWithRetries takes 3 screenshots during happy path and calls goto
    expect(page.gotos[0]).toBe("http://example.test/page");
    expect(page.shots.length).toBeGreaterThan(0);
  });
});
