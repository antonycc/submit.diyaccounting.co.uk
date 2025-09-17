// app/unit-tests/eventToGovClientHeaders.test.js

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import eventToGovClientHeaders from "@app/lib/eventToGovClientHeaders.js";

describe("eventToGovClientHeaders", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should use default values when no environment variables are set", () => {
    const event = {
      headers: {
        "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0",
        "Gov-Client-Device-ID": "device-123",
        "Gov-Client-Public-IP": "192.168.1.100",
      },
    };
    const detectedIP = "203.0.113.1";

    const result = eventToGovClientHeaders(event, detectedIP);

    expect(result.govClientHeaders["Gov-Vendor-Forwarded"]).toBe("by=203.0.113.6&for=203.0.113.1");
    expect(result.govClientHeaders["Gov-Vendor-Product-Name"]).toBe("DIY Accounting Submit");
    expect(result.govClientHeaders["Gov-Vendor-Version"]).toBe("web-submit-diyaccounting-co-uk-0.0.2-4");
  });

  it("should use environment variables for Gov-Vendor headers", () => {
    process.env.DIY_SUBMIT_SERVER_IP = "10.0.0.1";
    process.env.DIY_SUBMIT_SOFTWARE_NAME = "custom-software";
    process.env.DIY_SUBMIT_SOFTWARE_LICENSE_HASH = "ABC123";
    process.env.DIY_SUBMIT_GOV_VENDOR_PRODUCT_NAME = "Custom VAT Software";
    process.env.DIY_SUBMIT_GOV_VENDOR_VERSION = "custom-v1.0.0";

    const event = {
      headers: {
        "Gov-Client-Public-IP": "192.168.1.100",
      },
    };
    const detectedIP = "203.0.113.1";

    const result = eventToGovClientHeaders(event, detectedIP);

    expect(result.govClientHeaders["Gov-Vendor-Forwarded"]).toBe("by=10.0.0.1&for=203.0.113.1");
    expect(result.govClientHeaders["Gov-Vendor-License-IDs"]).toBe("custom-software=ABC123");
    expect(result.govClientHeaders["Gov-Vendor-Product-Name"]).toBe("Custom VAT Software");
    expect(result.govClientHeaders["Gov-Vendor-Version"]).toBe("custom-v1.0.0");
  });

  it("should detect IP when Gov-Client-Public-IP is SERVER_DETECT", () => {
    const event = {
      headers: {
        "Gov-Client-Public-IP": "SERVER_DETECT",
      },
    };
    const detectedIP = "203.0.113.1";

    const result = eventToGovClientHeaders(event, detectedIP);

    expect(result.govClientHeaders["Gov-Client-Public-IP"]).toBe("203.0.113.1");
  });

  it("should detect IP when Gov-Client-Public-IP is missing", () => {
    const event = {
      headers: {},
    };
    const detectedIP = "203.0.113.1";

    const result = eventToGovClientHeaders(event, detectedIP);

    expect(result.govClientHeaders["Gov-Client-Public-IP"]).toBe("203.0.113.1");
  });

  it("should preserve provided Gov-Client-Public-IP when valid", () => {
    const event = {
      headers: {
        "Gov-Client-Public-IP": "192.168.1.100",
      },
    };
    const detectedIP = "203.0.113.1";

    const result = eventToGovClientHeaders(event, detectedIP);

    expect(result.govClientHeaders["Gov-Client-Public-IP"]).toBe("192.168.1.100");
  });

  it("should validate required headers when validation is enabled", () => {
    process.env.DIY_SUBMIT_VALIDATE_GOV_HEADERS = "true";

    const event = {
      headers: {
        // Missing most required headers
        "Gov-Client-Public-IP": "192.168.1.100",
      },
    };
    const detectedIP = "203.0.113.1";

    const result = eventToGovClientHeaders(event, detectedIP);

    expect(result.govClientErrorMessages).toContain("Gov-Client-Public-IP-Timestamp is required");
    expect(result.govClientErrorMessages).toContain("Gov-Client-Browser-JS-User-Agent is required for web applications");
    expect(result.govClientErrorMessages).toContain("Gov-Client-Screens is required");
    expect(result.govClientErrorMessages).toContain("Gov-Client-Window-Size is required");
    expect(result.govClientErrorMessages).toContain("Gov-Client-Timezone is required");
  });

  it("should pass validation when all required headers are provided", () => {
    process.env.DIY_SUBMIT_VALIDATE_GOV_HEADERS = "true";

    const event = {
      headers: {
        "Gov-Client-Public-IP": "192.168.1.100",
        "Gov-Client-Public-IP-Timestamp": "2023-01-01T12:00:00.000Z",
        "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0",
        "Gov-Client-Screens": "width=1920&height=1080&scaling-factor=1&colour-depth=24",
        "Gov-Client-Window-Size": "width=1200&height=800",
        "Gov-Client-Timezone": "UTC+00",
      },
    };
    const detectedIP = "203.0.113.1";

    const result = eventToGovClientHeaders(event, detectedIP);

    expect(result.govClientErrorMessages).toEqual([]);
  });

  it("should not validate when validation is disabled", () => {
    process.env.DIY_SUBMIT_VALIDATE_GOV_HEADERS = "false";

    const event = {
      headers: {
        // Missing all headers
      },
    };
    const detectedIP = "203.0.113.1";

    const result = eventToGovClientHeaders(event, detectedIP);

    expect(result.govClientErrorMessages).toEqual([]);
  });

  it("should reject unknown IP addresses when validation is enabled", () => {
    process.env.DIY_SUBMIT_VALIDATE_GOV_HEADERS = "true";

    const event = {
      headers: {
        "Gov-Client-Public-IP": "unknown",
        "Gov-Client-Public-IP-Timestamp": "2023-01-01T12:00:00.000Z",
        "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0",
        "Gov-Client-Screens": "width=1920&height=1080&scaling-factor=1&colour-depth=24",
        "Gov-Client-Window-Size": "width=1200&height=800",
        "Gov-Client-Timezone": "UTC+00",
      },
    };
    const detectedIP = "unknown";

    const result = eventToGovClientHeaders(event, detectedIP);

    expect(result.govClientErrorMessages).toContain("Gov-Client-Public-IP is required and must be a valid IP address");
  });

  it("should pass through all Gov-Client headers", () => {
    const event = {
      headers: {
        "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0",
        "Gov-Client-Device-ID": "device-123",
        "Gov-Client-Multi-Factor": "totp=123456",
        "Gov-Client-Public-IP": "192.168.1.100",
        "Gov-Client-Public-IP-Timestamp": "2023-01-01T12:00:00.000Z",
        "Gov-Client-Public-Port": "443",
        "Gov-Client-Screens": "width=1920&height=1080",
        "Gov-Client-Timezone": "UTC+00",
        "Gov-Client-User-IDs": "user=abc123",
        "Gov-Client-Window-Size": "width=1200&height=800",
        "Gov-Vendor-Public-IP": "10.0.0.1",
      },
    };
    const detectedIP = "203.0.113.1";

    const result = eventToGovClientHeaders(event, detectedIP);

    expect(result.govClientHeaders["Gov-Client-Browser-JS-User-Agent"]).toBe("Mozilla/5.0");
    expect(result.govClientHeaders["Gov-Client-Device-ID"]).toBe("device-123");
    expect(result.govClientHeaders["Gov-Client-Multi-Factor"]).toBe("totp=123456");
    expect(result.govClientHeaders["Gov-Client-Public-IP"]).toBe("192.168.1.100");
    expect(result.govClientHeaders["Gov-Client-Public-IP-Timestamp"]).toBe("2023-01-01T12:00:00.000Z");
    expect(result.govClientHeaders["Gov-Client-Public-Port"]).toBe("443");
    expect(result.govClientHeaders["Gov-Client-Screens"]).toBe("width=1920&height=1080");
    expect(result.govClientHeaders["Gov-Client-Timezone"]).toBe("UTC+00");
    expect(result.govClientHeaders["Gov-Client-User-IDs"]).toBe("user=abc123");
    expect(result.govClientHeaders["Gov-Client-Window-Size"]).toBe("width=1200&height=800");
    expect(result.govClientHeaders["Gov-Vendor-Public-IP"]).toBe("10.0.0.1");
  });

  it("should use npm package info for version when available", () => {
    process.env.npm_package_name = "test-package";
    process.env.npm_package_version = "1.2.3";

    const event = { headers: {} };
    const detectedIP = "203.0.113.1";

    const result = eventToGovClientHeaders(event, detectedIP);

    expect(result.govClientHeaders["Gov-Vendor-Version"]).toBe("test-package-1.2.3");
  });
});