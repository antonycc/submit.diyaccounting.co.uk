// app/functions/bundle.js

// AWS Cognito SDK is loaded lazily only when not in MOCK mode to avoid requiring it during tests
let __cognitoModule;
let __cognitoClient;
async function getCognitoModule() {
  if (!__cognitoModule) {
    __cognitoModule = await import("@aws-sdk/client-cognito-identity-provider");
  }
  return __cognitoModule;
}
async function getCognitoClient() {
  if (!__cognitoClient) {
    const mod = await getCognitoModule();
    __cognitoClient = new mod.CognitoIdentityProviderClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return __cognitoClient;
}
// Lightweight JWT decode (no signature verification)
function decodeJwtNoVerify(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (_err) {
    return null;
  }
}


// In-memory store for MOCK mode (no AWS required). Map<userSub, string[]>
const __inMemoryBundles = new Map();

function isMockMode() {
  return String(process.env.DIY_SUBMIT_BUNDLE_MOCK || "").toLowerCase() === "true" || process.env.DIY_SUBMIT_BUNDLE_MOCK === "1";
}

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
    const decodedToken = decodeJwtNoVerify(token);
    if (!decodedToken || !decodedToken.sub) {
      console.log("[DEBUG_LOG] JWT decode failed or missing sub");
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

    if (!userPoolId && !isMockMode()) {
      console.log("[DEBUG_LOG] Missing USER_POOL_ID environment variable (non-mock mode)");
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

    // Fetch current bundles from Cognito custom attribute or MOCK store
    let currentBundles = [];
    if (isMockMode()) {
      currentBundles = __inMemoryBundles.get(userId) || [];
      console.log("[DEBUG_LOG] [MOCK] Current user bundles:", currentBundles);
    } else {
      try {
        const mod = await getCognitoModule();
        const client = await getCognitoClient();
        const getUserCommand = new mod.AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: userId,
        });
        const userResponse = await client.send(getUserCommand);
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
    let currentCount;
    if (isMockMode()) {
      // Count users in the in-memory store that have this bundle
      currentCount = 0;
      for (const bundles of __inMemoryBundles.values()) {
        if ((bundles || []).some((b) => typeof b === "string" && b.startsWith(requestedBundle + "|"))) {
          currentCount++;
        }
      }
    } else {
      currentCount = await getCurrentUserCountForBundle(requestedBundle, userPoolId);
    }

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

    if (isMockMode()) {
      // Update in-memory store and return success without AWS calls
      __inMemoryBundles.set(userId, currentBundles);
      console.log("[DEBUG_LOG] [MOCK] Bundle granted successfully:", newBundle);
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
    }

    try {
      const mod = await getCognitoModule();
      const client = await getCognitoClient();
      const updateCommand = new mod.AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: userId,
        UserAttributes: [
          {
            Name: "custom:bundles",
            Value: currentBundles.join("|"),
          },
        ],
      });

      await client.send(updateCommand);

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
      console.log("[DEBUG_LOG] Error updating user attributes:", error?.message || error);
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
    const mod = await getCognitoModule();
    const client = await getCognitoClient();
    const listUsersCommand = new mod.ListUsersCommand({
      UserPoolId: userPoolId,
      AttributesToGet: ["custom:bundles"],
      Limit: 60, // Cognito limit
    });

    const response = await client.send(listUsersCommand);
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
    console.log("[DEBUG_LOG] Error counting users for bundle:", error?.message || error);
    return 0; // Return 0 on error to allow bundle granting
  }
}

/**
 * Handle OPTIONS requests for CORS
 * @param {Object} event - Lambda event object
 * @returns {Object} Response object
 */
export async function httpOptions(_event) {
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
