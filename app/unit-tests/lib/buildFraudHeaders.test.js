// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/lib/buildFraudHeaders.test.js

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { buildFraudHeaders } from "../../lib/buildFraudHeaders.js";

// Read package info for test assertions (strip scope if present)
const { name: rawPackageName, version: packageVersion } = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url)));
const packageName = rawPackageName.startsWith("@") ? rawPackageName.split("/")[1] : rawPackageName;

describe("buildFraudHeaders", () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      SERVER_PUBLIC_IP: process.env.SERVER_PUBLIC_IP,
    };
  });

  afterEach(() => {
    // Restore original environment
    Object.keys(originalEnv).forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  it("should return govClientHeaders and govClientErrorMessages", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const result = buildFraudHeaders(event);

    expect(result).toHaveProperty("govClientHeaders");
    expect(result).toHaveProperty("govClientErrorMessages");
    expect(Array.isArray(result.govClientErrorMessages)).toBe(true);
  });

  it("should build vendor forwarded chain from x-forwarded-for", () => {
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1, 203.0.113.5",
      },
      requestContext: {
        authorizer: { claims: { sub: "user123" } },
      },
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    // Gov-Vendor-Forwarded should now be a JSON array of objects
    const forwarded = headers["Gov-Vendor-Forwarded"];
    expect(forwarded).toEqual("by=198.51.100.1&for=198.51.100.1,by=198.51.100.1&for=203.0.113.5");
  });

  it("should extract public client IP from x-forwarded-for", () => {
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1, 10.0.0.5, 203.0.113.6",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    // Should use first public IP (198.51.100.1), not private IP (10.0.0.5)
    expect(headers["Gov-Client-Public-IP"]).toBe("198.51.100.1");
  });

  it("should exclude private IP ranges", () => {
    const privateIpEvent = {
      headers: {
        "x-forwarded-for": "10.1.2.3, 192.168.1.1, 172.16.0.5",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(privateIpEvent);

    // Should not have client IP since all are private
    expect(headers["Gov-Client-Public-IP"]).toBeUndefined();
  });

  it("should include vendor product name and version from environment", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Vendor-Product-Name"]).toBe(packageName);
    expect(headers["Gov-Vendor-Version"]).toBe(`${packageName}=${packageVersion}`);
  });

  it("should set connection method to WEB_APP_VIA_SERVER", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-Connection-Method"]).toBe("WEB_APP_VIA_SERVER");
  });

  it("should extract user ID from Cognito authorizer claims", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {
        authorizer: {
          claims: { sub: "cognito-user-abc123" },
        },
      },
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-User-IDs"]).toBe("server=cognito-user-abc123");
  });

  it("should use anonymous user ID when not authenticated", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-User-IDs"]).toBe("server=anonymous");
  });

  it("should pass through client-side headers", () => {
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1",
        "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0...",
        "Gov-Client-Timezone": "Europe/London",
        "Gov-Client-Window-Size": "1920x1080",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-Browser-JS-User-Agent"]).toBe("Mozilla/5.0...");
    expect(headers["Gov-Client-Timezone"]).toBe("Europe/London");
    expect(headers["Gov-Client-Window-Size"]).toBe("1920x1080");
  });

  it("should handle missing x-forwarded-for gracefully", () => {
    const event = {
      headers: {},
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    // Should still include vendor headers and connection method
    expect(headers["Gov-Client-Connection-Method"]).toBe("WEB_APP_VIA_SERVER");
    expect(headers["Gov-Client-User-IDs"]).toBe("server=anonymous");
  });

  it("should use device ID from x-device-id header", () => {
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1",
        "x-device-id": "device-uuid-12345",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-Device-ID"]).toBe("device-uuid-12345");
  });

  it("should use SERVER_PUBLIC_IP environment variable if set", () => {
    process.env.SERVER_PUBLIC_IP = "203.0.113.100";

    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Vendor-Public-IP"]).toBe("203.0.113.100");
    const forwarded = headers["Gov-Vendor-Forwarded"];
    expect(forwarded).toEqual("by=203.0.113.100&for=198.51.100.1");
  });
});
