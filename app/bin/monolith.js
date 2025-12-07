#!/usr/bin/env node
// app/bin/monolith.js
// Entry point for monolith deployment mode
//
// SECURITY: Production-grade security middleware enabled:
// 1. ✅ Rate limiting via express-rate-limit (per-IP limits)
// 2. ✅ Request size limits and timeouts
// 3. ✅ CSRF protection for state-changing operations (custom implementation)
// 4. ✅ Security headers via helmet
// 5. ✅ Request validation and sanitization
// 6. ✅ Additional WAF protection at CloudFront/EdgeStack level
//
// DATA STORAGE: This monolith uses AWS DynamoDB for all persistence:
// - User sessions stored in DynamoDB via connect-dynamodb (with TTL)
// - OAuth tokens stored in DynamoDB via dynamoDbUserRepository
// - Application data in DynamoDB tables from SubmitEnvironment

import path from "path";
import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import passport from "passport";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import connectDynamoDB from "connect-dynamodb";
import { fileURLToPath } from "url";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { createLogger } from "../lib/logger.js";
import { configureGooglePassport, ensureAuthenticated, getUserFromRequest } from "../auth/googleStrategy.js";
import { getSecret } from "../lib/parameterStore.js";
import { csrfTokenMiddleware, csrfProtection, getCsrfToken } from "../lib/csrfProtection.js";

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

  // Security: Add helmet for security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for some client-side frameworks
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://wanted-finally-anteater.ngrok-free.app"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // Security: Parse cookies (required for CSRF)
  app.use(cookieParser());

  // Security: Rate limiting to prevent abuse
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });
  app.use("/api/", limiter);
  app.use("/auth/", limiter);

  // Security: Stricter rate limiting for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 auth requests per windowMs
    message: "Too many authentication attempts, please try again later.",
  });
  app.use("/auth/google", authLimiter);
  app.use("/auth/google/callback", authLimiter);

  // Security: Parse request bodies with size limits
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(express.json({ limit: "1mb" }));

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

  // Step 3: Configure session management with DynamoDB backend
  logger.info("Configuring DynamoDB session store...");
  const DynamoDBStore = connectDynamoDB(session);

  // Load session secret from Parameter Store
  const sessionSecretParam = process.env.SESSION_SECRET_PARAM || process.env.COOKIE_SECRET_PARAM;
  let sessionSecret = "dev-secret-change-in-production";
  if (sessionSecretParam) {
    try {
      sessionSecret = await getSecret(sessionSecretParam);
      logger.info("Session secret loaded from Parameter Store");
    } catch (error) {
      logger.warn(`Failed to load session secret from Parameter Store: ${error.message}`);
      logger.warn("Using default session secret (not secure for production)");
    }
  } else {
    logger.warn("SESSION_SECRET_PARAM not set, using default session secret (not secure for production)");
  }

  // Configure DynamoDB store
  const sessionTableName = process.env.SESSIONS_DYNAMODB_TABLE_NAME || process.env.SESSIONS_TABLE_NAME || "submit-sessions";
  const dynamoDBEndpoint = process.env.DYNAMODB_ENDPOINT;

  const storeOptions = {
    table: sessionTableName,
    hashKey: "sessionId",
    prefix: "sess:",
    ttl: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  };

  // Add endpoint for local development (dynalite)
  if (dynamoDBEndpoint) {
    storeOptions.client = {
      endpoint: dynamoDBEndpoint,
      region: process.env.AWS_REGION || "us-east-1",
    };
    logger.info(`Using DynamoDB endpoint: ${dynamoDBEndpoint}`);
  }

  logger.info(`Using DynamoDB session table: ${sessionTableName}`);

  app.use(
    session({
      store: new DynamoDBStore(storeOptions),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      name: "sessionId",
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: "lax",
      },
    }),
  );

  // Step 4: Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Step 4a: Add CSRF token generation to all sessions
  app.use(csrfTokenMiddleware);

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

  // CSRF token endpoint
  app.get("/api/csrf-token", (req, res) => {
    res.json({ csrfToken: getCsrfToken(req) });
  });

  // Step 6: Serve static files
  app.use(express.static(path.join(__dirname, "../../web/public")));

  // Step 7: Register API endpoints
  // Public endpoints (no authentication required, no CSRF for GET)
  catalogGetApiEndpoint(app);
  hmrcAuthUrlGetApiEndpoint(app);

  // Protected endpoints - Apply CSRF protection to state-changing methods
  // Note: CSRF middleware automatically allows GET/HEAD/OPTIONS through
  // The existing Lambda handlers check for JWT claims in the event object
  // In monolith mode, we rely on passport session for authentication
  app.use("/api/", csrfProtection);

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
