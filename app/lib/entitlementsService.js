// app/lib/entitlementsService.js
import { loadCatalogFromRoot, bundlesForActivity } from "./productCatalogHelper.js";
import { __getInMemoryBundlesStore } from "../functions/account/bundlePost.js";

// Very light JWT decode (no signature verification) – same approach as bundle.js
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
    if (!claims.transactionId && !claims["custom:transactionId"]) return false;
  }
  // subscriptionTier must match exactly (supports either subscriptionTier or custom:subscriptionTier)
  if (q.subscriptionTier) {
    const tier = claims.subscriptionTier || claims["custom:subscriptionTier"];
    if (tier !== q.subscriptionTier) return false;
  }
  return true;
}

export function getCatalog() {
  return loadCatalogFromRoot();
}

export function getGrantedBundles(userCtx) {
  // MOCK: in-memory grants map
  const store = __getInMemoryBundlesStore();
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
  const catalog = getCatalog();
  const actBundles = bundlesForActivity(catalog, activityId);
  if (!Array.isArray(actBundles) || actBundles.length === 0) return false;
  const active = new Set(getActiveBundles(userCtx));
  return actBundles.some((id) => active.has(id));
}

// Express middleware factory
export function requireActivity(activityId) {
  return function (req, res, next) {
    try {
      const auth = req.headers.authorization || req.headers.Authorization;
      const userCtx = getUserContextFromAuthHeader(auth);
      const allowed = isActivityAllowed(activityId, userCtx);
      if (allowed) return next();
      const active = getActiveBundles(userCtx);
      return res.status(403).json({ error: "not_allowed", activityId, bundles: active });
    } catch (e) {
      return res.status(500).json({ error: "entitlements_error", message: e?.message || String(e) });
    }
  };
}

export const __testing = { decodeJwtNoVerify, getUserContextFromAuthHeader, qualifiersMatch };
