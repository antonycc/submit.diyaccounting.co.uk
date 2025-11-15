// app/lib/stripeHelper.js

import logger from "./logger.js";

let __stripeInstance;
let __stripeSecretKey;

/**
 * Get or initialize Stripe instance with secret key from environment or AWS Secrets Manager
 * @returns {Promise<import('stripe').Stripe>} Stripe instance
 */
async function getStripeInstance() {
  if (__stripeInstance) {
    return __stripeInstance;
  }

  // Get secret key from environment or Secrets Manager
  if (!__stripeSecretKey) {
    const secretKeyArn = process.env.STRIPE_SECRET_KEY_ARN;
    if (secretKeyArn) {
      // Load from AWS Secrets Manager
      try {
        const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
        const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
        const response = await client.send(new GetSecretValueCommand({ SecretId: secretKeyArn }));
        __stripeSecretKey = response.SecretString;
        logger.info({ message: "Loaded Stripe secret key from Secrets Manager", secretKeyArn });
      } catch (error) {
        logger.error({ message: "Failed to load Stripe secret key from Secrets Manager", error: error.message });
        throw new Error("Failed to load Stripe secret key");
      }
    } else {
      // Use test key for local development
      __stripeSecretKey = process.env.STRIPE_SECRET_KEY || "sk_test_local";
      logger.warn({ message: "Using local Stripe secret key (test mode)" });
    }
  }

  // Initialize Stripe
  const Stripe = (await import("stripe")).default;
  __stripeInstance = new Stripe(__stripeSecretKey, {
    apiVersion: "2024-11-20.acacia",
  });

  return __stripeInstance;
}

/**
 * Check if a subscription is active for a customer
 * @param {string} customerId - Stripe customer ID
 * @param {string} priceId - Stripe price ID to check subscription for
 * @returns {Promise<{active: boolean, subscriptionId?: string, currentPeriodEnd?: string}>}
 */
export async function checkSubscriptionStatus(customerId, priceId) {
  try {
    if (!customerId) {
      logger.debug({ message: "No customer ID provided for subscription check" });
      return { active: false };
    }

    const stripe = await getStripeInstance();

    // Get active subscriptions for the customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 100,
    });

    // Check if any subscription includes the specified price
    for (const subscription of subscriptions.data) {
      const hasPriceId = subscription.items.data.some((item) => item.price.id === priceId);
      if (hasPriceId) {
        logger.info({
          message: "Active subscription found",
          customerId,
          subscriptionId: subscription.id,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
        });
        return {
          active: true,
          subscriptionId: subscription.id,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
        };
      }
    }

    logger.info({ message: "No active subscription found for price", customerId, priceId });
    return { active: false };
  } catch (error) {
    logger.error({
      message: "Error checking subscription status",
      error: error.message,
      customerId,
      priceId,
    });
    throw error;
  }
}

/**
 * Validate a Stripe webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @returns {Promise<Object>} Parsed webhook event
 */
export async function validateWebhookSignature(payload, signature) {
  try {
    const stripe = await getStripeInstance();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET not configured");
    }

    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    logger.info({ message: "Webhook signature validated", eventType: event.type });
    return event;
  } catch (error) {
    logger.error({ message: "Webhook signature validation failed", error: error.message });
    throw error;
  }
}

/**
 * Get or create a Stripe customer for a user
 * @param {string} userId - User ID (sub claim)
 * @param {string} email - User email
 * @returns {Promise<string>} Stripe customer ID
 */
export async function getOrCreateCustomer(userId, email) {
  try {
    const stripe = await getStripeInstance();

    // Search for existing customer by metadata
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      const customerId = existingCustomers.data[0].id;
      logger.info({ message: "Found existing Stripe customer", customerId, userId });
      return customerId;
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: email,
      metadata: {
        userId: userId,
      },
    });

    logger.info({ message: "Created new Stripe customer", customerId: customer.id, userId });
    return customer.id;
  } catch (error) {
    logger.error({ message: "Error creating Stripe customer", error: error.message, userId, email });
    throw error;
  }
}

/**
 * Check if Stripe is enabled
 * @returns {boolean}
 */
export function isStripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY_ARN || process.env.STRIPE_SECRET_KEY);
}

/**
 * Reset the Stripe instance (for testing)
 */
export function resetStripeInstance() {
  __stripeInstance = null;
  __stripeSecretKey = null;
}
