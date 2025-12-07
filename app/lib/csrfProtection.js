// app/lib/csrfProtection.js
// Simple CSRF protection middleware
// Generates and validates CSRF tokens for state-changing operations

import crypto from "crypto";

/**
 * Generate a CSRF token
 * @returns {string} CSRF token
 */
export function generateCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Middleware to add CSRF token to session and expose it via /api/csrf-token endpoint
 */
export function csrfTokenMiddleware(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
  }
  next();
}

/**
 * Middleware to validate CSRF tokens on state-changing requests
 * Checks for token in X-CSRF-Token header or _csrf body parameter
 */
export function csrfProtection(req, res, next) {
  // Skip CSRF check for safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Skip CSRF check for non-browser requests (API clients with credentials)
  const contentType = req.headers["content-type"] || "";
  if (contentType.startsWith("application/json") && !req.headers["x-requested-with"]) {
    // API client - could add additional auth check here
    return next();
  }

  const token = req.headers["x-csrf-token"] || req.body._csrf || req.query._csrf;
  const sessionToken = req.session.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({
      error: "Invalid or missing CSRF token",
      message: "CSRF token validation failed",
    });
  }

  next();
}

/**
 * Get the current CSRF token for the session
 * @param {object} req - Express request object
 * @returns {string} CSRF token
 */
export function getCsrfToken(req) {
  return req.session.csrfToken;
}
