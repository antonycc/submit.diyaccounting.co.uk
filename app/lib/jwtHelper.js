// app/lib/jwtHelper.js

import logger from "./logger.js";

export function decodeJwtNoVerify(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payloadRaw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payloadRaw, "base64").toString("utf8");
    const payload = JSON.parse(json);
    logger.info({ message: "Decoded JWT payload", payload });
    return payload;
  } catch (error) {
    logger.warn({ message: "JWT decode failed", error });
    return null;
  }
}

// Extract Cognito JWT from Authorization header
export function decodeJwtToken(eventHeaders) {
  const authHeader = eventHeaders?.authorization || eventHeaders?.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized - Missing or invalid authorization header");
  }

  const token = authHeader.split(" ")[1];

  // Decode JWT to get user's Cognito ID (sub)
  const decodedToken = decodeJwtNoVerify(token);
  if (!decodedToken || !decodedToken.sub) {
    logger.warn({ message: "JWT decode failed or missing sub" });
    throw new Error("Unauthorized - Invalid token");
  }

  return decodedToken;
}

export function getUserSub(event) {
  const auth = event?.headers?.authorization || event?.headers?.Authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.split(" ")[1];
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf8");
    const claims = JSON.parse(json);
    return claims?.sub || null;
  } catch {
    return null;
  }
}
