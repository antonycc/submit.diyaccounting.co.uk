// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/billing/billingWebhookPost.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest } from "../../lib/httpResponseHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { getStripeClient } from "../../lib/stripeClient.js";
import { putBundleByHashedSub } from "../../data/dynamoDbBundleRepository.js";
import { putSubscription } from "../../data/dynamoDbSubscriptionRepository.js";
import { loadCatalogFromRoot } from "../../services/productCatalog.js";
import { publishActivityEvent, maskEmail } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/billing/billingWebhookPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/billing/webhook", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}
/* v8 ignore stop */

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

let cachedWebhookSecret = null;

async function resolveWebhookSecret() {
  if (cachedWebhookSecret) return cachedWebhookSecret;

  // Local dev: use env var directly
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret && !secret.startsWith("arn:")) {
    cachedWebhookSecret = secret;
    return secret;
  }

  // AWS: resolve from Secrets Manager ARN
  const arn = secret || process.env.STRIPE_WEBHOOK_SECRET_ARN;
  if (arn && arn.startsWith("arn:")) {
    const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
    const result = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
    cachedWebhookSecret = result.SecretString;
    return cachedWebhookSecret;
  }

  const testSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET;
  if (testSecret) {
    cachedWebhookSecret = testSecret;
    return testSecret;
  }

  throw new Error("No Stripe webhook secret configured");
}

function getCatalogTokensGranted(bundleId) {
  try {
    const catalog = loadCatalogFromRoot();
    const catalogBundle = (catalog.bundles || []).find((b) => b.id === bundleId);
    return catalogBundle?.tokensGranted ?? 100;
  } catch {
    return 100;
  }
}

async function handleCheckoutComplete(session) {
  const hashedSub = session.metadata?.hashedSub || session.client_reference_id;
  const bundleId = session.metadata?.bundleId || "resident-pro";
  const subscriptionId = session.subscription;
  const customerId = session.customer;
  const customerEmail = session.customer_email || session.customer_details?.email || "";

  if (!hashedSub) {
    logger.error({ message: "checkout.session.completed missing hashedSub in metadata", sessionId: session.id });
    return;
  }

  logger.info({ message: "Processing checkout.session.completed", hashedSub, bundleId, subscriptionId });

  // Retrieve subscription details from Stripe for period info
  let currentPeriodEnd = null;
  let currentPeriodStart = null;
  if (subscriptionId) {
    try {
      const stripe = await getStripeClient();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      currentPeriodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;
      currentPeriodStart = subscription.current_period_start
        ? new Date(subscription.current_period_start * 1000).toISOString()
        : null;
    } catch (error) {
      logger.warn({ message: "Failed to retrieve subscription details", subscriptionId, error: error.message });
    }
  }

  // Grant bundle using hashedSub directly (webhook doesn't know the original user sub)
  const tokensGranted = getCatalogTokensGranted(bundleId);
  const tokenRefreshDate = currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const bundleRecord = {
    bundleId,
    expiry: currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    tokensGranted,
    tokensConsumed: 0,
    tokenResetAt: tokenRefreshDate,
    stripeSubscriptionId: subscriptionId || null,
    stripeCustomerId: customerId || null,
    subscriptionStatus: "active",
    currentPeriodEnd: currentPeriodEnd || null,
    cancelAtPeriodEnd: false,
  };

  await putBundleByHashedSub(hashedSub, bundleRecord);
  logger.info({ message: "Bundle granted via webhook", hashedSub, bundleId, tokensGranted });

  // Store subscription record for audit trail
  if (subscriptionId) {
    await putSubscription({
      pk: `stripe#${subscriptionId}`,
      hashedSub,
      stripeCustomerId: customerId || null,
      bundleId,
      status: "active",
      currentPeriodStart,
      currentPeriodEnd,
      canceledAt: null,
      createdAt: new Date().toISOString(),
    });
    logger.info({ message: "Subscription record stored", subscriptionId, hashedSub });
  }

  publishActivityEvent({
    event: "subscription-activated",
    site: "submit",
    summary: `Subscription activated: ${bundleId} for ${maskEmail(customerEmail)}`,
    flow: "user-journey",
    detail: { bundleId, subscriptionId },
  }).catch(() => {});
}

async function handleInvoicePaid(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) {
    logger.info({ message: "invoice.paid without subscription, skipping", invoiceId: invoice.id });
    return;
  }

  logger.info({ message: "Processing invoice.paid", subscriptionId, invoiceId: invoice.id });
  // Renewal token refresh will be implemented in Phase 5
}

async function handleSubscriptionUpdated(subscription) {
  logger.info({
    message: "Processing customer.subscription.updated",
    subscriptionId: subscription.id,
    status: subscription.status,
  });
  // Status change handling will be implemented in Phase 5
}

async function handleSubscriptionDeleted(subscription) {
  logger.info({
    message: "Processing customer.subscription.deleted",
    subscriptionId: subscription.id,
  });
  // Cancellation handling will be implemented in Phase 5
}

async function handlePaymentFailed(invoice) {
  logger.warn({
    message: "Processing invoice.payment_failed",
    subscriptionId: invoice.subscription,
    invoiceId: invoice.id,
  });
  // Payment failure handling will be implemented in Phase 5
}

export async function ingestHandler(event) {
  const { request } = extractRequest(event);
  const rawBody = event.body || "";
  const sig = event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"] || "";

  if (!sig) {
    logger.warn({ message: "Missing stripe-signature header" });
    return jsonResponse(400, { error: "Missing stripe-signature header" });
  }

  // Verify webhook signature
  let stripeEvent;
  try {
    const webhookSecret = await resolveWebhookSecret();
    const stripe = await getStripeClient();
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (error) {
    logger.warn({ message: "Webhook signature verification failed", error: error.message });
    return jsonResponse(400, { error: "Invalid webhook signature" });
  }

  logger.info({ message: "Webhook event received", type: stripeEvent.type, eventId: stripeEvent.id });

  // Route events to handlers
  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed":
        await handleCheckoutComplete(stripeEvent.data.object);
        break;
      case "invoice.paid":
        await handleInvoicePaid(stripeEvent.data.object);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(stripeEvent.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(stripeEvent.data.object);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(stripeEvent.data.object);
        break;
      case "charge.refunded":
        logger.info({ message: "Charge refunded (audit log)", chargeId: stripeEvent.data.object.id });
        break;
      case "charge.dispute.created":
        logger.warn({ message: "Dispute created (alert)", chargeId: stripeEvent.data.object.id });
        break;
      default:
        logger.info({ message: "Unhandled webhook event type", type: stripeEvent.type });
    }
  } catch (error) {
    logger.error({ message: "Error processing webhook event", type: stripeEvent.type, error: error.message });
    return jsonResponse(500, { error: "Webhook processing error" });
  }

  return jsonResponse(200, { received: true });
}
