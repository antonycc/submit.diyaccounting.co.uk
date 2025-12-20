// app/unit-tests/lib/buildFraudHeaders.test.js

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildFraudHeaders } from "../../lib/buildFraudHeaders.js";

describe("buildFraudHeaders", () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      FRAUD_VENDOR_LICENSE_IDS: process.env.FRAUD_VENDOR_LICENSE_IDS,
      FRAUD_VENDOR_PRODUCT_NAME: process.env.FRAUD_VENDOR_PRODUCT_NAME,
      FRAUD_VENDOR_VERSION: process.env.FRAUD_VENDOR_VERSION,
      SERVER_PUBLIC_IP: process.env.SERVER_PUBLIC_IP,
    };

    // Set test environment variables
    process.env.FRAUD_VENDOR_LICENSE_IDS = "my-licensed-software=ABC12345";
    process.env.FRAUD_VENDOR_PRODUCT_NAME = "DIY Accounting Submit";
    process.env.FRAUD_VENDOR_VERSION = "1.0.0";
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

  it("should build vendor forwarded chain from x-forwarded-for", () => {
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1, 203.0.113.5",
      },
      requestContext: {
        authorizer: { claims: { sub: "user123" } },
      },
    };

    const headers = buildFraudHeaders(event);

    // Gov-Vendor-Forwarded should now be a JSON array of objects
    const forwarded = JSON.parse(headers["Gov-Vendor-Forwarded"]);
    expect(Array.isArray(forwarded)).toBe(true);
    expect(forwarded).toEqual([
      { by: "198.51.100.1", for: "198.51.100.1" },
      { by: "198.51.100.1", for: "203.0.113.5" },
    ]);
  });

  it("should extract public client IP from x-forwarded-for", () => {
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1, 10.0.0.5, 203.0.113.6",
      },
      requestContext: {},
    };

    const headers = buildFraudHeaders(event);

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

    const headers = buildFraudHeaders(privateIpEvent);

    // Should not have client IP since all are private
    expect(headers["Gov-Client-Public-IP"]).toBeUndefined();
  });

  it("should include vendor license IDs from environment", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const headers = buildFraudHeaders(event);

    expect(headers["Gov-Vendor-License-IDs"]).toBe("my-licensed-software=ABC12345");
  });

  it("should include vendor product name and version from environment", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const headers = buildFraudHeaders(event);

    // Gov-Vendor-Product-Name should be URL encoded
    expect(headers["Gov-Vendor-Product-Name"]).toBe("DIY%20Accounting%20Submit");
    // Gov-Vendor-Version should be a JSON object
    expect(headers["Gov-Vendor-Version"]).toBe(JSON.stringify({ server: "1.0.0" }));
  });

  it("should set connection method to WEB_APP_VIA_SERVER", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const headers = buildFraudHeaders(event);

    expect(headers["Gov-Client-Connection-Method"]).toBe("WEB_APP_VIA_SERVER");
    expect(headers["Gov-Vendor-Connection-Method"]).toBe("WEB_APP_VIA_SERVER");
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

    const headers = buildFraudHeaders(event);

    expect(headers["Gov-Client-User-IDs"]).toBe("server=cognito-user-abc123");
  });

  it("should use anonymous user ID when not authenticated", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const headers = buildFraudHeaders(event);

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

    const headers = buildFraudHeaders(event);

    expect(headers["Gov-Client-Browser-JS-User-Agent"]).toBe("Mozilla/5.0...");
    expect(headers["Gov-Client-Timezone"]).toBe("Europe/London");
    expect(headers["Gov-Client-Window-Size"]).toBe("1920x1080");
  });

  it("should handle missing x-forwarded-for gracefully", () => {
    const event = {
      headers: {},
      requestContext: {},
    };

    const headers = buildFraudHeaders(event);

    // Should still include vendor headers and connection method
    expect(headers["Gov-Vendor-License-IDs"]).toBe("my-licensed-software=ABC12345");
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

    const headers = buildFraudHeaders(event);

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

    const headers = buildFraudHeaders(event);

    expect(headers["Gov-Vendor-Public-IP"]).toBe("203.0.113.100");
    // Gov-Vendor-Forwarded should now be a JSON array of objects
    const forwarded = JSON.parse(headers["Gov-Vendor-Forwarded"]);
    expect(Array.isArray(forwarded)).toBe(true);
    expect(forwarded).toEqual([{ by: "203.0.113.100", for: "198.51.100.1" }]);
  });
});
