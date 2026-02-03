// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/services/tokenEnforcement.js

import { createLogger } from "../lib/logger.js";
import { consumeToken, getUserBundles } from "../data/dynamoDbBundleRepository.js";

const logger = createLogger({ source: "app/services/tokenEnforcement.js" });

/**
 * Consume a token for an activity, if the activity costs tokens.
 *
 * Looks up the activity in the catalogue to determine token cost,
 * finds a qualifying user bundle with remaining tokens, and
 * atomically decrements the token counter.
 *
 * @param {string} userId - User sub
 * @param {string} activityId - Activity ID from catalogue (e.g. "submit-vat")
 * @param {Object} catalog - Parsed catalogue
 * @returns {Promise<Object>} { consumed: true, tokensRemaining, cost } or { consumed: false, reason }
 */
export async function consumeTokenForActivity(userId, activityId, catalog) {
  const activity = catalog?.activities?.find((a) => a.id === activityId);
  if (!activity) {
    logger.info({ message: "Activity not found in catalog, treating as free", activityId });
    return { consumed: true, cost: 0 };
  }

  const tokenCost = activity.tokenCost || 0;
  if (tokenCost === 0) {
    logger.info({ message: "Activity is free (no token cost)", activityId });
    return { consumed: true, cost: 0 };
  }

  // Load user's bundles to find one that qualifies for this activity and has tokens
  const userBundles = await getUserBundles(userId);
  const activityBundleIds = new Set(activity.bundles || []);

  // Find a qualifying bundle: must be in the activity's bundle list and have tokens remaining
  const qualifyingBundle = userBundles.find((b) => {
    if (!activityBundleIds.has(b.bundleId)) return false;
    if (b.tokensGranted === undefined) return false;
    const remaining = b.tokensGranted - (b.tokensConsumed || 0);
    return remaining > 0;
  });

  if (!qualifyingBundle) {
    logger.info({ message: "No qualifying bundle with tokens remaining", userId, activityId });
    return { consumed: false, reason: "tokens_exhausted", tokensRemaining: 0 };
  }

  // Atomically consume a token from the qualifying bundle
  const result = await consumeToken(userId, qualifyingBundle.bundleId);
  logger.info({
    message: "Token consumption result",
    userId,
    activityId,
    bundleId: qualifyingBundle.bundleId,
    consumed: result.consumed,
    tokensRemaining: result.tokensRemaining,
  });

  return { ...result, cost: tokenCost };
}
