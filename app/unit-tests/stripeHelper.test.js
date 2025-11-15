// app/unit-tests/stripeHelper.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkSubscriptionStatus, isStripeEnabled, resetStripeInstance } from "../lib/stripeHelper.js";

describe("stripeHelper", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    resetStripeInstance();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    resetStripeInstance();
  });

  describe("isStripeEnabled", () => {
    it("should return false when no Stripe credentials are set", () => {
      delete process.env.STRIPE_SECRET_KEY_ARN;
      delete process.env.STRIPE_SECRET_KEY;
      expect(isStripeEnabled()).toBe(false);
    });

    it("should return true when STRIPE_SECRET_KEY_ARN is set", () => {
      process.env.STRIPE_SECRET_KEY_ARN = "arn:aws:secretsmanager:eu-west-2:123456789012:secret:test";
      expect(isStripeEnabled()).toBe(true);
    });

    it("should return true when STRIPE_SECRET_KEY is set", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_123";
      expect(isStripeEnabled()).toBe(true);
    });
  });

  describe("checkSubscriptionStatus", () => {
    it("should return inactive when no customer ID provided", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_123";
      const result = await checkSubscriptionStatus(null, "price_123");
      expect(result).toEqual({ active: false });
    });

    it("should return inactive when empty customer ID provided", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_123";
      const result = await checkSubscriptionStatus("", "price_123");
      expect(result).toEqual({ active: false });
    });
  });
});
