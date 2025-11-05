// app/functions/auth/customAuthorizer.js
// Custom Lambda authorizer that extracts JWT from X-Authorization header
// and validates it against Cognito, similar to native JWT authorizer

import logger from "../../lib/logger.js";
import { CognitoJwtVerifier } from "aws-jwt-verify";

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
  logger.info({
    message: "Custom authorizer invoked",
    routeArn: event.routeArn,
    headers: Object.keys(event.headers || {}),
  });

  try {
    // Extract token from X-Authorization header (case-insensitive)
    const headers = event.headers || {};
    const xAuthHeader = headers["x-authorization"] || headers["X-Authorization"];

    if (!xAuthHeader) {
      logger.warn({ message: "Missing X-Authorization header" });
      return generateDenyPolicy(event.routeArn);
    }

    // Extract Bearer token
    const tokenMatch = xAuthHeader.match(/^Bearer (.+)$/i);
    if (!tokenMatch) {
      logger.warn({ message: "Invalid X-Authorization header format, expected 'Bearer <token>'" });
      return generateDenyPolicy(event.routeArn);
    }

    const token = tokenMatch[1];

    // Verify the JWT token with Cognito
    const jwtVerifier = getVerifier();
    const payload = await jwtVerifier.verify(token);

    logger.info({
      message: "JWT token verified successfully",
      sub: payload.sub,
      username: payload.username,
      scopes: payload.scope,
    });

    // Generate allow policy with JWT claims in context
    return generateAllowPolicy(event.routeArn, payload);
  } catch (error) {
    logger.error({
      message: "Authorization failed",
      error: error.message,
      errorType: error.name,
      stack: error.stack,
    });
    return generateDenyPolicy(event.routeArn);
  }
}

// Generate IAM policy to allow access
function generateAllowPolicy(routeArn, jwtPayload) {
  return {
    principalId: jwtPayload.sub,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: routeArn,
        },
      ],
    },
    context: {
      // Pass JWT claims to the Lambda function via context
      sub: jwtPayload.sub,
      username: jwtPayload.username || jwtPayload.sub,
      email: jwtPayload.email || "",
      scope: jwtPayload.scope || "",
      // Store the entire token for downstream use if needed
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
