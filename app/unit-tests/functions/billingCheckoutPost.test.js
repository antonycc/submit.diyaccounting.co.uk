// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

// Mock Stripe SDK
const mockCheckoutSessionsCreate = vi.fn();
vi.mock("stripe", () => {
  return {
    default: class Stripe {
      constructor() {
        this.checkout = {
          sessions: {
            create: mockCheckoutSessionsCreate,
          },
        };
      }
    },
  };
});

// Mock Secrets Manager (stripeClient.js uses it)
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send() {
      return { SecretString: "sk_test_mock" };
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

// Mock EventBridge (activityAlert.js uses it)
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send() {
      return {};
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import { ingestHandler } from "@app/functions/billing/billingCheckoutPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("billingCheckoutPost", () => {
  const validToken = makeIdToken("test-user-sub", { email: "user@example.com" });

  beforeEach(() => {
    mockCheckoutSessionsCreate.mockReset();
    mockCheckoutSessionsCreate.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    });
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.STRIPE_PRICE_ID = "price_test_123";
    process.env.DIY_SUBMIT_BASE_URL = "https://test-submit.diyaccounting.co.uk/";
    process.env.USER_SUB_HASH_SALT = "test-salt-for-unit-tests";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 200 with checkout URL on success", async () => {
    const event = buildEventWithToken(validToken);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
  });

  test("creates checkout session with correct parameters", async () => {
    const event = buildEventWithToken(validToken);
    await ingestHandler(event);

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockCheckoutSessionsCreate.mock.calls[0][0];

    expect(params.mode).toBe("subscription");
    expect(params.customer_email).toBe("user@example.com");
    expect(params.metadata.bundleId).toBe("resident-pro");
    expect(params.metadata.hashedSub).toBeDefined();
    expect(params.metadata.hashedSub.length).toBe(64); // SHA-256 hex
    expect(params.subscription_data.metadata.hashedSub).toBe(params.metadata.hashedSub);
    expect(params.subscription_data.metadata.bundleId).toBe("resident-pro");
    expect(params.line_items).toEqual([{ price: "price_test_123", quantity: 1 }]);
    expect(params.success_url).toBe(
      "https://test-submit.diyaccounting.co.uk/bundles.html?checkout=success",
    );
    expect(params.cancel_url).toBe(
      "https://test-submit.diyaccounting.co.uk/bundles.html?checkout=canceled",
    );
  });

  test("returns 401 when no authorization header", async () => {
    const event = buildEventWithToken(null);
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(401);
  });

  test("returns 401 for invalid token", async () => {
    const event = buildEventWithToken("not-a-jwt");
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(401);
  });

  test("returns 500 when no price ID configured", async () => {
    delete process.env.STRIPE_PRICE_ID;
    delete process.env.STRIPE_TEST_PRICE_ID;
    const event = buildEventWithToken(validToken);
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toContain("configuration");
  });

  test("returns 500 when Stripe API fails", async () => {
    mockCheckoutSessionsCreate.mockRejectedValue(new Error("Stripe API error"));
    const event = buildEventWithToken(validToken);
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(500);
  });

  test("uses STRIPE_TEST_PRICE_ID as fallback when STRIPE_PRICE_ID not set", async () => {
    delete process.env.STRIPE_PRICE_ID;
    process.env.STRIPE_TEST_PRICE_ID = "price_test_fallback";
    const event = buildEventWithToken(validToken);
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_test_fallback");
  });
});
