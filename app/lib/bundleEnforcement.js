// app/lib/bundleEnforcement.js

import logger from "./logger.js";
import { decodeJwtNoVerify } from "./jwtHelper.js";
import {
  extractAuthTokenFromXAuthorization,
  extractBearerTokenFromAuthHeaderInLambdaEvent,
  extractUserFromAuthorizerContext,
} from "./responses.js";
import { getUserBundles, updateUserBundles } from "./bundleHelpers.js";

/**
 * Exception class for bundle authorization failures
 */
export class BundleAuthorizationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "BundleAuthorizationError";
    this.details = details;
  }
}

/**
 * Exception class for bundle enforcement failures
 */
export class BundleEntitlementError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "BundleEntitlementError";
    this.details = details;
  }
}

/**
 * Extract user information from event (JWT token or authorizer context)
 * @param {Object} event - Lambda event object
 * @returns {Object} Object containing userSub and claims
 */
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
  //
  // logger.info({
  //   message: "User info extracted from JWT token",
  //   sub: decoded.sub,
  //   claims: Object.keys(decoded),
  // });
  //
  // return {
  //   userSub: decoded.sub,
  //   claims: decoded,
  // };
}

/**
 * Check if the HMRC base URL is for sandbox/test environment
 * @param {string} base - HMRC base URL
 * @returns {boolean} True if sandbox, false otherwise
 */
function isSandboxBase(base) {
  return /test|sandbox/i.test(base || "");
}

/**
 * Get user bundles from DynamoDB (via bundleHelpers which abstracts the storage)
 * @param {string} userSub - User's sub claim
 * @returns {Promise<Array<string>>} Array of bundle strings
 */
async function getUserBundlesFromStorage(userSub) {
  logger.info({ message: "Fetching user bundles from storage", userSub });
  const bundles = await getUserBundles(userSub);
  logger.info({ message: "User bundles retrieved", userSub, bundles, bundleCount: bundles.length });
  return bundles;
}

/**
 * Check if user has required bundle for sandbox environment
 * @param {Array<string>} bundles - User's bundles
 * @param {string} requiredBundle - Required bundle name
 * @returns {boolean} True if user has the required bundle
 */
function hasSandboxBundle(bundles, requiredBundle = "test") {
  return bundles && bundles.some((b) => typeof b === "string" && (b === requiredBundle || b.startsWith(`${requiredBundle}|`)));
}

/**
 * Check if user has required bundle for production environment
 * @param {Array<string>} bundles - User's bundles
 * @param {Array<string>} allowedBundles - Array of allowed bundle names
 * @returns {boolean} True if user has any of the allowed bundles
 */
function hasProductionBundle(bundles, allowedBundles = ["guest", "business"]) {
  return (
    bundles && bundles.some((b) => typeof b === "string" && allowedBundles.some((allowed) => b === allowed || b.startsWith(`${allowed}|`)))
  );
}

/**
 * Enforce bundle entitlements for the current request
 * This function extracts user information from the event and checks if the user
 * has the required bundles to proceed with the operation.
 *
 * @param {Object} event - Lambda event object
 * @param {Object} options - Enforcement options
 * @param {string} options.hmrcBase - HMRC base URI (default: reads from HMRC_BASE_URI env)
 * @param {string} options.sandboxBundle - Required bundle for sandbox (default: "test")
 * @param {Array<string>} options.productionBundles - Required bundles for production (default: [guest, business])
 * @throws {BundleEntitlementError} If bundle requirements are not met
 */
export async function enforceBundles(event, options = {}) {
  const {
    // enabled = String(process.env.DIY_SUBMIT_ENFORCE_BUNDLES || "").toLowerCase() === "true" ||
    //  process.env.DIY_SUBMIT_ENFORCE_BUNDLES === "1",
    // userPoolId = process.env.COGNITO_USER_POOL_ID,
    hmrcBase = process.env.HMRC_BASE_URI,
    sandboxBundle = "test",
    productionBundles = ["guest", "business"],
  } = options;

  logger.info({
    message: "enforceBundles called",
    // enabled,
    hmrcBase,
    sandboxBundle,
    productionBundles,
  });

  // Extract user information
  const userSub = extractUserInfo(event);

  // Skip enforcement if disabled
  // if (!enabled || !userPoolId) {
  // if (!userPoolId) {
  //  logger.info({ message: "Bundle enforcement is disabled or userPoolId not configured", enabled, userPoolId: !!userPoolId });
  //  return userSub;
  // }

  // Get user bundles from storage (DynamoDB or mock store)
  // const bundles = await getUserBundlesFromStorage(userPoolId, userSub);
  const bundles = await getUserBundlesFromStorage(userSub);

  // Calculate required bundles by seeing which activities in the catalog match this events URL path and require bundles
  const requiredBundles;

  // Determine environment (sandbox vs production)
  // const sandbox = isSandboxBase(hmrcBase);

  logger.info({
    message: "Checking bundle entitlements",
    userSub,
    // sandbox,
    // requiredBundles: sandbox ? [sandboxBundle] : productionBundles,
    currentBundles: bundles,
    bundleCount: bundles.length,
  });

  // TODO: Change the logic to compare the request URL against the activity paths
  // if (sandbox) {
  //   // Sandbox environment requires test bundle
  //   if (!hasSandboxBundle(bundles, sandboxBundle)) {
  //     const errorDetails = {
  //       code: "BUNDLE_FORBIDDEN",
  //       requiredBundle: sandboxBundle,
  //       currentBundles: bundles,
  //       environment: "sandbox",
  //       userSub,
  //       claims,
  //       customBundlesAttribute: bundles.join("|"),
  //     };
  //
  //     logger.error({
  //       message: "Bundle entitlement check failed for sandbox",
  //       ...errorDetails,
  //     });
  //
  //     throw new BundleEntitlementError(`Forbidden: HMRC Sandbox submission requires ${sandboxBundle} bundle`, errorDetails);
  //   }
  // } else {
  //   // Production environment requires guest or business bundle
  //   if (!hasProductionBundle(bundles, productionBundles)) {
  //     const errorDetails = {
  //       code: "BUNDLE_FORBIDDEN",
  //       requiredBundle: productionBundles,
  //       currentBundles: bundles,
  //       environment: "production",
  //       userSub,
  //       claims,
  //       customBundlesAttribute: bundles.join("|"),
  //     };
  //
  //     logger.error({
  //       message: "Bundle entitlement check failed for production",
  //       ...errorDetails,
  //     });
  //
  //     throw new BundleEntitlementError(`Forbidden: Production submission requires ${productionBundles.join(" or ")} bundle`, errorDetails);
  //   }
  // }

  logger.info({
    message: "Bundle entitlement check passed",
    userSub,
    environment: sandbox ? "sandbox" : "production",
    matchedBundles: sandbox
      ? bundles.filter((b) => b === sandboxBundle || b.startsWith(`${sandboxBundle}|`))
      : bundles.filter((b) => productionBundles.some((allowed) => b === allowed || b.startsWith(`${allowed}|`))),
  });

  return userSub;
}

/**
 * Add bundles to a user's entitlements
 * This is a convenience wrapper around updateUserBundles from bundleHelpers
 *
 * @param {string} userId - User ID (sub claim)
 * @param {string} userPoolId - Cognito User Pool ID
 * @param {Array<string>} bundlesToAdd - Array of bundle strings to add
 */
export async function addBundles(userId, userPoolId, bundlesToAdd) {
  logger.info({ message: "addBundles called", userId, bundlesToAdd });

  const currentBundles = await getUserBundles(userId, userPoolId);
  const newBundles = [...currentBundles];

  for (const bundle of bundlesToAdd) {
    if (!newBundles.some((b) => b.startsWith(bundle) || b === bundle)) {
      newBundles.push(bundle);
    }
  }

  await updateUserBundles(userId, userPoolId, newBundles);

  logger.info({
    message: "Bundles added successfully",
    userId,
    addedBundles: bundlesToAdd,
    previousCount: currentBundles.length,
    newCount: newBundles.length,
  });

  return newBundles;
}

/**
 * Remove bundles from a user's entitlements
 *
 * @param {string} userId - User ID (sub claim)
 * @param {Array<string>} bundlesToRemove - Array of bundle strings to remove
 */
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
