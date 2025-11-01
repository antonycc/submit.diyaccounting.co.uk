// app/functions/bundlePost.js

import { loadCatalogFromRoot } from "../../lib/productCatalogHelper.js";
import { validateEnv } from "../../lib/env.js";
import logger from "../../lib/logger.js";
import { extractRequest } from "../../lib/responses.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { getBundlesStore } from "../non-lambda-mocks/mockBundleStore.js";

const mockBundleStore = getBundlesStore();

// AWS Cognito SDK is loaded lazily only when not in MOCK mode to avoid requiring it during tests
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
    __cognitoClient = new mod.CognitoIdentityProviderClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return __cognitoClient;
}

function isMockMode() {
  return String(process.env.TEST_BUNDLE_MOCK || "").toLowerCase() === "true" || process.env.TEST_BUNDLE_MOCK === "1";
}

function parseIsoDurationToDate(fromDate, iso) {
  // Minimal support for PnD, PnM, PnY
  const d = new Date(fromDate.getTime());
  const m = String(iso || "").match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/);
  if (!m) return d;
  const years = parseInt(m[1] || "0", 10);
  const months = parseInt(m[2] || "0", 10);
  const days = parseInt(m[3] || "0", 10);
  d.setFullYear(d.getFullYear() + years);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return d;
}

function getCatalogBundle(bundleId) {
  try {
    const catalog = loadCatalogFromRoot();
    return (catalog.bundles || []).find((b) => b.id === bundleId) || null;
  } catch (_e) {
    return null;
  }
}

function qualifiersSatisfied(bundle, claims, requestQualifiers = {}) {
  const q = bundle?.qualifiers || {};
  if (q.requiresTransactionId) {
    const tx = requestQualifiers.transactionId || claims?.transactionId || claims?.["custom:transactionId"];
    if (!tx) return { ok: false, reason: "missing_transactionId" };
  }
  if (q.subscriptionTier) {
    const tier = requestQualifiers.subscriptionTier || claims?.subscriptionTier || claims?.["custom:subscriptionTier"];
    if (tier !== q.subscriptionTier) return { ok: false, reason: "subscription_tier_mismatch" };
  }
  // Reject unknown qualifier keys present in request
  const known = new Set(Object.keys(q));
  if (q.requiresTransactionId) known.add("transactionId");
  if (Object.prototype.hasOwnProperty.call(q, "subscriptionTier")) known.add("subscriptionTier");
  for (const k of Object.keys(requestQualifiers || {})) {
    if (!known.has(k)) return { ok: false, unknown: k };
  }
  return { ok: true };
}

export function apiEndpoint(app) {
  app.post("/api/v1/bundle", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export async function handler(event) {
  const request = extractRequest(event);
  logger.info({ message: "bundlePost entry", route: "/api/v1/bundle", request });

  validateEnv(["COGNITO_USER_POOL_ID"]);

  try {
    logger.info({ message: "Bundle request received:", event: JSON.stringify(event, null, 2) });
    let decodedToken;
    try {
      decodedToken = decodeJwtToken(event.headers);
    } catch (error) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(error),
      };
    }
    const userId = decodedToken.sub;

    const userPoolId = process.env.COGNITO_USER_POOL_ID;

    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || "{}");
    } catch (error) {
      logger.error({ message: "Failed to parse request body as JSON:", error: error.message });
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    const requestedBundle = requestBody.bundleId;
    const qualifiers = requestBody.qualifiers || {};
    if (!requestedBundle) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Missing bundleId in request" }),
      };
    }

    logger.info({ message: "Processing bundle request for user:", userId, requestedBundle });

    // Fetch current bundles from Cognito custom attribute or MOCK store
    let currentBundles = [];
    if (isMockMode()) {
      currentBundles = mockBundleStore.get(userId) || [];
      logger.info({ message: "[MOCK] Current user bundles:", currentBundles });
    } else {
      try {
        const mod = await getCognitoModule();
        const client = await getCognitoClient();
        const getUserCommand = new mod.AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: userId,
        });
        const userResponse = await client.send(getUserCommand);
        const bundlesAttribute = userResponse.UserAttributes?.find((attr) => attr.Name === "custom:bundles");
        if (bundlesAttribute && bundlesAttribute.Value) {
          currentBundles = bundlesAttribute.Value.split("|").filter((bundle) => bundle.length > 0);
        }
        logger.info({ message: "Current user bundles:", currentBundles });
      } catch (error) {
        logger.error({ message: "Error fetching user:", error: error.message });
        return {
          statusCode: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({ error: "User not found" }),
        };
      }
    }

    // Check if user already has this bundle
    const hasBundle = currentBundles.some((bundle) => bundle.startsWith(requestedBundle + "|"));
    if (hasBundle) {
      logger.info({ message: "User already has requested bundle:", requestedBundle });
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          status: "already_granted",
          message: "Bundle already granted to user",
          bundles: currentBundles,
          granted: false,
        }),
      };
    }

    // Two paths: legacy HMRC_TEST_API path via env expiry & user limit OR catalog-driven bundles
    const catalogBundle = getCatalogBundle(requestedBundle);

    // if (!catalogBundle) {
    //   // Legacy behavior preserved (HMRC_TEST_API or other external bundles using envs)
    //   const expiryDate = process.env.TEST_BUNDLE_EXPIRY_DATE || "2025-12-31";
    //   if (new Date() > new Date(expiryDate)) {
    //     logger.info({ message: "[Non-catalog bundle] Requested bundle has expired:", requestedBundle, expiryDate });
    //     return {
    //       statusCode: 403,
    //       headers: {
    //         "Content-Type": "application/json",
    //         "Access-Control-Allow-Origin": "*",
    //       },
    //       body: JSON.stringify({ error: "This bundle has expired." }),
    //     };
    //   }
    //
    //   // Check user limit for this bundle
    //   const userLimit = parseInt(process.env.TEST_BUNDLE_USER_LIMIT || "1000");
    //   let currentCount;
    //   if (isMockMode()) {
    //     currentCount = 0;
    //     for (const bundles of mockBundleStore.values()) {
    //       if ((bundles || []).some((b) => typeof b === "string" && b.startsWith(requestedBundle + "|"))) {
    //         currentCount++;
    //       }
    //     }
    //     logger.info({
    //       message: "[MOCK] [Non-catalog bundle] Current user count for bundle",
    //       bundleId: requestedBundle,
    //       count: currentCount,
    //     });
    //   } else {
    //     currentCount = await getCurrentUserCountForBundle(requestedBundle, userPoolId);
    //     logger.info({ message: "[Non-catalog bundle] Current user count for bundle", bundleId: requestedBundle, count: currentCount });
    //   }
    //
    //   if (currentCount >= userLimit) {
    //     logger.info({ message: "[Non-catalog bundle] User limit reached for bundle:", requestedBundle, userLimit });
    //     return {
    //       statusCode: 403,
    //       headers: {
    //         "Content-Type": "application/json",
    //         "Access-Control-Allow-Origin": "*",
    //       },
    //       body: JSON.stringify({ error: "User limit reached for this bundle." }),
    //     };
    //   }
    //
    //   const newBundle = `${requestedBundle}|EXPIRY=${expiryDate}`;
    //   currentBundles.push(newBundle);
    //   if (isMockMode()) {
    //     mockBundleStore.set(userId, currentBundles);
    //     logger.info({ message: "[MOCK] [Non-catalog bundle] Bundle granted to user:", userId, newBundle });
    //     return {
    //       statusCode: 200,
    //       headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    //       body: JSON.stringify({
    //         status: "granted",
    //         granted: true,
    //         expiryDate,
    //         expiry: expiryDate,
    //         bundle: requestedBundle,
    //         bundles: currentBundles,
    //       }),
    //     };
    //   }
    //   try {
    //     const mod = await getCognitoModule();
    //     const client = await getCognitoClient();
    //     logger.info({ message: "[Non-catalog bundle] Granting bundle to user in Cognito:", userId, newBundle });
    //     const updateCommand = new mod.AdminUpdateUserAttributesCommand({
    //       UserPoolId: userPoolId,
    //       Username: userId,
    //       UserAttributes: [{ Name: "custom:bundles", Value: currentBundles.join("|") }],
    //     });
    //     await client.send(updateCommand);
    //     logger.info({ message: "[Non-catalog bundle] Bundle granted to user:", userId, newBundle });
    //     return {
    //       statusCode: 200,
    //       headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    //       body: JSON.stringify({
    //         status: "granted",
    //         granted: true,
    //         expiryDate,
    //         expiry: expiryDate,
    //         bundle: requestedBundle,
    //         bundles: currentBundles,
    //       }),
    //     };
    //   } catch (error) {
    //     logger.error({ message: "[Non-catalog bundle] Error granting bundle to user:", error: error.message });
    //     return {
    //       statusCode: 500,
    //       headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    //       body: JSON.stringify({ error: "Failed to grant bundle" }),
    //     };
    //   }
    // }

    // Catalog-driven bundles
    // If bundle requires auth, we already have auth (Bearer)
    // Validate qualifiers
    const check = qualifiersSatisfied(catalogBundle, decodedToken, qualifiers);
    if (check?.unknown) {
      logger.warn({ message: "[Catalog bundle] Unknown qualifier in bundle request:", qualifier: check.unknown });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "unknown_qualifier", qualifier: check.unknown }),
      };
    }
    if (check?.ok === false) {
      logger.warn({ message: "[Catalog bundle] Qualifier mismatch for bundle request:", reason: check.reason });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "qualifier_mismatch" }),
      };
    }

    if (catalogBundle.allocation === "automatic") {
      logger.info({ message: "[Catalog bundle] Bundle is automatic allocation, no action needed:", requestedBundle });
      // nothing to persist
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          status: "granted",
          granted: true,
          expiry: null,
          bundle: requestedBundle,
          bundles: currentBundles,
        }),
      };
    }

    // on-request: enforce cap and expiry
    const cap = Number.isFinite(catalogBundle.cap) ? Number(catalogBundle.cap) : undefined;
    if (typeof cap === "number") {
      let currentCount = 0;
      for (const bundles of mockBundleStore.values()) {
        if ((bundles || []).some((b) => typeof b === "string" && b.startsWith(requestedBundle + "|"))) currentCount++;
      }
      if (currentCount >= cap) {
        logger.info({ message: "[Catalog bundle] Bundle cap reached:", requestedBundle, cap });
        return {
          statusCode: 403,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "cap_reached" }),
        };
      }
    }

    const expiry = catalogBundle.timeout ? parseIsoDurationToDate(new Date(), catalogBundle.timeout) : null;
    const expiryStr = expiry ? expiry.toISOString().slice(0, 10) : "";

    const newBundle = `${requestedBundle}|EXPIRY=${expiryStr || ""}`;
    currentBundles.push(newBundle);
    mockBundleStore.set(userId, currentBundles);

    logger.info({ message: "Bundle granted to user:", userId, newBundle });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        status: "granted",
        granted: true,
        expiry: expiryStr || null,
        bundle: requestedBundle,
        bundles: currentBundles,
      }),
    };
  } catch (error) {
    logger.info({ message: "Unexpected error:", error });
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}

/**
 * Get current user count for a specific bundle
 * @param {string} bundleId - The bundle ID to count
 * @param {string} userPoolId - The Cognito User Pool ID
 * @returns {number} Current user count
 */
async function getCurrentUserCountForBundle(bundleId, userPoolId) {
  try {
    // Note: This is a simplified implementation. In production, you might want to use
    // a more efficient approach like DynamoDB to track bundle counts
    const mod = await getCognitoModule();
    const client = await getCognitoClient();
    const listUsersCommand = new mod.ListUsersCommand({
      UserPoolId: userPoolId,
      AttributesToGet: ["custom:bundles"],
      Limit: 60, // Cognito limit
    });

    const response = await client.send(listUsersCommand);
    let count = 0;

    for (const user of response.Users || []) {
      const bundlesAttribute = user.Attributes?.find((attr) => attr.Name === "custom:bundles");
      if (bundlesAttribute && bundlesAttribute.Value) {
        const bundles = bundlesAttribute.Value.split("|");
        if (bundles.some((bundle) => bundle.startsWith(bundleId + "|"))) {
          count++;
        }
      }
    }

    logger.info({ message: "Current user count for bundle", bundleId, count });
    return count;
  } catch (error) {
    logger.info({ message: "Error counting users for bundle:", error });
    return 0; // Return 0 on error to allow bundle granting
  }
}
