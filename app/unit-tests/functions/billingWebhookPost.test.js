// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import Stripe from "stripe";

// Mock Stripe SDK
const mockSubscriptionsRetrieve = vi.fn();
const mockWebhooksConstructEvent = vi.fn();
vi.mock("stripe", () => {
  return {
    default: class Stripe {
      constructor() {
        this.subscriptions = {
          retrieve: mockSubscriptionsRetrieve,
        };
        this.webhooks = {
          constructEvent: mockWebhooksConstructEvent,
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

// Mock DynamoDB bundle repository
const mockPutBundleByHashedSub = vi.fn();
const mockUpdateBundleSubscriptionFields = vi.fn();
const mockResetTokensByHashedSub = vi.fn();
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  putBundleByHashedSub: (...args) => mockPutBundleByHashedSub(...args),
  updateBundleSubscriptionFields: (...args) => mockUpdateBundleSubscriptionFields(...args),
  resetTokensByHashedSub: (...args) => mockResetTokensByHashedSub(...args),
}));

// Mock DynamoDB subscription repository
const mockPutSubscription = vi.fn();
const mockGetSubscription = vi.fn();
const mockUpdateSubscription = vi.fn();
vi.mock("@app/data/dynamoDbSubscriptionRepository.js", () => ({
  putSubscription: (...args) => mockPutSubscription(...args),
  getSubscription: (...args) => mockGetSubscription(...args),
  updateSubscription: (...args) => mockUpdateSubscription(...args),
}));

import { ingestHandler } from "@app/functions/billing/billingWebhookPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildWebhookEvent(body, sig = "t=123,v1=abc") {
  return {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "stripe-signature": sig,
      "content-type": "application/json",
    },
    requestContext: {
      http: { method: "POST", path: "/api/v1/billing/webhook" },
    },
  };
}

function buildCheckoutSessionPayload(overrides = {}) {
  return {
    id: "evt_test_123",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_abc",
        mode: "subscription",
        subscription: "sub_test_456",
        customer: "cus_test_789",
        client_reference_id: "hashed_sub_value",
        customer_email: "user@example.com",
        metadata: {
          hashedSub: "hashed_sub_value",
          bundleId: "resident-pro",
        },
        ...overrides,
      },
    },
  };
}

describe("billingWebhookPost", () => {
  beforeEach(() => {
    mockWebhooksConstructEvent.mockReset();
    mockSubscriptionsRetrieve.mockReset();
    mockPutBundleByHashedSub.mockReset();
    mockPutSubscription.mockReset();
    mockGetSubscription.mockReset();
    mockUpdateSubscription.mockReset();
    mockUpdateBundleSubscriptionFields.mockReset();
    mockResetTokensByHashedSub.mockReset();

    mockPutBundleByHashedSub.mockResolvedValue(undefined);
    mockPutSubscription.mockResolvedValue(undefined);
    mockUpdateSubscription.mockResolvedValue(undefined);
    mockUpdateBundleSubscriptionFields.mockResolvedValue(undefined);
    mockResetTokensByHashedSub.mockResolvedValue(undefined);
    mockGetSubscription.mockResolvedValue(null);
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_test_456",
      status: "active",
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    });

    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_mock";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 400 when stripe-signature header is missing", async () => {
    const event = {
      body: "{}",
      headers: { "content-type": "application/json" },
      requestContext: { http: { method: "POST", path: "/api/v1/billing/webhook" } },
    };

    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("stripe-signature");
  });

  test("returns 400 when signature verification fails", async () => {
    mockWebhooksConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });

    const event = buildWebhookEvent({ type: "test" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Invalid webhook signature");
  });

  test("returns 200 and grants bundle on checkout.session.completed", async () => {
    const checkoutPayload = buildCheckoutSessionPayload();
    mockWebhooksConstructEvent.mockReturnValue(checkoutPayload);

    const event = buildWebhookEvent(checkoutPayload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.received).toBe(true);

    // Verify bundle was granted
    expect(mockPutBundleByHashedSub).toHaveBeenCalledTimes(1);
    const [hashedSub, bundle] = mockPutBundleByHashedSub.mock.calls[0];
    expect(hashedSub).toBe("hashed_sub_value");
    expect(bundle.bundleId).toBe("resident-pro");
    expect(bundle.tokensGranted).toBe(100);
    expect(bundle.tokensConsumed).toBe(0);
    expect(bundle.subscriptionStatus).toBe("active");
    expect(bundle.stripeSubscriptionId).toBe("sub_test_456");
    expect(bundle.stripeCustomerId).toBe("cus_test_789");
    expect(bundle.cancelAtPeriodEnd).toBe(false);

    // Verify subscription record was stored
    expect(mockPutSubscription).toHaveBeenCalledTimes(1);
    const subRecord = mockPutSubscription.mock.calls[0][0];
    expect(subRecord.pk).toBe("stripe#sub_test_456");
    expect(subRecord.hashedSub).toBe("hashed_sub_value");
    expect(subRecord.bundleId).toBe("resident-pro");
    expect(subRecord.status).toBe("active");
  });

  test("uses client_reference_id as fallback when metadata.hashedSub is missing", async () => {
    const payload = buildCheckoutSessionPayload();
    delete payload.data.object.metadata.hashedSub;
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockPutBundleByHashedSub).toHaveBeenCalledTimes(1);
    const [hashedSub] = mockPutBundleByHashedSub.mock.calls[0];
    expect(hashedSub).toBe("hashed_sub_value");
  });

  test("skips bundle grant when hashedSub is missing from both metadata and client_reference_id", async () => {
    const payload = buildCheckoutSessionPayload({
      client_reference_id: null,
      metadata: { bundleId: "resident-pro" },
    });
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockPutBundleByHashedSub).not.toHaveBeenCalled();
    expect(mockPutSubscription).not.toHaveBeenCalled();
  });

  test("grants bundle even when subscription retrieval fails", async () => {
    mockSubscriptionsRetrieve.mockRejectedValue(new Error("Stripe API error"));
    const payload = buildCheckoutSessionPayload();
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockPutBundleByHashedSub).toHaveBeenCalledTimes(1);
    // Bundle should still have subscription fields with fallback values
    const [, bundle] = mockPutBundleByHashedSub.mock.calls[0];
    expect(bundle.bundleId).toBe("resident-pro");
    expect(bundle.currentPeriodEnd).toBeNull();
  });

  test("invoice.paid refreshes tokens when subscription record exists", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_test_456",
      current_period_end: periodEnd,
    });

    const payload = {
      id: "evt_test_invoice",
      type: "invoice.paid",
      data: {
        object: { id: "in_test_123", subscription: "sub_test_456" },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockResetTokensByHashedSub).toHaveBeenCalledTimes(1);
    expect(mockResetTokensByHashedSub).toHaveBeenCalledWith(
      "hashed_sub_value",
      "resident-pro",
      100,
      expect.any(String),
    );
    expect(mockUpdateBundleSubscriptionFields).toHaveBeenCalledTimes(1);
    expect(mockUpdateSubscription).toHaveBeenCalledTimes(1);
  });

  test("invoice.paid skips when no subscription record found", async () => {
    mockGetSubscription.mockResolvedValue(null);

    const payload = {
      id: "evt_test_invoice",
      type: "invoice.paid",
      data: {
        object: { id: "in_test_123", subscription: "sub_test_456" },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockResetTokensByHashedSub).not.toHaveBeenCalled();
  });

  test("customer.subscription.updated updates bundle status", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });

    const payload = {
      id: "evt_test_sub_update",
      type: "customer.subscription.updated",
      data: {
        object: { id: "sub_test_456", status: "past_due", cancel_at_period_end: false },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockUpdateBundleSubscriptionFields).toHaveBeenCalledWith(
      "hashed_sub_value",
      "resident-pro",
      { subscriptionStatus: "past_due", cancelAtPeriodEnd: false },
    );
    expect(mockUpdateSubscription).toHaveBeenCalledWith(
      "stripe#sub_test_456",
      { status: "past_due", cancelAtPeriodEnd: false },
    );
  });

  test("customer.subscription.deleted marks bundle as canceled", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });

    const payload = {
      id: "evt_test_sub_delete",
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_test_456" },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockUpdateBundleSubscriptionFields).toHaveBeenCalledWith(
      "hashed_sub_value",
      "resident-pro",
      { subscriptionStatus: "canceled", cancelAtPeriodEnd: false },
    );
    expect(mockUpdateSubscription).toHaveBeenCalledWith(
      "stripe#sub_test_456",
      expect.objectContaining({ status: "canceled" }),
    );
  });

  test("returns 200 for unhandled event types", async () => {
    const payload = {
      id: "evt_test_unknown",
      type: "customer.created",
      data: { object: { id: "cus_test_new" } },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockPutBundleByHashedSub).not.toHaveBeenCalled();
  });

  test("returns 500 when bundle grant fails", async () => {
    mockPutBundleByHashedSub.mockRejectedValue(new Error("DynamoDB error"));
    const payload = buildCheckoutSessionPayload();
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("processing error");
  });

  test("sets currentPeriodEnd from Stripe subscription when available", async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_test_456",
      status: "active",
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: periodEnd,
    });

    const payload = buildCheckoutSessionPayload();
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    await ingestHandler(event);

    const [, bundle] = mockPutBundleByHashedSub.mock.calls[0];
    expect(bundle.currentPeriodEnd).toBe(new Date(periodEnd * 1000).toISOString());
    expect(bundle.expiry).toBe(new Date(periodEnd * 1000).toISOString());
  });
});
