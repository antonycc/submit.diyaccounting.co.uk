// app/functions/bundle.js

import { loadCatalogFromRoot } from "../lib/productCatalogHelper.js";

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
// Lightweight JWT decode (no signature verification)
function decodeJwtNoVerify(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (_err) {
    return null;
  }
}

// In-memory store for MOCK mode (no AWS required). Map<userSub, string[]>
const __inMemoryBundles = new Map();

export function __getInMemoryBundlesStore() {
  return __inMemoryBundles;
}

function isMockMode() {
  return (
    String(process.env.DIY_SUBMIT_BUNDLE_MOCK || "").toLowerCase() === "true" ||
    process.env.DIY_SUBMIT_BUNDLE_MOCK === "1"
  );
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

/**
 * Request a bundle for a user
 * @param {Object} event - Lambda event object
 * @returns {Object} Response object
 */
export async function httpPost(event) {
  // Routing for URL Lambda which also accepts HTTP DELETE
  if (event.httpMethod === "DELETE" || event.requestContext?.http?.method === "DELETE") {
    return httpDelete(event);
  }

  try {
    console.log("[DEBUG_LOG] Bundle request received:", JSON.stringify(event, null, 2));

    // Extract Cognito JWT from Authorization header
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        body: JSON.stringify({ error: "Unauthorized - Missing or invalid authorization header" }),
      };
    }

    const token = authHeader.split(" ")[1];

    // Decode JWT to get user's Cognito ID (sub)
    const decodedToken = decodeJwtNoVerify(token);
    if (!decodedToken || !decodedToken.sub) {
      console.log("[DEBUG_LOG] JWT decode failed or missing sub");
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Unauthorized - Invalid token" }),
      };
    }

    const userId = decodedToken.sub;
    const userPoolId = process.env.DIY_SUBMIT_USER_POOL_ID;

    if (!userPoolId && !isMockMode()) {
      console.log("[DEBUG_LOG] Missing USER_POOL_ID environment variable (non-mock mode)");
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Server configuration error" }),
      };
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || "{}");
    } catch (error) {
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

    console.log("[DEBUG_LOG] Processing bundle request for user:", userId, "bundle:", requestedBundle);

    // Fetch current bundles from Cognito custom attribute or MOCK store
    let currentBundles = [];
    if (isMockMode()) {
      currentBundles = __inMemoryBundles.get(userId) || [];
      console.log("[DEBUG_LOG] [MOCK] Current user bundles:", currentBundles);
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
        console.log("[DEBUG_LOG] Current user bundles:", currentBundles);
      } catch (error) {
        console.log("[DEBUG_LOG] Error fetching user:", error.message);
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

    if (!catalogBundle) {
      // Legacy behavior preserved (HMRC_TEST_API or other external bundles using envs)
      const expiryDate = process.env.DIY_SUBMIT_BUNDLE_EXPIRY_DATE || "2025-12-31";
      if (new Date() > new Date(expiryDate)) {
        return {
          statusCode: 403,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({ error: "This bundle has expired." }),
        };
      }

      // Check user limit for this bundle
      const userLimit = parseInt(process.env.DIY_SUBMIT_BUNDLE_USER_LIMIT || "1000");
      let currentCount;
      if (isMockMode()) {
        currentCount = 0;
        for (const bundles of __inMemoryBundles.values()) {
          if ((bundles || []).some((b) => typeof b === "string" && b.startsWith(requestedBundle + "|"))) {
            currentCount++;
          }
        }
      } else {
        currentCount = await getCurrentUserCountForBundle(requestedBundle, userPoolId);
      }

      if (currentCount >= userLimit) {
        return {
          statusCode: 403,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({ error: "User limit reached for this bundle." }),
        };
      }

      const newBundle = `${requestedBundle}|EXPIRY=${expiryDate}`;
      currentBundles.push(newBundle);
      if (isMockMode()) {
        __inMemoryBundles.set(userId, currentBundles);
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            status: "granted",
            granted: true,
            expiryDate,
            expiry: expiryDate,
            bundle: requestedBundle,
            bundles: currentBundles,
          }),
        };
      }
      try {
        const mod = await getCognitoModule();
        const client = await getCognitoClient();
        const updateCommand = new mod.AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: userId,
          UserAttributes: [{ Name: "custom:bundles", Value: currentBundles.join("|") }],
        });
        await client.send(updateCommand);
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            status: "granted",
            granted: true,
            expiryDate,
            expiry: expiryDate,
            bundle: requestedBundle,
            bundles: currentBundles,
          }),
        };
      } catch (error) {
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "Failed to grant bundle" }),
        };
      }
    }

    // Catalog-driven bundles
    // If bundle requires auth, we already have auth (Bearer)
    // Validate qualifiers
    const check = qualifiersSatisfied(catalogBundle, decodedToken, qualifiers);
    if (check?.unknown) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "unknown_qualifier", qualifier: check.unknown }),
      };
    }
    if (check?.ok === false) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "qualifier_mismatch" }),
      };
    }

    if (catalogBundle.allocation === "automatic") {
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
      for (const bundles of __inMemoryBundles.values()) {
        if ((bundles || []).some((b) => typeof b === "string" && b.startsWith(requestedBundle + "|"))) currentCount++;
      }
      if (currentCount >= cap) {
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
    __inMemoryBundles.set(userId, currentBundles);

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
    console.log("[DEBUG_LOG] Unexpected error:", error?.message || error);
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

    console.log("[DEBUG_LOG] Current user count for bundle", bundleId, ":", count);
    return count;
  } catch (error) {
    console.log("[DEBUG_LOG] Error counting users for bundle:", error?.message || error);
    return 0; // Return 0 on error to allow bundle granting
  }
}

/**
 * Handle OPTIONS requests for CORS
 * @param {Object} event - Lambda event object
 * @returns {Object} Response object
 */
export async function httpOptions(_event) {
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
    },
    body: "",
  };
}

/**
 * Remove a bundle for a user
 * @param {Object} event - Lambda event object
 * @returns {Object} Response object
 */
export async function httpDelete(event) {
  try {
    console.log("[DEBUG_LOG] Bundle delete request received:", JSON.stringify(event, null, 2));

    // Extract Cognito JWT from Authorization header
    const authorization = event.headers?.authorization || event.headers?.Authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Missing or invalid Authorization header" }),
      };
    }

    const token = authorization.substring("Bearer ".length);
    const payload = decodeJwtNoVerify(token);
    if (!payload?.sub) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Invalid token: no subject" }),
      };
    }

    const userId = payload.sub;
    const body = JSON.parse(event.body || "{}");
    const bundleToRemove = body.bundleId;
    const removeAll = body.removeAll;

    // Validate that we have either a specific bundle ID or removeAll flag
    if (!bundleToRemove && !removeAll) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Missing bundle Id in request" }),
      };
    }

    // Get current bundles for the user
    let currentBundles = [];
    if (isMockMode()) {
      currentBundles = __inMemoryBundles.get(userId) || [];
    } else {
      const userPoolId = process.env.DIY_SUBMIT_USER_POOL_ID;
      if (!userPoolId) {
        return {
          statusCode: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({ error: "Server configuration error" }),
        };
      }
      try {
        const mod = await getCognitoModule();
        const client = await getCognitoClient();
        const getUserCommand = new mod.AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: userId,
        });
        const userResponse = await client.send(getUserCommand);
        const bundlesAttribute = userResponse.UserAttributes?.find((attr) => attr.Name === "custom:bundles");
        if (bundlesAttribute && typeof bundlesAttribute.Value === "string") {
          currentBundles = bundlesAttribute.Value.split("|").filter((bundle) => bundle.length > 0);
        }
      } catch (error) {
        console.log("[DEBUG_LOG] Error fetching user for delete:", error?.message || error);
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

    if (removeAll) {
      // Remove all bundles
      if (isMockMode()) {
        __inMemoryBundles.set(userId, []);
      } else {
        try {
          const userPoolId = process.env.DIY_SUBMIT_USER_POOL_ID;
          const mod = await getCognitoModule();
          const client = await getCognitoClient();
          const updateCommand = new mod.AdminUpdateUserAttributesCommand({
            UserPoolId: userPoolId,
            Username: userId,
            UserAttributes: [{ Name: "custom:bundles", Value: "" }],
          });
          await client.send(updateCommand);
        } catch (error) {
          console.log("[DEBUG_LOG] Error clearing bundles in Cognito:", error?.message || error);
          return {
            statusCode: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({ error: "Failed to remove all bundles" }),
          };
        }
      }
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          status: "removed_all",
          message: "All bundles removed",
          bundles: [],
        }),
      };
    } else {
      // Remove specific bundle
      const bundlesAfterRemoval = currentBundles.filter(
        (bundle) => !bundle.startsWith(bundleToRemove + "|") && bundle !== bundleToRemove,
      );

      if (bundlesAfterRemoval.length === currentBundles.length) {
        return {
          statusCode: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({ error: "Bundle not found" }),
        };
      }

      if (isMockMode()) {
        __inMemoryBundles.set(userId, bundlesAfterRemoval);
      } else {
        try {
          const userPoolId = process.env.DIY_SUBMIT_USER_POOL_ID;
          const mod = await getCognitoModule();
          const client = await getCognitoClient();
          const updateCommand = new mod.AdminUpdateUserAttributesCommand({
            UserPoolId: userPoolId,
            Username: userId,
            UserAttributes: [{ Name: "custom:bundles", Value: bundlesAfterRemoval.join("|") }],
          });
          await client.send(updateCommand);
        } catch (error) {
          console.log("[DEBUG_LOG] Error updating bundles in Cognito:", error?.message || error);
          return {
            statusCode: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({ error: "Failed to remove bundle" }),
          };
        }
      }

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          status: "removed",
          message: "Bundle removed",
          bundle: bundleToRemove,
          bundles: bundlesAfterRemoval,
        }),
      };
    }
  } catch (error) {
    console.log("[DEBUG_LOG] Unexpected error in httpDelete:", error?.message || error);
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
