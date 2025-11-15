// app/unit-tests/checkSubscriptions.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler } from "../functions/ops/checkSubscriptions.js";

describe("checkSubscriptions Lambda", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Disable Stripe by default for tests
    delete process.env.STRIPE_SECRET_KEY_ARN;
    delete process.env.STRIPE_SECRET_KEY;
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe("handler", () => {
    it("should return skipped when Stripe is not enabled", async () => {
      const event = {
        source: "eventbridge-schedule",
        deploymentName: "test",
        action: "checkSubscriptions",
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain("Stripe not enabled");
      expect(body.checked).toBe(0);
    });

    it("should return success when no subscription bundles exist", async () => {
      // Enable Stripe but with no bundles to check
      process.env.STRIPE_SECRET_KEY = "sk_test_123";
      process.env.BUNDLE_DYNAMODB_TABLE_NAME = "";

      const event = {
        source: "eventbridge-schedule",
        deploymentName: "test",
        action: "checkSubscriptions",
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.checked).toBe(0);
    });
  });
});
