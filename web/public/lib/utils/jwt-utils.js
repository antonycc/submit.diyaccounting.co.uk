/**
 * Lightweight JWT helpers for token expiry checks
 */

/**
 * Decodes a base64url encoded string.
 * @param {string} str
 * @returns {string}
 */
export function base64UrlDecode(str) {
  try {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = str.length % 4;
    if (pad) str += "=".repeat(4 - pad);
    return atob(str);
  } catch {
    return "";
  }
}

/**
 * Parses JWT claims from a token.
 * @param {string} jwt
 * @returns {object|null}
 */
export function parseJwtClaims(jwt) {
  try {
    if (!jwt || typeof jwt !== "string") return null;
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

/**
 * Gets the expiry time of a JWT in milliseconds.
 * @param {string} jwt
 * @returns {number}
 */
export function getJwtExpiryMs(jwt) {
  const claims = parseJwtClaims(jwt);
  const exp = claims && claims.exp ? Number(claims.exp) : 0;
  return exp ? exp * 1000 : 0;
}
