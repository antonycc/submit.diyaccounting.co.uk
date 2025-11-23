// app/lib/bundleEnforcement.js

import logger from "./logger.js";
import { extractUserFromAuthorizerContext, extractRequest } from "./responses.js";
import { getUserBundles, updateUserBundles } from "./bundleHelpers.js";
import { loadCatalogFromRoot } from "./productCatalogHelper.js";

export class BundleAuthorizationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "BundleAuthorizationError";
    this.details = details;
  }
}

export class BundleEntitlementError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "BundleEntitlementError";
    this.details = details;
  }
}

function extractUserInfo(event) {
  logger.info({ message: "Extracting user information from event" });

  // Try to get user from authorizer context
  const userInfo = extractUserFromAuthorizerContext(event);
  if (!userInfo) {
    logger.warn({ message: "No authorization token found in event" });
    throw new BundleAuthorizationError("Missing Authorization Bearer token", {
      code: "MISSING_AUTH_TOKEN",
    });
  } else if (!userInfo?.sub) {
    logger.warn({ message: "Invalid authorization token - missing sub claim" });
    throw new BundleAuthorizationError("Invalid Authorization token", {
      code: "INVALID_AUTH_TOKEN",
    });
  } else {
    const userSub = userInfo.sub;
    logger.info({
      message: "User info extracted from authorizer context",
      sub: userSub,
      username: userInfo.username,
      claims: Object.keys(userInfo),
    });
    return userSub;
  }
}

async function getUserBundlesFromStorage(userSub) {
  logger.info({ message: "Fetching user bundles from storage", userSub });
  const bundles = await getUserBundles(userSub);
  logger.info({ message: "User bundles retrieved", userSub, bundles, bundleCount: bundles.length });
  return bundles;
}

export async function enforceBundles(event, options = {}) {
  const { hmrcBase = process.env.HMRC_BASE_URI } = options;

  logger.info({
    message: "enforceBundles called",
    hmrcBase,
  });

  const userSub = extractUserInfo(event);
  const { request } = extractRequest(event);
  const requestPath = request?.pathname || "";
  const catalog = loadCatalogFromRoot();
  const requiredBundleIds = findRequiredBundleIdsForUrlPath(catalog, requestPath);
  if (!requiredBundleIds) {
    logger.info({ message: "No required bundles for request path - unrestricted", requestPath });
  }

  // Automatic bundles that everyone has implicitly
  const automaticBundleIds = getAutomaticBundles(catalog);
  const subscribedBundles = await getUserBundlesFromStorage(userSub);
  const subscribedBundleIds = subscribedBundles.map((b) => b.bundleId);
  const currentBundleIds = new Set([...(automaticBundleIds || []), ...(subscribedBundleIds || [])]);

  logger.info({
    message: "Checking bundle entitlements",
    userSub,
    path: requestPath,
    requiredBundleIds: requiredBundleIds,
    currentBundleIds: currentBundleIds,
  });

  const hasAnyRequired = requiredBundleIds.length === 0 || requiredBundleIds.some((req) => currentBundleIds.has(req));
  if (!hasAnyRequired) {
    const errorDetails = {
      code: "BUNDLE_FORBIDDEN",
      requiredBundleIds,
      currentBundleIds,
      userSub,
      path: requestPath,
    };

    const message = `Forbidden: Activity requires ${requiredBundleIds.join(" or ")} bundle`;
    logger.warn({ message, ...errorDetails });
    throw new BundleEntitlementError(message, errorDetails);
  }

  logger.info({
    message: "Bundle entitlement check passed",
    userSub,
    path: requestPath,
  });

  return userSub;
}

// Calculate required bundles by seeing which activities in the catalog match this events URL path and require bundles
// We'll first determine the required bundles for this path. If only automatic bundles are required,
// we allow access without requiring authentication. Only when non-automatic bundles are required
// do we extract the user and fetch their bundles from storage.
// Helper: derive bundle ID from stored string (which may include metadata like EXPIRY)
// const toBundleId = (b) => (typeof b === "string" ? b.split("|")[0] : String(b || ""));

// Helper: match activity by path (mirrors web/public/widgets/entitlement-status.js)
function matchesRegexPattern(pattern, normalizedPath) {
  try {
    const regex = new RegExp(pattern);
    return regex.test(normalizedPath) || regex.test("/" + normalizedPath);
  } catch (err) {
    logger.warn({ message: "Invalid regex pattern in catalog", pattern, err: String(err) });
    return false;
  }
}

function matchesSimplePath(path, normalizedPath) {
  const normalizedActivityPath = (path || "").replace(/^\//, "");
  return normalizedPath === normalizedActivityPath || normalizedPath.endsWith("/" + normalizedActivityPath);
}

function findRequiredBundleIdsForUrlPath(catalog, currentPath) {
  if (!catalog?.activities) return [];

  // Keep both variants: with and without query
  const pathWithQuery = String(currentPath || "").replace(/^\//, "");
  const pathNoQuery = pathWithQuery.split("?")[0];

  const required = new Set();

  for (const activity of catalog.activities) {
    const paths = activity.paths || (activity.path ? [activity.path] : []);
    const bundles = Array.isArray(activity.bundles) ? activity.bundles : [];

    for (const pRaw of paths) {
      const p = String(pRaw);

      // Regex paths start with "^" (same convention as before)
      const isMatch = p.startsWith("^")
        ? // Try matching both with and without query; helper already checks with and without leading slash
          matchesRegexPattern(p, pathNoQuery) || matchesRegexPattern(p, pathWithQuery)
        : // For simple paths, match against the variant that makes sense:
          // - If the activity path contains a query, preserve it when comparing
          // - Otherwise compare without the query string
          p.includes("?")
          ? matchesSimplePath(p, pathWithQuery)
          : matchesSimplePath(p, pathNoQuery);

      if (isMatch) {
        for (const b of bundles) required.add(b);
        // No need to test other patterns for this activity once matched
        break;
      }
    }
  }

  return Array.from(required);
}

function getAutomaticBundles(catalog) {
  if (!catalog?.bundles) return [];
  return catalog.bundles.filter((b) => b.allocation === "automatic").map((b) => b.id);
}

export async function addBundles(userId, bundlesToAdd) {
  logger.info({ message: "addBundles called", userId, bundlesToAdd });

  const currentBundles = await getUserBundles(userId);
  const newBundles = [...currentBundles];

  for (const bundle of bundlesToAdd) {
    if (!newBundles.some((b) => b.startsWith(bundle) || b === bundle)) {
      newBundles.push(bundle);
    }
  }

  await updateUserBundles(userId, newBundles);

  logger.info({
    message: "Bundles added successfully",
    userId,
    addedBundles: bundlesToAdd,
    previousCount: currentBundles.length,
    newCount: newBundles.length,
  });

  return newBundles;
}

export async function removeBundles(userId, bundlesToRemove) {
  logger.info({ message: "removeBundles called", userId, bundlesToRemove });

  const currentBundles = await getUserBundles(userId);
  const newBundles = currentBundles.filter((bundle) => {
    return !bundlesToRemove.some((toRemove) => bundle === toRemove || bundle.startsWith(`${toRemove}|`));
  });

  await updateUserBundles(userId, newBundles);

  logger.info({
    message: "Bundles removed successfully",
    userId,
    removedBundles: bundlesToRemove,
    previousCount: currentBundles.length,
    newCount: newBundles.length,
  });

  return newBundles;
}
