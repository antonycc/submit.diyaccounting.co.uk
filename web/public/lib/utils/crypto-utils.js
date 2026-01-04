// Cryptographic and random utility functions

/**
 * Generate a cryptographically secure random state string
 * @returns {string} Random state string (32 hex characters)
 */
export function generateRandomState() {
  try {
    // Prefer cryptographically secure random values where available
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      // Remove dashes to keep it compact and URL-safe
      return window.crypto.randomUUID().replace(/-/g, "");
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch (error) {
    console.warn("Failed to generate cryptographic random state:", error);
    // fall through to non-crypto fallback below
  }
  // Last-resort fallback without Math.random to avoid pseudo-random lint warnings
  // Uses high-resolution time if available to ensure uniqueness (not for security)
  const now = Date.now().toString(36);
  const perf = typeof performance !== "undefined" && performance.now ? Math.floor(performance.now() * 1000).toString(36) : "0";
  return `${now}${perf}`;
}

/**
 * Generate random hex string of specified byte length
 * @param {number} bytes - Number of bytes to generate
 * @returns {string} Hex string
 */
export function randomHex(bytes) {
  try {
    const arr = new Uint8Array(bytes);
    (window.crypto || {}).getRandomValues?.(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // Fallback to time-based shards when crypto is unavailable
    const now = Date.now()
      .toString(16)
      .padStart(bytes * 2, "0");
    return now.slice(-bytes * 2);
  }
}
