// app/lib/jwtVerifier.js
// Lightweight JWT verification using jose with JWKS support (Cognito-compatible)
// Falls back to decode-only if verification explicitly disabled via env.

import { createRemoteJWKSet, jwtVerify } from "jose";
import logger from "./logger.js";

function base64UrlDecodePayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (error) {
    logger.error({ message: "Failed to decode JWT payload", error: error.message });
    return null;
  }
}

function deriveCognitoConfigFromEnv() {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-west-2";
  if (!userPoolId) return null;
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const jwksUri = `${issuer}/.well-known/jwks.json`;
  return { issuer, jwksUri, audience: process.env.DIY_SUBMIT_CLIENT_ID || undefined };
}

let cachedJwksUri;
let cachedRemoteJwks;

export async function verifyAndDecodeJwt(token, opts = {}) {
  if (!token || typeof token !== "string") throw new Error("missing_token");

  const verifyDisabled = (process.env.DIY_SUBMIT_VERIFY_JWT || "").toLowerCase() === "false";
  if (verifyDisabled) {
    const claims = base64UrlDecodePayload(token);
    if (!claims) throw new Error("invalid_token_format");
    return { claims, verified: false };
  }

  const envCfg = deriveCognitoConfigFromEnv();
  const issuer = opts.issuer || envCfg?.issuer || process.env.DIY_SUBMIT_JWT_ISSUER || undefined;
  const jwksUri = opts.jwksUri || envCfg?.jwksUri || process.env.DIY_SUBMIT_JWKS_URI || undefined;
  const audience = opts.audience || envCfg?.audience || process.env.DIY_SUBMIT_JWT_AUDIENCE || undefined;

  if (!jwksUri) throw new Error("jwks_uri_not_configured");

  if (cachedJwksUri !== jwksUri) {
    cachedRemoteJwks = createRemoteJWKSet(new URL(jwksUri));
    cachedJwksUri = jwksUri;
  }

  const { payload } = await jwtVerify(token, cachedRemoteJwks, {
    issuer,
    audience,
    algorithms: ["RS256"],
    clockTolerance: 5, // seconds
  });
  return { claims: payload, verified: true };
}

export function getAuthHeaderToken(headers = {}) {
  const auth = headers.authorization || headers.Authorization;
  if (!auth || !String(auth).startsWith("Bearer ")) return null;
  return auth.split(" ")[1];
}

export async function verifiedUserContextFromHeaders(headers = {}, opts = {}) {
  const token = getAuthHeaderToken(headers);
  if (!token) return { sub: null, claims: {}, verified: false };
  try {
    const { claims, verified } = await verifyAndDecodeJwt(token, opts);
    return { sub: claims?.sub || null, claims, verified };
  } catch (e) {
    // If verification is mandatory (default), surface error; callers can decide how to respond
    if ((process.env.DIY_SUBMIT_VERIFY_JWT || "true").toLowerCase() !== "false") {
      throw e;
    }
    // fallback best-effort
    const claims = base64UrlDecodePayload(token) || {};
    return { sub: claims.sub || null, claims, verified: false };
  }
}

export const __testing = { base64UrlDecodePayload, deriveCognitoConfigFromEnv };
