// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/billing/billingWebhookPost.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest } from "../../lib/httpResponseHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { getStripeClient } from "../../lib/stripeClient.js";
import { putBundleByHashedSub, updateBundleSubscriptionFields, resetTokensByHashedSub } from "../../data/dynamoDbBundleRepository.js";
import { initializeSalt } from "../../services/subHasher.js";
import { putSubscription, getSubscription, updateSubscription } from "../../data/dynamoDbSubscriptionRepository.js";
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
let cachedTestWebhookSecret = null;

async function resolveWebhookSecret({ test = false } = {}) {
  if (test) {
    if (cachedTestWebhookSecret) return cachedTestWebhookSecret;

    // Local dev: direct env var
    const testSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET;
    if (testSecret && !testSecret.startsWith("arn:")) {
      cachedTestWebhookSecret = testSecret;
      return testSecret;
    }

    // AWS: resolve from Secrets Manager ARN
    const testArn = testSecret || process.env.STRIPE_TEST_WEBHOOK_SECRET_ARN;
    if (testArn && testArn.startsWith("arn:")) {
      const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
      const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
      const result = await smClient.send(new GetSecretValueCommand({ SecretId: testArn }));
      cachedTestWebhookSecret = result.SecretString;
      return cachedTestWebhookSecret;
    }

    // Fall through to live secret if no test secret configured
    logger.warn({ message: "No test webhook secret configured, falling through to live secret" });
  }

  // Live mode (or fallback from test when no test secret configured)
  if (cachedWebhookSecret) return cachedWebhookSecret;

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret && !secret.startsWith("arn:")) {
    cachedWebhookSecret = secret;
    return secret;
  }

  const arn = secret || process.env.STRIPE_WEBHOOK_SECRET_ARN;
  if (arn && arn.startsWith("arn:")) {
    const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
    const result = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
    cachedWebhookSecret = result.SecretString;
    return cachedWebhookSecret;
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

async function handleCheckoutComplete(session, { test = false } = {}) {
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
      const stripe = await getStripeClient({ test });
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
      currentPeriodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null;
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
    qualifiers: { sandbox: test },
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

async function handleInvoicePaid(invoice, { test = false } = {}) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) {
    logger.info({ message: "invoice.paid without subscription, skipping", invoiceId: invoice.id });
    return;
  }

  logger.info({ message: "Processing invoice.paid", subscriptionId, invoiceId: invoice.id });

  const subRecord = await getSubscription(`stripe#${subscriptionId}`);
  if (!subRecord) {
    logger.warn({ message: "No subscription record found for invoice.paid", subscriptionId });
    return;
  }

  const { hashedSub, bundleId } = subRecord;
  const tokensGranted = getCatalogTokensGranted(bundleId);

  // Retrieve subscription for updated period info
  let currentPeriodEnd = null;
  try {
    const stripe = await getStripeClient({ test });
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
  } catch (error) {
    logger.warn({ message: "Failed to retrieve subscription for token refresh", subscriptionId, error: error.message });
  }

  const nextResetAt = currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Reset tokens for the new billing period
  await resetTokensByHashedSub(hashedSub, bundleId, tokensGranted, nextResetAt);

  // Update period dates on the bundle
  await updateBundleSubscriptionFields(hashedSub, bundleId, {
    currentPeriodEnd: currentPeriodEnd || nextResetAt,
    expiry: currentPeriodEnd || nextResetAt,
  });

  // Update subscription record
  await updateSubscription(`stripe#${subscriptionId}`, {
    currentPeriodEnd,
    status: "active",
  });

  logger.info({ message: "Tokens refreshed on invoice.paid", hashedSub, bundleId, tokensGranted });

  publishActivityEvent({
    event: "subscription-renewed",
    site: "submit",
    summary: `Subscription renewed: ${bundleId}`,
    flow: "user-journey",
    detail: { bundleId, subscriptionId },
  }).catch(() => {});
}

async function handleSubscriptionUpdated(subscription) {
  logger.info({
    message: "Processing customer.subscription.updated",
    subscriptionId: subscription.id,
    status: subscription.status,
  });

  const subRecord = await getSubscription(`stripe#${subscription.id}`);
  if (!subRecord) {
    logger.warn({ message: "No subscription record found for subscription.updated", subscriptionId: subscription.id });
    return;
  }

  const { hashedSub, bundleId } = subRecord;

  // Update bundle subscription status
  await updateBundleSubscriptionFields(hashedSub, bundleId, {
    subscriptionStatus: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
  });

  // Update subscription record
  await updateSubscription(`stripe#${subscription.id}`, {
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
  });

  logger.info({ message: "Subscription status updated", hashedSub, bundleId, status: subscription.status });
}

async function handleSubscriptionDeleted(subscription) {
  logger.info({
    message: "Processing customer.subscription.deleted",
    subscriptionId: subscription.id,
  });

  const subRecord = await getSubscription(`stripe#${subscription.id}`);
  if (!subRecord) {
    logger.warn({ message: "No subscription record found for subscription.deleted", subscriptionId: subscription.id });
    return;
  }

  const { hashedSub, bundleId } = subRecord;

  // Mark bundle subscription as canceled
  await updateBundleSubscriptionFields(hashedSub, bundleId, {
    subscriptionStatus: "canceled",
    cancelAtPeriodEnd: false,
  });

  // Update subscription record
  await updateSubscription(`stripe#${subscription.id}`, {
    status: "canceled",
    canceledAt: new Date().toISOString(),
  });

  logger.info({ message: "Subscription canceled", hashedSub, bundleId });

  publishActivityEvent({
    event: "subscription-canceled",
    site: "submit",
    summary: `Subscription canceled: ${bundleId}`,
    flow: "user-journey",
    detail: { bundleId, subscriptionId: subscription.id },
  }).catch(() => {});
}

async function handlePaymentFailed(invoice) {
  logger.warn({
    message: "Processing invoice.payment_failed",
    subscriptionId: invoice.subscription,
    invoiceId: invoice.id,
  });

  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const subRecord = await getSubscription(`stripe#${subscriptionId}`);
  if (!subRecord) {
    logger.warn({ message: "No subscription record found for payment_failed", subscriptionId });
    return;
  }

  publishActivityEvent({
    event: "payment-failed",
    site: "submit",
    summary: `Payment failed: ${subRecord.bundleId}`,
    flow: "user-journey",
    detail: { bundleId: subRecord.bundleId, subscriptionId },
  }).catch(() => {});
}

export async function ingestHandler(event) {
  await initializeSalt();
  const { request } = extractRequest(event);
  const rawBody = event.body || "";
  const sig = event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"] || "";

  if (!sig) {
    logger.warn({ message: "Missing stripe-signature header" });
    return jsonResponse(400, { error: "Missing stripe-signature header" });
  }

  // Peek at raw body to determine test/live mode BEFORE signature verification.
  // This is safe: we don't trust the body until after constructEvent succeeds.
  let isTestMode = false;
  try {
    const parsed = JSON.parse(rawBody);
    isTestMode = parsed.livemode === false;
  } catch {
    // If body isn't valid JSON, Stripe verification will fail anyway
  }

  // Verify webhook signature using the correct secret for test/live mode
  let stripeEvent;
  try {
    const webhookSecret = await resolveWebhookSecret({ test: isTestMode });
    const stripe = await getStripeClient();
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (error) {
    logger.warn({ message: "Webhook signature verification failed", error: error.message, isTestMode });
    return jsonResponse(400, { error: "Invalid webhook signature" });
  }

  logger.info({ message: "Webhook event received", type: stripeEvent.type, eventId: stripeEvent.id, isTestMode });

  // Stripe sets livemode=false for test mode events — use this to select the correct API key
  const test = stripeEvent.livemode === false;

  // Route events to handlers
  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed":
        await handleCheckoutComplete(stripeEvent.data.object, { test });
        break;
      case "invoice.paid":
        await handleInvoicePaid(stripeEvent.data.object, { test });
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
