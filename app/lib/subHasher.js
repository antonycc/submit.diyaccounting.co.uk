// app/lib/subHasher.js

import crypto from "crypto";

/**
 * Hash a user sub claim to anonymize PII/sensitive data
 * Uses SHA-256 for consistent, deterministic hashing
 * @param {string} sub - The JWT sub claim to hash
 * @returns {string} Hex-encoded hash of the sub
 */
export function hashSub(sub) {
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid sub: must be a non-empty string");
  }
  return crypto.createHash("sha256").update(sub).digest("hex");
}
