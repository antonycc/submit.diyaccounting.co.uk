// app/lib/subHasher.js

import crypto from "crypto";

export function hashSub(sub) {
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid sub: must be a non-empty string");
  }
  return crypto.createHash("sha256").update(sub).digest("hex");
}
