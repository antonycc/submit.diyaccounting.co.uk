// app/auth/googleStrategy.js
// Google OAuth strategy using passport.js for monolith mode

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { getSecret } from "../lib/parameterStore.js";
import { putUserRefreshToken, findUserByGoogleId } from "../data/dynamoDbUserRepository.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/auth/googleStrategy.js" });

/**
 * Configures passport.js with Google OAuth strategy.
 * This replaces Cognito authentication in monolith mode.
 *
 * @returns {Promise<void>}
 */
export async function configureGooglePassport() {
  logger.info("Configuring Google OAuth strategy for passport.js");

  // Get Google OAuth credentials
  const clientID = process.env.GOOGLE_CLIENT_ID;
  if (!clientID) {
    throw new Error("GOOGLE_CLIENT_ID environment variable is required");
  }

  const clientSecretParam = process.env.GOOGLE_CLIENT_SECRET_PARAM;
  if (!clientSecretParam) {
    throw new Error("GOOGLE_CLIENT_SECRET_PARAM environment variable is required");
  }

  // Fetch client secret from Parameter Store
  const clientSecret = await getSecret(clientSecretParam);

  const baseUrl = process.env.APP_BASE_URL || process.env.DIY_SUBMIT_BASE_URL || "http://localhost:3000";
  const callbackURL = `${baseUrl}/auth/google/callback`;

  logger.info(`Google OAuth callback URL: ${callbackURL}`);

  // Configure Google OAuth strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        scope: ["profile", "email", "openid"],
        // Request offline access to get refresh token
        accessType: "offline",
        // Force prompt to ensure we get refresh token
        prompt: "consent",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          logger.info(`Google OAuth callback for user: ${profile.id}`);

          // Extract user information
          const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
          const displayName = profile.displayName || email || profile.id;

          // Store refresh token in DynamoDB if provided
          if (refreshToken) {
            logger.info(`Storing refresh token for user: ${profile.id}`);
            await putUserRefreshToken(profile.id, refreshToken, {
              email,
              displayName,
            });
          } else {
            logger.warn(`No refresh token received for user: ${profile.id}`);
          }

          // Find or create user
          let user = await findUserByGoogleId(profile.id);
          if (!user) {
            // Create minimal user object
            user = {
              id: profile.id,
              googleId: profile.id,
              email,
              displayName,
            };
            logger.info(`Created new user: ${profile.id}`);
          } else {
            logger.info(`Found existing user: ${profile.id}`);
          }

          return done(null, user);
        } catch (error) {
          logger.error("Error in Google OAuth callback:", error);
          return done(error, null);
        }
      },
    ),
  );

  // Serialize user to session
  passport.serializeUser((user, done) => {
    logger.debug(`Serializing user: ${user.id}`);
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id, done) => {
    try {
      logger.debug(`Deserializing user: ${id}`);
      const user = await findUserByGoogleId(id);
      if (!user) {
        logger.warn(`User not found during deserialization: ${id}`);
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      logger.error("Error deserializing user:", error);
      done(error, null);
    }
  });

  logger.info("Google OAuth strategy configured successfully");
}

/**
 * Middleware to check if user is authenticated.
 * Use this to protect routes that require authentication.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  logger.warn(`Unauthenticated request to protected route: ${req.path}`);
  res.status(401).json({ error: "Authentication required" });
}

/**
 * Gets user information from the request.
 * This provides a unified interface for getting user info in monolith mode.
 *
 * @param {Object} req - Express request object
 * @returns {Object|null} User object or null if not authenticated
 */
export function getUserFromRequest(req) {
  if (req.user) {
    return {
      "sub": req.user.googleId,
      "email": req.user.email,
      "username": req.user.displayName,
      "cognito:username": req.user.displayName,
      "scope": "read write", // Default scope for compatibility
    };
  }
  return null;
}
