// app/functions/non-lambda-mocks/mockBundleStore.js

import { hashSub } from "../../lib/subHasher.js";

// Store structure: Map<hashedSub, Map<bundleId, bundleItem>>
// bundleItem = { bundleId, expiry, createdAt, ttl, ttl_datestamp }
const store = new Map();

export function getBundlesStore() {
  return store;
}

export function resetBundlesStore() {
  store.clear();
}

export function getUserBundles(userId) {
  const hashedId = hashSub(userId);
  const userBundles = store.get(hashedId);
  if (!userBundles) {
    return [];
  }

  // Return bundle strings for backward compatibility
  return Array.from(userBundles.values());
}

export function setUserBundles(userId, bundles) {
  const hashedId = hashSub(userId);
  const userBundles = new Map();

  // Parse bundle strings and create structured items
  for (const bundleId of bundles) {
    const now = new Date();
    const item = {
      bundleId,
      createdAt: now.toISOString(),
    };

    // Add expiry with millisecond precision timestamp
    const expiryDate = new Date();
    item.expiry = expiryDate.toISOString();

    // Calculate TTL as 1 month after expiry
    const ttlDate = new Date(expiryDate.getTime());
    ttlDate.setMonth(ttlDate.getMonth() + 1);
    item.ttl = Math.floor(ttlDate.getTime() / 1000);
    item.ttl_datestamp = ttlDate.toISOString();

    userBundles.set(bundleId, item);
  }

  store.set(hashedId, userBundles);
}
