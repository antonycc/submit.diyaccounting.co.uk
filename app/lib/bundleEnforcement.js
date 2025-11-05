// app/lib/bundleEnforcement.js
// Bundle enforcement library for checking user entitlements

import logger from "./logger.js";
import { decodeJwtNoVerify } from "./jwtHelper.js";
import { extractAuthToken, extractAuthTokenFromXAuthorization, extractUserFromAuthorizerContext } from "./responses.js";
import { getUserBundles, updateUserBundles } from "./bundleHelpers.js";

const DEFAULT_AWS_REGION = "eu-west-2";

// Lazy load AWS Cognito SDK only if bundle enforcement is on
let __cognitoModule;
let __cognitoClient;

async function getCognitoModule() {
  if (!__cognitoModule) {
    __cognitoModule = await import("@aws-sdk/client-cognito-identity-provider");
  }
  return __cognitoModule;
}

async function getCognitoClient() {
  if (!__cognitoClient) {
    const mod = await getCognitoModule();
    __cognitoClient = new mod.CognitoIdentityProviderClient({ region: process.env.AWS_REGION || DEFAULT_AWS_REGION });
  }
  return __cognitoClient;
}

/**
 * Helper function to determine if we're using HMRC sandbox based on base URL
 * @param {string} base - HMRC base URL
 * @returns {boolean} - true if sandbox/test environment
 */
function isSandboxBase(base) {
  return /test|sandbox/i.test(base || "");
}

/**
 * Extract user information from event (JWT token or authorizer context)
 * @param {Object} event - Lambda event object
 * @returns {Object|null} - User information with sub, claims, and token
 */
export function extractUserInfo(event) {
  // Try to get user from custom authorizer context first (X-Authorization header)
  const userInfo = extractUserFromAuthorizerContext(event);
  let userSub = userInfo?.sub;
  let claims = null;
  let token = null;

  logger.info({
    message: "Extracting user info from event",
    hasAuthorizerContext: !!userInfo,
    userSub: userSub || null,
  });

  // Fallback to extracting JWT from Authorization or X-Authorization header
  if (!userSub) {
    const idToken = extractAuthTokenFromXAuthorization(event) || extractAuthToken(event);
    if (!idToken) {
      logger.warn({ message: "No authorization token found in event headers" });
      return null;
    }

    token = idToken;
    const decoded = decodeJwtNoVerify(idToken);
    if (!decoded?.sub) {
      logger.warn({ message: "Invalid JWT structure - missing sub claim" });
      return null;
    }

    userSub = decoded.sub;
    claims = decoded;
    logger.info({
      message: "Extracted user info from JWT token",
      sub: userSub,
      tokenClaims: Object.keys(claims || {}),
    });
  }

  return { sub: userSub, claims, token, userInfo };
}

/**
 * Get user's bundles from Cognito (or mock store in test mode)
 * @param {string} userPoolId - Cognito User Pool ID
 * @param {string} sub - User's sub (Cognito username)
 * @returns {Promise<Array<string>>} - Array of bundle strings
 */
async function getUserBundlesFromCognito(userPoolId, sub) {
  // Use bundleHelpers isMockMode which centralizes this check
  const { isMockMode } = await import("./bundleHelpers.js");

  if (isMockMode()) {
    // Use mock bundle store in test mode
    const { getBundlesStore } = await import("../functions/non-lambda-mocks/mockBundleStore.js");
    const mockBundleStore = getBundlesStore();
    const bundles = mockBundleStore.get(sub) || [];

    logger.info({
      message: "[MOCK] Retrieved user bundles from mock store",
      sub,
      bundles,
    });

    return bundles;
  }

  const mod = await getCognitoModule();
  const client = await getCognitoClient();
  const cmd = new mod.AdminGetUserCommand({ UserPoolId: userPoolId, Username: sub });
  const user = await client.send(cmd);
  const attr = user.UserAttributes?.find((a) => a.Name === "custom:bundles")?.Value || "";
  const bundles = attr.split("|").filter(Boolean);

  logger.info({
    message: "Retrieved user bundles from Cognito",
    sub,
    bundlesRaw: attr,
    bundles,
  });

  return bundles;
}

/**
 * Check if user has required bundle entitlement
 * @param {Array<string>} bundles - User's current bundles
 * @param {Array<string>} requiredBundles - Required bundle IDs
 * @returns {boolean} - true if user has at least one required bundle
 */
function hasRequiredBundle(bundles, requiredBundles) {
  if (!bundles || bundles.length === 0) return false;

  return bundles.some((b) => {
    if (typeof b !== "string") return false;
    // Check for exact match or prefix match (bundle with metadata)
    return requiredBundles.some((required) => b === required || b.startsWith(required + "|"));
  });
}

/**
 * Enforce bundle requirements for an API endpoint
 * Throws an error if the user doesn't have the required entitlement
 *
 * @param {Object} event - Lambda event object
 * @param {Object} options - Configuration options
 * @param {string} options.hmrcBaseUri - HMRC API base URI (to determine sandbox vs production)
 * @param {string} options.userPoolId - Cognito User Pool ID
 * @param {Array<string>} options.sandboxBundles - Required bundles for sandbox environment
 * @param {Array<string>} options.productionBundles - Required bundles for production environment
 * @throws {Error} - Throws error with details if entitlement check fails
 * @returns {Promise<Object>} - Returns user info and bundles if successful
 */
export async function enforceBundles(event, options = {}) {
  const { hmrcBaseUri, userPoolId, sandboxBundles = [], productionBundles = [] } = options;

  // Check if bundle enforcement is enabled
  const enforceBundlesEnabled =
    String(process.env.DIY_SUBMIT_ENFORCE_BUNDLES || "").toLowerCase() === "true" || process.env.DIY_SUBMIT_ENFORCE_BUNDLES === "1";

  logger.info({
    message: "Bundle enforcement check started",
    enforceBundlesEnabled,
    userPoolId,
    hmrcBaseUri,
    sandboxBundles,
    productionBundles,
  });

  if (!enforceBundlesEnabled || !userPoolId) {
    logger.info({ message: "Bundle enforcement disabled or no user pool configured" });
    return { enforced: false };
  }

  // Extract user information from event
  const userExtraction = extractUserInfo(event);
  if (!userExtraction || !userExtraction.sub) {
    const error = new Error("Missing Authorization Bearer token");
    error.code = "MISSING_AUTHORIZATION";
    throw error;
  }

  const { sub: userSub, claims } = userExtraction;

  // Get user's bundles from Cognito
  const bundles = await getUserBundlesFromCognito(userPoolId, userSub);

  // Determine environment and required bundles
  const isSandbox = isSandboxBase(hmrcBaseUri);
  const requiredBundles = isSandbox ? sandboxBundles : productionBundles;
  const environment = isSandbox ? "sandbox" : "production";

  logger.info({
    message: "Checking bundle entitlements",
    environment,
    isSandbox,
    requiredBundles,
    currentBundles: bundles,
    userSub,
    claims: claims ? Object.keys(claims) : null,
  });

  // Check if user has required bundle
  const allowed = hasRequiredBundle(bundles, requiredBundles);

  if (!allowed) {
    const error = new Error(`Forbidden: ${environment} submission requires one of the following bundles: ${requiredBundles.join(", ")}`);
    error.code = "BUNDLE_FORBIDDEN";
    error.details = {
      environment,
      requiredBundles,
      currentBundles: bundles,
      userSub,
      claims,
      customBundlesAttribute: bundles.join("|"),
    };

    logger.error({
      message: "Bundle entitlement check failed",
      error: error.message,
      ...error.details,
    });

    throw error;
  }

  logger.info({
    message: "Bundle entitlement check passed",
    environment,
    userSub,
    matchedBundles: bundles.filter((b) => hasRequiredBundle([b], requiredBundles)),
  });

  return {
    enforced: true,
    userSub,
    bundles,
    environment,
    claims,
  };
}

/**
 * Add bundles to a user's entitlements
 * @param {string} userSub - User's sub (Cognito username)
 * @param {string} userPoolId - Cognito User Pool ID
 * @param {Array<string>} bundlesToAdd - Bundle IDs to add
 * @returns {Promise<Array<string>>} - Updated bundle list
 */
export async function addBundles(userSub, userPoolId, bundlesToAdd) {
  logger.info({
    message: "Adding bundles to user",
    userSub,
    bundlesToAdd,
  });

  // Get current bundles
  const currentBundles = await getUserBundles(userSub, userPoolId);

  // Add new bundles (avoid duplicates)
  const updatedBundles = [...currentBundles];
  for (const bundle of bundlesToAdd) {
    const exists = currentBundles.some((b) => b === bundle || b.startsWith(bundle + "|"));
    if (!exists) {
      updatedBundles.push(bundle);
    } else {
      logger.info({ message: "Bundle already exists for user", bundle, userSub });
    }
  }

  // Update in Cognito
  await updateUserBundles(userSub, userPoolId, updatedBundles);

  logger.info({
    message: "Bundles added successfully",
    userSub,
    previousBundles: currentBundles,
    updatedBundles,
  });

  return updatedBundles;
}

/**
 * Remove bundles from a user's entitlements
 * @param {string} userSub - User's sub (Cognito username)
 * @param {string} userPoolId - Cognito User Pool ID
 * @param {Array<string>} bundlesToRemove - Bundle IDs to remove
 * @returns {Promise<Array<string>>} - Updated bundle list
 */
export async function removeBundles(userSub, userPoolId, bundlesToRemove) {
  logger.info({
    message: "Removing bundles from user",
    userSub,
    bundlesToRemove,
  });

  // Get current bundles
  const currentBundles = await getUserBundles(userSub, userPoolId);

  // Remove specified bundles
  const updatedBundles = currentBundles.filter((bundle) => {
    // Keep the bundle if it doesn't match any of the bundles to remove
    return !bundlesToRemove.some((toRemove) => bundle === toRemove || bundle.startsWith(toRemove + "|"));
  });

  // Update in Cognito
  await updateUserBundles(userSub, userPoolId, updatedBundles);

  logger.info({
    message: "Bundles removed successfully",
    userSub,
    previousBundles: currentBundles,
    updatedBundles,
    removedCount: currentBundles.length - updatedBundles.length,
  });

  return updatedBundles;
}
