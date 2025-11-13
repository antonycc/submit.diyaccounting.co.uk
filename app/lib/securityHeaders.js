// app/lib/securityHeaders.js
// Security headers middleware for Express application
// Implements comprehensive security headers based on OWASP recommendations

/**
 * Security headers middleware that adds comprehensive HTTP security headers
 * to all responses to protect against common web vulnerabilities.
 *
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 */
export function securityHeadersMiddleware(req, res, next) {
  // Strict-Transport-Security (HSTS)
  // Enforces HTTPS connections and includes subdomains
  // Max-age of 2 years (63072000 seconds) with preload for browser HSTS lists
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  // Content-Security-Policy (CSP)
  // Prevents XSS attacks by controlling resource loading
  // Self for most resources, specific exceptions for trusted CDNs and OAuth providers
  const cspDirectives = [
    "default-src 'self'",
    // Allow scripts from self and inline scripts for OAuth flows (using nonce would be better in production)
    "script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdn.jsdelivr.net",
    // Allow styles from self and inline styles (common for component libraries)
    "style-src 'self' 'unsafe-inline'",
    // Allow images from self, data URIs, and OAuth providers
    "img-src 'self' data: https:",
    // Allow fonts from self and data URIs
    "font-src 'self' data:",
    // Connect to own API, OAuth providers, and AWS services
    "connect-src 'self' https://*.amazonaws.com https://accounts.google.com https://oauth2.googleapis.com",
    // Only allow frames from OAuth providers (Google, Cognito)
    "frame-src 'self' https://accounts.google.com https://*.auth.eu-west-2.amazoncognito.com",
    // Prevent all object/embed/applet elements
    "object-src 'none'",
    // Require forms to submit to same origin
    "form-action 'self'",
    // Block all plugins
    "base-uri 'self'",
    // Upgrade insecure requests to HTTPS
    "upgrade-insecure-requests",
  ];
  res.setHeader("Content-Security-Policy", cspDirectives.join("; "));

  // X-Frame-Options
  // Prevents clickjacking attacks by controlling whether the page can be framed
  // SAMEORIGIN allows framing only by pages on the same origin
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  // X-Content-Type-Options
  // Prevents MIME-sniffing attacks by requiring declared content types
  res.setHeader("X-Content-Type-Options", "nosniff");

  // X-XSS-Protection
  // Legacy header for older browsers, modern browsers use CSP
  // Enable XSS filter and block page if attack detected
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer-Policy
  // Controls how much referrer information is included with requests
  // strict-origin-when-cross-origin sends full URL for same-origin, origin only for cross-origin HTTPS
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions-Policy (formerly Feature-Policy)
  // Controls which browser features can be used
  // Disable potentially sensitive features by default
  const permissionsDirectives = [
    "accelerometer=()",
    "camera=()",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "payment=()",
    "usb=()",
  ];
  res.setHeader("Permissions-Policy", permissionsDirectives.join(", "));

  // Cache-Control for sensitive pages
  // Prevent caching of sensitive authentication or user data pages
  if (req.path.includes("/auth/") || req.path.includes("/api/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  next();
}

/**
 * Rate limiting configuration per endpoint type
 * Different endpoints have different risk profiles and usage patterns
 */
export const rateLimitConfig = {
  // Authentication endpoints - strict limits to prevent brute force
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: "Too many authentication attempts, please try again later",
  },
  // Token exchange endpoints - moderate limits
  token: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window
    message: "Too many token requests, please try again later",
  },
  // API endpoints - generous limits for normal usage
  api: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: "Too many API requests, please slow down",
  },
  // Default for other endpoints
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: "Too many requests, please try again later",
  },
};
