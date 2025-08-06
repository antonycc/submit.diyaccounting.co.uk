// app/functions/bundle.js

import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import jwt from "jsonwebtoken";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

/**
 * Request a bundle for a user
 * @param {Object} event - Lambda event object
 * @returns {Object} Response object
 */
export async function httpPost(event) {
  try {
    console.log("[DEBUG_LOG] Bundle request received:", JSON.stringify(event, null, 2));

    // Extract Cognito JWT from Authorization header
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        body: JSON.stringify({ error: "Unauthorized - Missing or invalid authorization header" }),
      };
    }

    const token = authHeader.split(" ")[1];

    // Decode JWT to get user's Cognito ID (sub)
    let decodedToken;
    try {
      // Note: In production, you should verify the JWT signature
      decodedToken = jwt.decode(token);
      if (!decodedToken || !decodedToken.sub) {
        throw new Error("Invalid token structure");
      }
    } catch (error) {
      console.log("[DEBUG_LOG] JWT decode error:", error.message);
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Unauthorized - Invalid token" }),
      };
    }

    const userId = decodedToken.sub;
    const userPoolId = process.env.DIY_SUBMIT_USER_POOL_ID;

    if (!userPoolId) {
      console.log("[DEBUG_LOG] Missing USER_POOL_ID environment variable");
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Server configuration error" }),
      };
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || "{}");
    } catch (error) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    const requestedBundle = requestBody.bundleId;
    if (!requestedBundle) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Missing bundleId in request" }),
      };
    }

    console.log("[DEBUG_LOG] Processing bundle request for user:", userId, "bundle:", requestedBundle);

    // Fetch current bundles from Cognito custom attribute
    let currentBundles = [];
    try {
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: userId,
      });

      const userResponse = await cognitoClient.send(getUserCommand);
      const bundlesAttribute = userResponse.UserAttributes?.find((attr) => attr.Name === "custom:bundles");

      if (bundlesAttribute && bundlesAttribute.Value) {
        currentBundles = bundlesAttribute.Value.split("|").filter((bundle) => bundle.length > 0);
      }

      console.log("[DEBUG_LOG] Current user bundles:", currentBundles);
    } catch (error) {
      console.log("[DEBUG_LOG] Error fetching user:", error.message);
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "User not found" }),
      };
    }

    // Check if user already has this bundle
    const hasBundle = currentBundles.some((bundle) => bundle.startsWith(requestedBundle + "|"));
    if (hasBundle) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          status: "already_granted",
          message: "Bundle already granted to user",
          bundles: currentBundles,
        }),
      };
    }

    // Validate bundle against expiry date
    const expiryDate = process.env.DIY_SUBMIT_BUNDLE_EXPIRY_DATE || "2025-12-31";
    if (new Date() > new Date(expiryDate)) {
      return {
        statusCode: 403,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "This bundle has expired." }),
      };
    }

    // Check user limit for this bundle
    const userLimit = parseInt(process.env.DIY_SUBMIT_BUNDLE_USER_LIMIT || "1000");
    const currentCount = await getCurrentUserCountForBundle(requestedBundle, userPoolId);

    if (currentCount >= userLimit) {
      return {
        statusCode: 403,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "User limit reached for this bundle." }),
      };
    }

    // Grant the bundle to the user
    const newBundle = `${requestedBundle}|EXPIRY=${expiryDate}`;
    currentBundles.push(newBundle);

    try {
      const updateCommand = new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: userId,
        UserAttributes: [
          {
            Name: "custom:bundles",
            Value: currentBundles.join("|"),
          },
        ],
      });

      await cognitoClient.send(updateCommand);

      console.log("[DEBUG_LOG] Bundle granted successfully:", newBundle);

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          status: "granted",
          expiryDate,
          bundle: requestedBundle,
          bundles: currentBundles,
        }),
      };
    } catch (error) {
      console.log("[DEBUG_LOG] Error updating user attributes:", error.message);
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Failed to grant bundle" }),
      };
    }
  } catch (error) {
    console.log("[DEBUG_LOG] Unexpected error:", error.message);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}

/**
 * Get current user count for a specific bundle
 * @param {string} bundleId - The bundle ID to count
 * @param {string} userPoolId - The Cognito User Pool ID
 * @returns {number} Current user count
 */
async function getCurrentUserCountForBundle(bundleId, userPoolId) {
  try {
    // Note: This is a simplified implementation. In production, you might want to use
    // a more efficient approach like DynamoDB to track bundle counts
    const listUsersCommand = new ListUsersCommand({
      UserPoolId: userPoolId,
      AttributesToGet: ["custom:bundles"],
      Limit: 60, // Cognito limit
    });

    const response = await cognitoClient.send(listUsersCommand);
    let count = 0;

    for (const user of response.Users || []) {
      const bundlesAttribute = user.Attributes?.find((attr) => attr.Name === "custom:bundles");
      if (bundlesAttribute && bundlesAttribute.Value) {
        const bundles = bundlesAttribute.Value.split("|");
        if (bundles.some((bundle) => bundle.startsWith(bundleId + "|"))) {
          count++;
        }
      }
    }

    console.log("[DEBUG_LOG] Current user count for bundle", bundleId, ":", count);
    return count;
  } catch (error) {
    console.log("[DEBUG_LOG] Error counting users for bundle:", error.message);
    return 0; // Return 0 on error to allow bundle granting
  }
}

/**
 * Handle OPTIONS requests for CORS
 * @param {Object} event - Lambda event object
 * @returns {Object} Response object
 */
export async function httpOptions(event) {
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
    body: "",
  };
}
