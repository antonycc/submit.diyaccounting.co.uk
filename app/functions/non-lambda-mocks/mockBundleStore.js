// app/functions/non-lambda-mocks/mockBundleStore.js

import { hashSub } from "../../lib/subHasher.js";

// Store structure: Map<hashedSub, Map<bundleId, bundleItem>>
// bundleItem = { bundleId, expiry, createdAt, ttl, ttl_datestamp }
const store = new Map();

/**
 * Parse bundle string to extract bundleId and expiry
 * @param {string} bundleStr - Bundle string in format "BUNDLE_ID" or "BUNDLE_ID|EXPIRY=2025-12-31"
 * @returns {Object} Object with bundleId and expiry
 */
function parseBundleString(bundleStr) {
  if (!bundleStr || typeof bundleStr !== "string") {
    return { bundleId: "", expiry: null };
  }

  const parts = bundleStr.split("|");
  const bundleId = parts[0] || "";
  let expiry = null;

  if (parts.length > 1) {
    const expiryMatch = parts[1].match(/EXPIRY=(.+)/);
    if (expiryMatch && expiryMatch[1]) {
      expiry = expiryMatch[1]; // ISO date string like "2025-12-31"
    }
  }

  return { bundleId, expiry };
}

/**
 * Format bundle item to bundle string
 * @param {Object} item - Bundle item with bundleId and expiry
 * @returns {string} Bundle string in format "BUNDLE_ID|EXPIRY=2025-12-31"
 */
function formatBundleString(item) {
  if (!item || !item.bundleId) {
    return "";
  }

  if (item.expiry) {
    // Extract just the date portion if it's a full ISO timestamp
    const expiryDate = item.expiry.split("T")[0];
    return `${item.bundleId}|EXPIRY=${expiryDate}`;
  }

  return item.bundleId;
}

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
  return Array.from(userBundles.values()).map(formatBundleString);
}

export function setUserBundles(userId, bundles) {
  const hashedId = hashSub(userId);
  const userBundles = new Map();

  // Parse bundle strings and create structured items
  for (const bundleStr of bundles) {
    const { bundleId, expiry } = parseBundleString(bundleStr);
    if (!bundleId) continue;

    const now = new Date();
    const item = {
      bundleId,
      createdAt: now.toISOString(),
    };

    // Add expiry with millisecond precision timestamp
    if (expiry) {
      const expiryDate = new Date(expiry);
      if (!isNaN(expiryDate.getTime())) {
        item.expiry = expiryDate.toISOString();

        // Calculate TTL as 1 month after expiry
        const ttlDate = new Date(expiryDate.getTime());
        ttlDate.setMonth(ttlDate.getMonth() + 1);
        item.ttl = Math.floor(ttlDate.getTime() / 1000);
        item.ttl_datestamp = ttlDate.toISOString();
      }
    }

    userBundles.set(bundleId, item);
  }

  store.set(hashedId, userBundles);
}
