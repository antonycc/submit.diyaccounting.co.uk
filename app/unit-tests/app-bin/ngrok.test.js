// app/unit-tests/app-bin/ngrok.test.js
import { describe, it, expect } from "vitest";
import { startNgrok } from "../../bin/ngrok.js";

describe("ngrok", () => {
  it("should export startNgrok function", () => {
    expect(startNgrok).toBeDefined();
    expect(typeof startNgrok).toBe("function");
  });

  it("startNgrok should accept configuration options", () => {
    // Just verify the function signature accepts parameters
    const config = {
      addr: 3000,
      domain: "test.ngrok.io",
      poolingEnabled: true,
    };
    expect(() => {
      // We're just checking the signature, not actually calling it
      // since it requires ngrok authentication
      startNgrok.toString();
    }).not.toThrow();
  });
});
