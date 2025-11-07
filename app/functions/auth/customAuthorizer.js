// app/functions/auth/customAuthorizer.js
// Custom Lambda authorizer that extracts JWT from X-Authorization header
// and validates it against Cognito, similar to native JWT authorizer

import logger from "../../lib/logger.js";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { decodeJwtNoVerify } from "../../lib/jwtHelper.js";

// Cache the verifier instance across Lambda invocations
let verifier = null;

function getVerifier() {
  if (!verifier) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_USER_POOL_CLIENT_ID;

    if (!userPoolId || !clientId) {
      throw new Error("Missing COGNITO_USER_POOL_ID or COGNITO_USER_POOL_CLIENT_ID environment variables");
    }

    verifier = CognitoJwtVerifier.create({
      userPoolId: userPoolId,
      tokenUse: "access",
      clientId: clientId,
    });

    logger.info({
      message: "Created Cognito JWT verifier",
      userPoolId,
      clientId: clientId.substring(0, 8) + "...",
    });
  }
  return verifier;
}

// Lambda authorizer handler
export async function handler(event) {
  // HTTP API v2 uses routeArn or methodArn
  const routeArn = event.routeArn || event.methodArn;

  logger.info({
    message: "Custom authorizer invoked",
    routeArn: routeArn,
    requestContext: event.requestContext,
    headers: Object.keys(event.headers || {}),
    identitySource: event.identitySource,
  });

  try {
    // Extract token from X-Authorization header (case-insensitive)
    const headers = event.headers || {};
    let xAuthHeader = null;

    // Case-insensitive header lookup
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === "x-authorization") {
        xAuthHeader = value;
        break;
      }
    }

    if (!xAuthHeader) {
      logger.warn({ message: "Missing X-Authorization header", headers: Object.keys(headers) });
      return generateDenyPolicy(routeArn);
    }

    // Extract Bearer token
    const tokenMatch = xAuthHeader.match(/^Bearer (.+)$/i);
    if (!tokenMatch) {
      logger.warn({
        message: "Invalid X-Authorization header format, expected 'Bearer <token>'",
        headerValue: xAuthHeader.substring(0, 20),
      });
      return generateDenyPolicy(routeArn);
    }

    const token = tokenMatch[1].trim();

    // Check if we're in test/mock mode (NODE_ENV === 'stubbed' or TEST_ACCESS_TOKEN is set)
    const isMockMode = process.env.NODE_ENV === "stubbed" || process.env.TEST_ACCESS_TOKEN;

    let payload;

    if (isMockMode) {
      // In mock mode, just decode the JWT without verification
      logger.info({ message: "Running in mock mode, skipping JWT verification" });
      payload = decodeJwtNoVerify(token);

      if (!payload || !payload.sub) {
        logger.warn({ message: "Invalid JWT structure in mock mode" });
        return generateDenyPolicy(routeArn);
      }

      logger.info({
        message: "Mock JWT decoded successfully",
        sub: payload.sub,
        username: payload.username,
      });
    } else {
      // Production mode - verify the JWT token with Cognito
      const jwtVerifier = getVerifier();
      payload = await jwtVerifier.verify(token);

      logger.info({
        message: "JWT token verified successfully",
        sub: payload.sub,
        username: payload.username,
        scopes: payload.scope,
      });
    }

    // Generate allow policy with JWT claims in context
    return generateAllowPolicy(routeArn, payload);
  } catch (error) {
    logger.error({
      message: "Authorization failed",
      error: error.message,
      errorType: error.name,
      stack: error.stack,
    });
    return generateDenyPolicy(routeArn);
  }
}

// Generate IAM policy to allow access
function generateAllowPolicy(routeArn, jwtPayload) {
  // Extract API Gateway ARN components and create a wildcard policy
  // routeArn format: arn:aws:execute-api:region:account-id:api-id/stage/method/resource
  // We need to allow access to the specific route
  let policyResource = routeArn;

  // If routeArn contains specific route details, we might need to adjust it
  // For HTTP API v2, we typically allow the specific route
  if (routeArn && routeArn.includes("execute-api")) {
    // Keep the specific routeArn as is for HTTP API v2
    policyResource = routeArn;
  }

  // Flatten all JWT claims into simple string values for context
  const flatContext = {};
  for (const [k, v] of Object.entries(jwtPayload || {})) {
    if (v === undefined || v === null) continue;
    switch (typeof v) {
      case "string":
      case "number":
      case "boolean":
        flatContext[k] = String(v);
        break;
      default:
        try {
          flatContext[k] = JSON.stringify(v);
        } catch (_e) {
          flatContext[k] = String(v);
        }
    }
  }
  // Ensure common time claims are strings (overwrite if necessary)
  if (jwtPayload) {
    flatContext.auth_time = String(jwtPayload.auth_time || flatContext.auth_time || "");
    flatContext.iat = String(jwtPayload.iat || flatContext.iat || "");
    flatContext.exp = String(jwtPayload.exp || flatContext.exp || "");
  }

  return {
    principalId: jwtPayload.sub,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: policyResource,
        },
      ],
    },
    context: {
      // Context values for HTTP API Lambda authorizer (IAM response type) must be simple types.
      // Avoid nested objects to prevent API Gateway 500 errors.
      ...flatContext,
      sub: jwtPayload.sub,
      username: jwtPayload["cognito:username"] || jwtPayload.username || jwtPayload.sub,
      email: jwtPayload.email || "",
      scope: jwtPayload.scope || "",
      token_use: jwtPayload.token_use || "access",
      auth_time: String(jwtPayload.auth_time || ""),
      iat: String(jwtPayload.iat || ""),
      exp: String(jwtPayload.exp || ""),
    },
  };
}

// Generate IAM policy to deny access
function generateDenyPolicy(routeArn) {
  return {
    principalId: "user",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Deny",
          Resource: routeArn,
        },
      ],
    },
  };
}
