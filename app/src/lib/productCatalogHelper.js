import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

/**
 * Parse a TOML string of the product catalog into a JS object
 * @param {string} tomlString
 * @returns {{version:string,bundles:Array,activities:Array}}
 */
export function parseCatalog(tomlString) {
  if (typeof tomlString !== "string") throw new TypeError("tomlString must be a string");
  const catalog = TOML.parse(tomlString);
  return catalog;
}

/**
 * Load catalog from the repository root product-catalog.toml
 * @returns {object}
 */
export function loadCatalogFromRoot() {
  const filePath = path.join(process.cwd(), "product-catalog.toml");
  const raw = fs.readFileSync(filePath, "utf-8");
  return parseCatalog(raw);
}

/**
 * Get bundles enabled for a given activity id
 * @param {object} catalog
 * @param {string} activityId
 * @returns {string[]}
 */
export function bundlesForActivity(catalog, activityId) {
  const activity = catalog?.activities?.find((a) => a.id === activityId);
  return activity?.bundles ?? [];
}

/**
 * Get activities available for a given bundle id
 * @param {object} catalog
 * @param {string} bundleId
 * @returns {string[]} array of activity ids
 */
export function activitiesForBundle(catalog, bundleId) {
  if (!catalog?.activities) return [];
  return catalog.activities.filter((a) => Array.isArray(a.bundles) && a.bundles.includes(bundleId)).map((a) => a.id);
}

/**
 * Check if a given activity is available for a given bundle
 * @param {object} catalog
 * @param {string} activityId
 * @param {string} bundleId
 * @returns {boolean}
 */
export function isActivityAvailable(catalog, activityId, bundleId) {
  const bundles = bundlesForActivity(catalog, activityId);
  return bundles.includes(bundleId);
}
