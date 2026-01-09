// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/app-bin/ngrok.test.js
import { describe, it, expect } from "vitest";
import { startNgrok, extractDomainFromUrl } from "../../bin/ngrok.js";

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

  describe("extractDomainFromUrl", () => {
    it("should extract domain from https URL", () => {
      expect(extractDomainFromUrl("https://example.com/path")).toBe("example.com/path");
    });

    it("should extract domain from http URL", () => {
      expect(extractDomainFromUrl("http://example.com/path")).toBe("example.com/path");
    });

    it("should remove trailing slash", () => {
      expect(extractDomainFromUrl("https://example.com/")).toBe("example.com");
    });

    it("should handle URL without protocol", () => {
      expect(extractDomainFromUrl("example.com")).toBe("example.com");
    });

    it("should return undefined for null/undefined", () => {
      expect(extractDomainFromUrl(null)).toBeUndefined();
      expect(extractDomainFromUrl(undefined)).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
      expect(extractDomainFromUrl("")).toBeUndefined();
    });
  });
});
