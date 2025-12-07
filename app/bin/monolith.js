#!/usr/bin/env node
// app/bin/monolith.js
// Entry point for monolith deployment mode
//
// SECURITY NOTE: This implementation requires additional hardening for production use:
// 1. Add rate limiting middleware (e.g., express-rate-limit) to prevent abuse
// 2. Add request size limits and timeouts
// 3. Implement CSRF protection for state-changing operations
// 4. Add security headers middleware (e.g., helmet)
// 5. Consider adding request validation and sanitization
// 6. Rate limiting is currently handled at the AWS WAF level (EdgeStack)
//
// DATA STORAGE: This monolith uses AWS DynamoDB for all persistence:
// - User sessions stored in DynamoDB (via connect-dynamodb or cookie-session)
// - OAuth tokens stored in DynamoDB via dynamoDbUserRepository
// - Application data in DynamoDB tables from SubmitEnvironment

import path from "path";
import express from "express";
import cookieSession from "cookie-session";
import passport from "passport";
import { fileURLToPath } from "url";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { createLogger } from "../lib/logger.js";
import { configureGooglePassport, ensureAuthenticated, getUserFromRequest } from "../auth/googleStrategy.js";
import { getSecret } from "../lib/parameterStore.js";

// Import existing Lambda handlers
import { apiEndpoint as catalogGetApiEndpoint } from "../functions/account/catalogGet.js";
import { apiEndpoint as bundleGetApiEndpoint } from "../functions/account/bundleGet.js";
import { apiEndpoint as bundlePostApiEndpoint } from "../functions/account/bundlePost.js";
import { apiEndpoint as bundleDeleteApiEndpoint } from "../functions/account/bundleDelete.js";
import { apiEndpoint as hmrcAuthUrlGetApiEndpoint } from "../functions/hmrc/hmrcAuthUrlGet.js";
import { apiEndpoint as hmrcTokenPostApiEndpoint } from "../functions/hmrc/hmrcTokenPost.js";
import { apiEndpoint as hmrcVatReturnPostApiEndpoint } from "../functions/hmrc/hmrcVatReturnPost.js";
import { apiEndpoint as hmrcVatObligationGetApiEndpoint } from "../functions/hmrc/hmrcVatObligationGet.js";
import { apiEndpoint as hmrcVatReturnGetApiEndpoint } from "../functions/hmrc/hmrcVatReturnGet.js";
import { apiEndpoint as hmrcReceiptPostApiEndpoint } from "../functions/hmrc/hmrcReceiptPost.js";
import { apiEndpoint as hmrcReceiptGetApiEndpoint } from "../functions/hmrc/hmrcReceiptGet.js";
import { apiEndpoint as hmrcHttpProxyEndpoint } from "../functions/infra/hmrcHttpProxy.js";

const logger = createLogger({ source: "app/bin/monolith.js" });

dotenvConfigIfNotBlank({ path: ".env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Main function to start the monolith application
 */
async function main() {
  logger.info("Starting monolith application...");
  logger.info("Using AWS DynamoDB for all data persistence (tables from SubmitEnvironment)");

  // Step 1: Configure Google OAuth with Passport
  logger.info("Configuring Google OAuth...");
  await configureGooglePassport();

  // Step 2: Create Express application
  const app = express();

  // Parse request bodies
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // HTTP access logging middleware
  app.use((req, res, next) => {
    logger.info(`HTTP ${req.method} ${req.url}`);
    next();
  });

  // CORS middleware for local development
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    if (req.headers["access-control-request-private-network"] === "true") {
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    }
    if (req.method === "OPTIONS") return res.status(200).end();
    next();
  });

  // Step 3: Configure session management
  // Note: Using cookie-session for simplicity. For production at scale,
  // consider using connect-dynamodb to store sessions in DynamoDB
  logger.info("Configuring session management...");
  const cookieSecretParam = process.env.COOKIE_SECRET_PARAM;
  let cookieSecret = "dev-secret-change-in-production";
  if (cookieSecretParam) {
    try {
      cookieSecret = await getSecret(cookieSecretParam);
      logger.info("Cookie secret loaded from Parameter Store");
    } catch (error) {
      logger.warn(`Failed to load cookie secret from Parameter Store: ${error.message}`);
      logger.warn("Using default cookie secret (not secure for production)");
    }
  } else {
    logger.warn("COOKIE_SECRET_PARAM not set, using default cookie secret (not secure for production)");
  }

  app.use(
    cookieSession({
      name: "session",
      keys: [cookieSecret],
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    }),
  );

  // Step 4: Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Step 5: Set up authentication routes
  app.get("/auth/google", passport.authenticate("google"));

  app.get(
    "/auth/google/callback",
    passport.authenticate("google", {
      failureRedirect: "/login.html",
      failureMessage: true,
    }),
    (req, res) => {
      logger.info(`User ${req.user.email} authenticated successfully`);
      res.redirect("/");
    },
  );

  app.get("/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        logger.error("Error during logout:", err);
      }
      res.redirect("/");
    });
  });

  app.get("/auth/user", (req, res) => {
    if (req.isAuthenticated()) {
      res.json(getUserFromRequest(req));
    } else {
      res.status(401).json({ error: "Not authenticated" });
    }
  });

  // Step 6: Serve static files
  app.use(express.static(path.join(__dirname, "../../web/public")));

  // Step 7: Register API endpoints
  // Public endpoints (no authentication required)
  catalogGetApiEndpoint(app);
  hmrcAuthUrlGetApiEndpoint(app);

  // Protected endpoints (authentication required)
  // Note: In production, consider wrapping these with ensureAuthenticated middleware
  // The existing Lambda handlers check for JWT claims in the event object
  // In monolith mode, we rely on passport session for authentication
  // TODO: Add authentication middleware wrapper for production use
  bundleGetApiEndpoint(app);
  bundlePostApiEndpoint(app);
  bundleDeleteApiEndpoint(app);
  hmrcTokenPostApiEndpoint(app);
  hmrcVatReturnPostApiEndpoint(app);
  hmrcVatObligationGetApiEndpoint(app);
  hmrcVatReturnGetApiEndpoint(app);
  hmrcReceiptPostApiEndpoint(app);
  hmrcReceiptGetApiEndpoint(app);
  hmrcHttpProxyEndpoint(app);

  // Step 8: Health check endpoint
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      mode: "monolith",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      mode: "monolith",
      timestamp: new Date().toISOString(),
    });
  });

  // Step 9: Fallback to index.html for SPA routing
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, "../../web/public/index.html"));
  });

  // Step 10: Start the server
  const port = parseInt(process.env.PORT || process.env.TEST_SERVER_HTTP_PORT || "3000", 10);
  const server = app.listen(port, "0.0.0.0", () => {
    const message = `Monolith server listening at http://0.0.0.0:${port}`;
    console.log(message);
    logger.info(message);
  });

  // Step 11: Handle graceful shutdown
  const gracefulShutdown = async (signal) => {
    logger.info(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

// Run main function
main().catch((error) => {
  logger.error("Fatal error starting monolith application:", error);
  console.error("Fatal error:", error);
  process.exit(1);
});
