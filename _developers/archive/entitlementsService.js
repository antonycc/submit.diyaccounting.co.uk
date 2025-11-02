// app/lib/entitlementsService.js
import { loadCatalogFromRoot, bundlesForActivity } from "@app/lib/productCatalogHelper.js";
import { getBundlesStore } from "@app/functions/non-lambda-mocks/mockBundleStore.js";
import logger from "@app/lib/logger.js";
import { decodeJwtNoVerify } from "@app/lib/jwtHelper.js";

const mockBundleStore = getBundlesStore();

function getUserContextFromAuthHeader(authorization) {
  if (!authorization || !authorization.startsWith("Bearer ")) return { sub: null, claims: {} };
  const token = authorization.split(" ")[1];
  const claims = decodeJwtNoVerify(token) || {};
  return { sub: claims.sub || null, claims };
}

// Basic qualifier checks using user claims
function qualifiersMatch(bundle, userCtx) {
  const q = bundle?.qualifiers || {};
  const claims = userCtx?.claims || {};
  // requiresTransactionId means caller must present a transactionId claim
  if (q.requiresTransactionId) {
    if (!claims.transactionId && !claims["custom:transactionId"]) {
      logger.info({ message: "qualifiersMatch: missing required transactionId claim", bundleId: bundle.id, userSub: userCtx?.sub });
      return false;
    }
  }
  // subscriptionTier must match exactly (supports either subscriptionTier or custom:subscriptionTier)
  if (q.subscriptionTier) {
    const tier = claims.subscriptionTier || claims["custom:subscriptionTier"];
    if (tier !== q.subscriptionTier) {
      logger.info({
        message: "qualifiersMatch: subscriptionTier mismatch",
        bundleId: bundle.id,
        required: q.subscriptionTier,
        actual: tier,
        userSub: userCtx?.sub,
      });
      return false;
    }
  }
  logger.info({ message: "qualifiersMatch: all qualifiers matched", bundleId: bundle.id, userSub: userCtx?.sub });
  return true;
}

export function getCatalog() {
  return loadCatalogFromRoot();
}

export function getGrantedBundles(userCtx) {
  // MOCK: in-memory grants map
  const store = mockBundleStore;
  const list = store.get(userCtx?.sub) || [];
  // parse entries of form "bundleId|EXPIRY=YYYY-MM-DD" → filter out expired
  const now = new Date();
  const granted = [];
  for (const entry of list) {
    if (typeof entry !== "string") continue;
    const [id, rest] = entry.split("|");
    let ok = true;
    if (rest && rest.startsWith("EXPIRY=")) {
      const dateStr = rest.substring("EXPIRY=".length);
      const exp = new Date(dateStr);
      if (isFinite(exp)) {
        ok = now <= exp;
      }
    }
    if (ok) granted.push({ subject: userCtx?.sub, bundleId: id, expiry: null, qualifiers: {} });
  }
  logger.info({ message: "getGrantedBundles", userSub: userCtx?.sub, granted });
  return granted;
}

export function getActiveBundles(userCtx) {
  const catalog = getCatalog();
  const active = new Set();
  // Automatic bundles
  for (const b of catalog.bundles || []) {
    if (b.allocation === "automatic" && qualifiersMatch(b, userCtx)) {
      active.add(b.id);
    }
  }
  // On-request grants from store
  const grants = getGrantedBundles(userCtx);
  for (const g of grants) {
    const bundle = (catalog.bundles || []).find((b) => b.id === g.bundleId);
    if (!bundle) continue;
    if (bundle.allocation === "on-request" && qualifiersMatch(bundle, userCtx)) {
      active.add(bundle.id);
    }
  }
  return Array.from(active);
}

export function isActivityAllowed(activityId, userCtx) {
  logger.info({ message: "Checking activity allowed", activityId, userSub: userCtx?.sub });
  const catalog = getCatalog();
  const actBundles = bundlesForActivity(catalog, activityId);
  if (!Array.isArray(actBundles) || actBundles.length === 0) {
    logger.info({ message: "No bundles found for activity", activityId });
    return false;
  }
  const active = new Set(getActiveBundles(userCtx));
  const activityAllowed = actBundles.some((id) => active.has(id));
  logger.info({ message: "Activity allowed result", activityId, activityAllowed, userSub: userCtx?.sub });
  return activityAllowed;
}

export function requireActivity(activityId) {
  return function (req, res, next) {
    try {
      const auth = req.headers.authorization || req.headers.Authorization;
      const userCtx = getUserContextFromAuthHeader(auth);
      const allowed = isActivityAllowed(activityId, userCtx);
      if (allowed) {
        logger.info({ message: "Activity allowed proceeding to next check", activityId, userSub: userCtx?.sub });
        return next();
      }
      const active = getActiveBundles(userCtx);
      const responseBody = { error: "not_allowed", activityId, bundles: active };
      logger.warn({
        message: "Activity not allowed responding with HTTP 403",
        activityId,
        userSub: userCtx?.sub,
        activeBundles: active,
        responseBody,
      });
      return res.status(403).json(responseBody);
    } catch (e) {
      const responseBody = { error: "entitlements_error", message: e?.message || String(e) };
      logger.error({ message: "Error in requireActivity  responding with HTTP 500", error: e, responseBody });
      return res.status(500).json(responseBody);
    }
  };
}

// export const __testing = { getUserContextFromAuthHeader, qualifiersMatch };
