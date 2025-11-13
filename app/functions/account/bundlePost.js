// app/functions/bundlePost.js

import { loadCatalogFromRoot } from "../../lib/productCatalogHelper.js";
import { validateEnv } from "../../lib/env.js";
import logger from "../../lib/logger.js";
import { extractRequest, parseRequestBody } from "../../lib/responses.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { getUserBundles, updateUserBundles, isMockMode } from "../../lib/bundleHelpers.js";
import { getBundlesStore } from "../non-lambda-mocks/mockBundleStore.js";

const mockBundleStore = getBundlesStore();

/**
 * Parses an ISO 8601 duration string and adds it to a given date.
 * Supports formats: PnD (days), PnM (months), PnY (years).
 *
 * @param {Date} fromDate - Starting date
 * @param {string} iso - ISO duration string (e.g., "P1D", "P1M", "P1Y")
 * @returns {Date} New date with duration added
 *
 * @example
 * parseIsoDurationToDate(new Date('2025-01-01'), 'P1D') // 2025-01-02
 * parseIsoDurationToDate(new Date('2025-01-01'), 'P1M') // 2025-02-01
 */
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

/**
 * Retrieves a bundle definition from the product catalog.
 *
 * @param {string} bundleId - Bundle identifier to lookup
 * @returns {Object|null} Bundle definition or null if not found
 */
function getCatalogBundle(bundleId) {
  try {
    const catalog = loadCatalogFromRoot();
    return (catalog.bundles || []).find((b) => b.id === bundleId) || null;
  } catch (_e) {
    return null;
  }
}

/**
 * Checks if bundle qualifiers are satisfied by the user's claims and request.
 *
 * @param {Object} bundle - Bundle definition with optional qualifiers
 * @param {Object} claims - User JWT claims
 * @param {Object} requestQualifiers - Qualifiers provided in the request
 * @returns {Object} Result with ok (boolean) and reason/unknown (string) if failed
 *
 * @example
 * qualifiersSatisfied(bundle, claims, {transactionId: 'TX-123'})
 * // Returns: {ok: true} or {ok: false, reason: 'missing_transactionId'}
 */
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
 * Registers the bundle request endpoint with the Express application.
 *
 * @param {Express} app - Express application instance
 */
export function apiEndpoint(app) {
  app.post("/api/v1/bundle", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

/**
 * Lambda handler for bundle access requests.
 *
 * Processes user bundle requests, validates qualifiers, checks caps and limits,
 * and grants or denies access based on the product catalog configuration.
 *
 * @param {Object} event - Lambda event containing:
 *   - body: JSON with bundleId and optional qualifiers
 *   - headers: Authorization header with Cognito JWT
 * @returns {Promise<Object>} Lambda response with:
 *   - statusCode: 200 (success), 400 (validation error), 401 (unauthorized), 403 (cap reached)
 *   - body: JSON with granted (boolean), expiry (ISO date), and bundleId
 *
 * @example
 * // Request body
 * { "bundleId": "test", "qualifiers": { "transactionId": "TX-123" } }
 *
 * @example
 * // Success response
 * { "granted": true, "expiry": "2025-09-01T00:00:00Z", "bundleId": "test" }
 */
export async function handler(event) {
  const { request, requestId } = extractRequest(event);
  logger.info({ message: "bundlePost entry", route: "/api/v1/bundle", request });

  validateEnv(["COGNITO_USER_POOL_ID"]);

  try {
    logger.info({ message: "Bundle request received:", event: JSON.stringify(event, null, 2) });
    // TODO: Move into endpoint and emulate the API Gateway authorizer behavior
    let decodedToken;
    try {
      decodedToken = decodeJwtToken(event.headers);
    } catch (error) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(error),
      };
    }
    const userId = decodedToken.sub;
    const userPoolId = process.env.COGNITO_USER_POOL_ID;

    const requestBody = parseRequestBody(event);
    if (!requestBody) {
      logger.error({ message: "Failed to parse request body as JSON" });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    const requestedBundle = requestBody.bundleId;
    const qualifiers = requestBody.qualifiers || {};
    if (!requestedBundle) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Missing bundleId in request" }),
      };
    }

    logger.info({ message: "Processing bundle request for user:", userId, requestedBundle });

    const currentBundles = await getUserBundles(userId, userPoolId);

    const hasBundle = currentBundles.some((bundle) => bundle === requestedBundle || bundle.startsWith(requestedBundle + "|"));
    if (hasBundle) {
      logger.info({ message: "User already has requested bundle:", requestedBundle });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          status: "already_granted",
          message: "Bundle already granted to user",
          bundles: currentBundles,
          granted: false,
        }),
      };
    }

    const catalogBundle = getCatalogBundle(requestedBundle);

    if (!catalogBundle) {
      logger.error({ message: "[Catalog bundle] Bundle not found in catalog:", requestedBundle });
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "bundle_not_found", message: `Bundle '${requestedBundle}' not found in catalog` }),
      };
    }

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
        if ((bundles || []).some((b) => typeof b === "string" && (b === requestedBundle || b.startsWith(requestedBundle + "|"))))
          currentCount++;
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

    if (isMockMode()) {
      mockBundleStore.set(userId, currentBundles);
    } else {
      // Use DynamoDB as primary storage via updateUserBundles
      await updateUserBundles(userId, userPoolId, currentBundles);
    }

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
    logger.error({ message: "Unexpected error:", error });
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}
