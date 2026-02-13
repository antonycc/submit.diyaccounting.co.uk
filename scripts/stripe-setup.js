#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/stripe-setup.js
//
// Idempotent Stripe setup script. Creates products, prices, webhook endpoints,
// and customer portal configuration. Requires STRIPE_SECRET_KEY env var.
//
// Usage: STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js

import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY environment variable is required");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

async function findOrCreateProduct() {
  // Search for existing product by metadata
  const products = await stripe.products.search({
    query: 'metadata["bundleId"]:"resident-pro"',
  });

  if (products.data.length > 0) {
    console.log("Product already exists:", products.data[0].id);
    return products.data[0];
  }

  const product = await stripe.products.create({
    name: "Resident Pro",
    description: "Monthly subscription for DIY Accounting Submit - unlimited VAT returns",
    metadata: { bundleId: "resident-pro" },
  });
  console.log("Created product:", product.id);
  return product;
}

async function findOrCreatePrice(productId) {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: "recurring",
  });

  const existing = prices.data.find(
    (p) => p.unit_amount === 999 && p.currency === "gbp" && p.recurring?.interval === "month",
  );
  if (existing) {
    console.log("Price already exists:", existing.id);
    return existing;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: 999,
    currency: "gbp",
    recurring: { interval: "month" },
    metadata: { bundleId: "resident-pro" },
  });
  console.log("Created price:", price.id);
  return price;
}

async function findOrCreateWebhook(url, description) {
  const webhooks = await stripe.webhookEndpoints.list();
  const existing = webhooks.data.find((w) => w.url === url && w.status !== "disabled");
  if (existing) {
    console.log(`Webhook already exists for ${url}:`, existing.id);
    return existing;
  }

  const webhook = await stripe.webhookEndpoints.create({
    url,
    enabled_events: [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
    ],
    description,
  });
  console.log(`Created webhook for ${url}:`, webhook.id);
  console.log(`  Webhook signing secret:`, webhook.secret);
  return webhook;
}

async function main() {
  console.log("Setting up Stripe resources...\n");

  const product = await findOrCreateProduct();
  const price = await findOrCreatePrice(product.id);

  // CI webhook
  const ciWebhook = await findOrCreateWebhook(
    "https://ci-submit.diyaccounting.co.uk/api/v1/billing/webhook",
    "CI environment webhook",
  );

  // Prod webhook
  const prodWebhook = await findOrCreateWebhook(
    "https://submit.diyaccounting.co.uk/api/v1/billing/webhook",
    "Production environment webhook",
  );

  const mode = STRIPE_SECRET_KEY.startsWith("sk_live_") ? "LIVE" : "TEST";
  console.log(`\n=== Stripe Setup Complete (${mode} mode) ===`);
  console.log("Product ID:", product.id);
  console.log("Price ID:", price.id);
  console.log("CI Webhook ID:", ciWebhook.id);
  console.log("CI Webhook Secret:", ciWebhook.secret || "(already exists — retrieve from Dashboard)");
  console.log("Prod Webhook ID:", prodWebhook.id);
  console.log("Prod Webhook Secret:", prodWebhook.secret || "(already exists — retrieve from Dashboard)");
  console.log("\nNext: run scripts/stripe-setup-secrets.sh to store IDs in AWS Secrets Manager");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
