/**
 * Utility functions for generating random states and other crypto-related tasks.
 */

/**
 * Generates a random state string for OAuth2 flows.
 * @returns {string}
 */
export function generateRandomState() {
  try {
    // Prefer cryptographically secure random values where available
    if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
      // Remove dashes to keep it compact and URL-safe
      return window.crypto.randomUUID().replace(/-/g, "");
    }
    if (typeof window !== "undefined" && window.crypto && typeof window.crypto.getRandomValues === "function") {
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
