// Catalog service for bundle and activity management

/**
 * Get bundles available for an activity
 * @param {object} catalog - Parsed catalog object
 * @param {string} activityId - Activity identifier
 * @returns {string[]} Array of bundle IDs
 */
export function bundlesForActivity(catalog, activityId) {
  const activity = catalog?.activities?.find((a) => a.id === activityId);
  return activity?.bundles ?? [];
}

/**
 * Get activities available for a bundle
 * @param {object} catalog - Parsed catalog object
 * @param {string} bundleId - Bundle identifier
 * @returns {string[]} Array of activity IDs
 */
export function activitiesForBundle(catalog, bundleId) {
  if (!catalog?.activities) return [];
  return catalog.activities.filter((a) => Array.isArray(a.bundles) && a.bundles.includes(bundleId)).map((a) => a.id);
}

/**
 * Check if an activity is available for a bundle
 * @param {object} catalog - Parsed catalog object
 * @param {string} activityId - Activity identifier
 * @param {string} bundleId - Bundle identifier
 * @returns {boolean} True if activity is available
 */
export function isActivityAvailable(catalog, activityId, bundleId) {
  return bundlesForActivity(catalog, activityId).includes(bundleId);
}

/**
 * Fetch raw TOML catalog from the server
 * @param {string} url - URL to fetch (default "/submit.catalogue.toml")
 * @returns {Promise<string>} Raw TOML content
 */
export async function fetchCatalogText(url = "/submit.catalogue.toml") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.status} ${res.statusText}`);
  return res.text();
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.bundlesForActivity = bundlesForActivity;
  window.activitiesForBundle = activitiesForBundle;
  window.isActivityAvailable = isActivityAvailable;
  window.fetchCatalogText = fetchCatalogText;
}
