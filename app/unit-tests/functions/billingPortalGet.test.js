// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

// Mock Stripe SDK
const mockBillingPortalSessionsCreate = vi.fn();
vi.mock("stripe", () => {
  return {
    default: class Stripe {
      constructor() {
        this.billingPortal = {
          sessions: {
            create: mockBillingPortalSessionsCreate,
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

// Mock DynamoDB bundle repository
const mockGetUserBundles = vi.fn();
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: (...args) => mockGetUserBundles(...args),
}));

import { ingestHandler } from "@app/functions/billing/billingPortalGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("billingPortalGet", () => {
  const validToken = makeIdToken("test-user-sub", { email: "user@example.com" });

  beforeEach(() => {
    mockBillingPortalSessionsCreate.mockReset();
    mockGetUserBundles.mockReset();

    mockBillingPortalSessionsCreate.mockResolvedValue({
      url: "https://billing.stripe.com/p/session/test_portal_session",
    });

    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.DIY_SUBMIT_BASE_URL = "https://test-submit.diyaccounting.co.uk/";
    process.env.USER_SUB_HASH_SALT = "test-salt-for-unit-tests";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 401 when no authorization header", async () => {
    const event = buildEventWithToken(null);
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(401);
  });

  test("returns 404 when user has no subscription bundles", async () => {
    mockGetUserBundles.mockResolvedValue([
      { bundleId: "day-guest", allocated: true },
    ]);

    const event = buildEventWithToken(validToken);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.message).toContain("No active subscription");
  });

  test("returns 200 with portal URL when user has subscription", async () => {
    mockGetUserBundles.mockResolvedValue([
      { bundleId: "resident-pro", allocated: true, stripeCustomerId: "cus_test_123", stripeSubscriptionId: "sub_test_456" },
    ]);

    const event = buildEventWithToken(validToken);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.portalUrl).toBe("https://billing.stripe.com/p/session/test_portal_session");
  });

  test("creates portal session with correct parameters", async () => {
    mockGetUserBundles.mockResolvedValue([
      { bundleId: "resident-pro", stripeCustomerId: "cus_test_789" },
    ]);

    const event = buildEventWithToken(validToken);
    await ingestHandler(event);

    expect(mockBillingPortalSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockBillingPortalSessionsCreate.mock.calls[0][0];
    expect(params.customer).toBe("cus_test_789");
    expect(params.return_url).toBe("https://test-submit.diyaccounting.co.uk/bundles.html");
  });

  test("returns 500 when Stripe API fails", async () => {
    mockGetUserBundles.mockResolvedValue([
      { bundleId: "resident-pro", stripeCustomerId: "cus_test_123" },
    ]);
    mockBillingPortalSessionsCreate.mockRejectedValue(new Error("Stripe API error"));

    const event = buildEventWithToken(validToken);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(500);
  });
});
