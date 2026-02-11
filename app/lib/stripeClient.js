// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/stripeClient.js

import Stripe from "stripe";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/stripeClient.js" });

const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });

let cachedClient = null;
let cachedSecretKey = null;

async function resolveSecretKey() {
  // Local dev: use env var directly
  if (process.env.STRIPE_SECRET_KEY) {
    return process.env.STRIPE_SECRET_KEY;
  }

  // AWS: resolve from Secrets Manager ARN
  const arn = process.env.STRIPE_SECRET_KEY_ARN;
  if (!arn) {
    throw new Error("Neither STRIPE_SECRET_KEY nor STRIPE_SECRET_KEY_ARN is set");
  }

  const result = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
  return result.SecretString;
}

/**
 * Get a lazy-initialized Stripe SDK client.
 * Caches the client across Lambda warm starts.
 * @returns {Promise<Stripe>}
 */
export async function getStripeClient() {
  const secretKey = await resolveSecretKey();

  // Re-use cached client if secret key hasn't changed
  if (cachedClient && cachedSecretKey === secretKey) {
    return cachedClient;
  }

  const options = {};
  if (process.env.STRIPE_API_BASE_URL) {
    options.apiVersion = "2024-12-18.acacia";
    options.host = new URL(process.env.STRIPE_API_BASE_URL).hostname;
    options.port = new URL(process.env.STRIPE_API_BASE_URL).port;
    options.protocol = new URL(process.env.STRIPE_API_BASE_URL).protocol.replace(":", "");
    logger.info({ message: "Using Stripe API base URL override", baseUrl: process.env.STRIPE_API_BASE_URL });
  }

  cachedClient = new Stripe(secretKey, options);
  cachedSecretKey = secretKey;
  return cachedClient;
}
