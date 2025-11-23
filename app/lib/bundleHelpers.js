// app/lib/bundleHelpers.js

import logger from "./logger.js";
import { getBundlesStore } from "../functions/non-lambda-mocks/mockBundleStore.js";
import * as dynamoDbBundleStore from "./dynamoDbBundleStore.js";

const mockBundleStore = getBundlesStore();

export function isMockMode() {
  return String(process.env.TEST_BUNDLE_MOCK || "").toLowerCase() === "true" || process.env.TEST_BUNDLE_MOCK === "1";
}

/**
 * Get user bundles from DynamoDB (or mock store in test mode)
 * @param {string} userId - User ID (sub claim)
 * @returns {Promise<Array<string>>} Array of bundle strings
 */
export async function getUserBundles(userId) {
  // TODO: Remove this mock mode stuff and move the mockery into tests
  if (isMockMode()) {
    const bundles = mockBundleStore.get(userId) || [];
    logger.info({ message: "[MOCK] Current user bundles:", bundles });
    return bundles;
  }

  // Use DynamoDB as primary source
  const bundles = await dynamoDbBundleStore.getUserBundles(userId);
  logger.info({ message: "Current user bundles from DynamoDB:", bundles });
  return bundles;
}

/**
 * Update user bundles in DynamoDB (or mock store in test mode)
 * @param {string} userId - User ID (sub claim)
 * @param {Array<string>} bundles - Array of bundle strings
 */
export async function updateUserBundles(userId, bundles) {
  logger.info({ message: `Updating bundles for user ${userId} with ${bundles.length}`, bundles });

  // TODO: Remove this mock mode stuff and move the mockery into tests
  // This is actually avoided in app/functions/account/bundlePost.js anyway so should be fine to remove
  if (isMockMode()) {
    mockBundleStore.set(userId, bundles);
    logger.info({ message: `[MOCK] Updated bundles for user ${userId}`, bundles });
    return;
  }

  // Update DynamoDB - this requires removing old bundles and adding new ones
  // Get current bundles to determine what to remove
  const currentBundles = await dynamoDbBundleStore.getUserBundles(userId);

  logger.info({ message: `Current bundles for user ${userId} in DynamoDB`, currentBundles });

  // Parse bundle IDs from current bundles
  const currentBundleIds = new Set(currentBundles);
  logger.info({ message: `Current bundle IDs for user ${userId} in DynamoDB`, currentBundleIds });

  // Parse bundle IDs from new bundles
  // const newBundleIds = new Set(bundles.map((b) => b.bundleId));
  // logger.info({ message: `New bundle IDs for user ${userId}`, newBundleIds });

  // Remove bundles that are no longer in the new list
  // const bundlesToRemove = [...currentBundleIds].filter((id) => !newBundleIds.has(id));
  // logger.info({ message: `Bundles to remove for user ${userId} in DynamoDB`, bundlesToRemove });
  // for (const bundleId of bundlesToRemove) {
  //  await dynamoDbBundleStore.deleteBundle(userId, bundleId);
  // }

  // Add new bundles
  for (const bundle of bundles) {
    logger.info({ message: `Checking if bundle ${bundle.bundleId} needs adding for user ${userId} in DynamoDB`, bundle });
    if (bundle.bundleId && !currentBundleIds.has(bundle.bundleId)) {
      logger.info({ message: `Adding new bundle ${bundle.bundleId} for user ${userId} in DynamoDB`, bundle });
      await dynamoDbBundleStore.putBundle(userId, bundle);
    }
  }

  logger.info({ message: `Updated bundles for user ${userId} in DynamoDB`, bundles });
}
