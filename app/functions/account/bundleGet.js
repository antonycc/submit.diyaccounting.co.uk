// app/functions/bundleGet.js
import { getActiveBundles } from "../../lib/entitlementsService.js";

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

function userCtxFromEvent(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!auth || !auth.startsWith("Bearer ")) return { sub: null, claims: {} };
  const token = auth.split(" ")[1];
  const claims = decodeJwtNoVerify(token) || {};
  return { sub: claims.sub || null, claims };
}

export async function handler(event) {
  try {
    const userCtx = userCtxFromEvent(event || {});
    const bundles = getActiveBundles(userCtx);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ bundles }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "my_bundles_error", message: e?.message || String(e) }),
    };
  }
}
