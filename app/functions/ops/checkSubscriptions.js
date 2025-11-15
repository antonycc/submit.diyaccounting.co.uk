// app/functions/ops/checkSubscriptions.js

import logger from "../../lib/logger.js";
import { getSubscriptionBundlesForCheck, updateSubscriptionStatus } from "../../lib/dynamoDbBundleStore.js";
import { checkSubscriptionStatus, isStripeEnabled } from "../../lib/stripeHelper.js";

/**
 * Lambda handler for nightly subscription status checks
 * This function is triggered by EventBridge on a schedule
 * @param {Object} event - EventBridge scheduled event
 * @returns {Promise<Object>} Lambda response
 */
export async function handler(event) {
  logger.info({ message: "Starting nightly subscription status check", event });

  if (!isStripeEnabled()) {
    logger.warn({ message: "Stripe not enabled, skipping subscription checks" });
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Stripe not enabled, subscription checks skipped",
        checked: 0,
      }),
    };
  }

  try {
    // Get all bundles with active subscriptions
    const subscriptionBundles = await getSubscriptionBundlesForCheck();

    if (subscriptionBundles.length === 0) {
      logger.info({ message: "No subscription bundles to check" });
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "No subscription bundles to check",
          checked: 0,
        }),
      };
    }

    logger.info({
      message: "Found subscription bundles to check",
      count: subscriptionBundles.length,
    });

    let checkedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    // Check each subscription status in Stripe
    for (const bundle of subscriptionBundles) {
      try {
        logger.info({
          message: "Checking subscription status",
          hashedSub: bundle.hashedSub,
          bundleId: bundle.bundleId,
          stripeSubscriptionId: bundle.stripeSubscriptionId,
        });

        // Get current subscription status from Stripe
        const businessPriceId = process.env.STRIPE_BUSINESS_PRICE_ID;
        const stripeStatus = await checkSubscriptionStatus(bundle.stripeCustomerId, businessPriceId);

        checkedCount++;

        // Update status if it has changed
        const currentStatus = bundle.subscriptionStatus || "unknown";
        const newStatus = stripeStatus.active ? "active" : "inactive";

        if (currentStatus !== newStatus || stripeStatus.currentPeriodEnd) {
          await updateSubscriptionStatus(
            bundle.hashedSub,
            bundle.bundleId,
            newStatus,
            stripeStatus.currentPeriodEnd || null,
          );

          updatedCount++;

          logger.info({
            message: "Updated subscription status",
            hashedSub: bundle.hashedSub,
            bundleId: bundle.bundleId,
            oldStatus: currentStatus,
            newStatus: newStatus,
            currentPeriodEnd: stripeStatus.currentPeriodEnd,
          });
        } else {
          logger.info({
            message: "Subscription status unchanged",
            hashedSub: bundle.hashedSub,
            bundleId: bundle.bundleId,
            status: newStatus,
          });
        }
      } catch (error) {
        errorCount++;
        logger.error({
          message: "Error checking subscription",
          hashedSub: bundle.hashedSub,
          bundleId: bundle.bundleId,
          error: error.message,
        });
        // Continue with next subscription
      }
    }

    logger.info({
      message: "Completed nightly subscription status check",
      totalBundles: subscriptionBundles.length,
      checkedCount,
      updatedCount,
      errorCount,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Subscription status check completed",
        totalBundles: subscriptionBundles.length,
        checked: checkedCount,
        updated: updatedCount,
        errors: errorCount,
      }),
    };
  } catch (error) {
    logger.error({
      message: "Error during nightly subscription check",
      error: error.message,
      stack: error.stack,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "subscription_check_failed",
        message: error.message,
      }),
    };
  }
}
