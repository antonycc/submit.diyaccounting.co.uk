// app/functions/bundleDelete.js

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

export function __getInMemoryBundlesStore() {
  return __inMemoryBundles;
}

function isMockMode() {
  return String(process.env.TEST_BUNDLE_MOCK || "").toLowerCase() === "true" || process.env.TEST_BUNDLE_MOCK === "1";
}

/**
 * Remove a bundle for a user
 * @param {Object} event - Lambda event object
 * @returns {Object} Response object
 */
export async function handler(event) {
  try {
    console.log("[DEBUG_LOG] Bundle delete request received:", JSON.stringify(event, null, 2));

    // Extract Cognito JWT from Authorization header
    const authorization = event.headers?.authorization || event.headers?.Authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Missing or invalid Authorization header" }),
      };
    }

    const token = authorization.substring("Bearer ".length);
    const payload = decodeJwtNoVerify(token);
    if (!payload?.sub) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Invalid token: no subject" }),
      };
    }

    const userId = payload.sub;
    const body = JSON.parse(event.body || "{}");
    const bundleToRemove = body.bundleId;
    const removeAll = body.removeAll;

    // Validate that we have either a specific bundle ID or removeAll flag
    if (!bundleToRemove && !removeAll) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Missing bundle Id in request" }),
      };
    }

    // Get current bundles for the user
    let currentBundles = [];
    if (isMockMode()) {
      currentBundles = __inMemoryBundles.get(userId) || [];
    } else {
      const userPoolId = process.env.COGNITO_USER_POOL_ID;
      if (!userPoolId) {
        return {
          statusCode: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({ error: "Server configuration error" }),
        };
      }
      try {
        const mod = await getCognitoModule();
        const client = await getCognitoClient();
        const getUserCommand = new mod.AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: userId,
        });
        const userResponse = await client.send(getUserCommand);
        const bundlesAttribute = userResponse.UserAttributes?.find((attr) => attr.Name === "custom:bundles");
        if (bundlesAttribute && typeof bundlesAttribute.Value === "string") {
          currentBundles = bundlesAttribute.Value.split("|").filter((bundle) => bundle.length > 0);
        }
      } catch (error) {
        console.log("[DEBUG_LOG] Error fetching user for delete:", error?.message || error);
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

    if (removeAll) {
      // Remove all bundles
      if (isMockMode()) {
        __inMemoryBundles.set(userId, []);
      } else {
        try {
          const userPoolId = process.env.COGNITO_USER_POOL_ID;
          const mod = await getCognitoModule();
          const client = await getCognitoClient();
          const updateCommand = new mod.AdminUpdateUserAttributesCommand({
            UserPoolId: userPoolId,
            Username: userId,
            UserAttributes: [{ Name: "custom:bundles", Value: "" }],
          });
          await client.send(updateCommand);
        } catch (error) {
          console.log("[DEBUG_LOG] Error clearing bundles in Cognito:", error?.message || error);
          return {
            statusCode: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({ error: "Failed to remove all bundles" }),
          };
        }
      }
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          status: "removed_all",
          message: "All bundles removed",
          bundles: [],
        }),
      };
    } else {
      // Remove specific bundle
      const bundlesAfterRemoval = currentBundles.filter((bundle) => !bundle.startsWith(bundleToRemove + "|") && bundle !== bundleToRemove);

      if (bundlesAfterRemoval.length === currentBundles.length) {
        return {
          statusCode: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({ error: "Bundle not found" }),
        };
      }

      if (isMockMode()) {
        __inMemoryBundles.set(userId, bundlesAfterRemoval);
      } else {
        try {
          const userPoolId = process.env.COGNITO_USER_POOL_ID;
          const mod = await getCognitoModule();
          const client = await getCognitoClient();
          const updateCommand = new mod.AdminUpdateUserAttributesCommand({
            UserPoolId: userPoolId,
            Username: userId,
            UserAttributes: [{ Name: "custom:bundles", Value: bundlesAfterRemoval.join("|") }],
          });
          await client.send(updateCommand);
        } catch (error) {
          console.log("[DEBUG_LOG] Error updating bundles in Cognito:", error?.message || error);
          return {
            statusCode: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({ error: "Failed to remove bundle" }),
          };
        }
      }

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          status: "removed",
          message: "Bundle removed",
          bundle: bundleToRemove,
          bundles: bundlesAfterRemoval,
        }),
      };
    }
  } catch (error) {
    console.log("[DEBUG_LOG] Unexpected error in httpDelete:", error?.message || error);
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
