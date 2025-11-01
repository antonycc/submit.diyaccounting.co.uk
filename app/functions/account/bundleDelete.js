// app/functions/bundleDelete.js
import { validateEnv } from "../../lib/env.js";
import logger from "../../lib/logger.js";
import { extractRequest } from "../../lib/responses.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { getBundlesStore } from "../non-lambda-mocks/mockBundleStore.js";

const mockBundleStore = getBundlesStore();

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

function isMockMode() {
  return String(process.env.TEST_BUNDLE_MOCK || "").toLowerCase() === "true" || process.env.TEST_BUNDLE_MOCK === "1";
}

export function apiEndpoint(app) {
  app.delete("/api/v1/bundle", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export async function handler(event) {
  const request = extractRequest(event);
  logger.info({ message: "bundlePost entry", route: "/api/v1/bundle", request });

  validateEnv(["COGNITO_USER_POOL_ID"]);

  try {
    logger.info({ message: "Bundle delete request received:", event });
    let decodedToken;
    try {
      decodedToken = decodeJwtToken(event.headers);
    } catch (error) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(error),
      };
    }
    const userId = decodedToken.sub;
    const body = JSON.parse(event.body || "{}");
    const bundleToRemove = body.bundleId;
    const removeAll = body.removeAll;

    // Validate that we have either a specific bundle ID or removeAll flag
    if (!bundleToRemove && !removeAll) {
      logger.error({ message: "Missing bundle Id in request" });
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
      currentBundles = mockBundleStore.get(userId) || [];
      logger.info({ message: `[MOCK] current bundles for user ${userId}:`, bundles: currentBundles });
    } else {
      logger.info({ message: `Fetching current bundles for user ${userId} from Cognito` });
      const userPoolId = process.env.COGNITO_USER_POOL_ID;
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
        logger.info({ message: `Current bundles for user ${userId}:`, bundles: currentBundles });
      } catch (error) {
        logger.error({ message: "Error fetching user for delete:", error: error.message });
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
        mockBundleStore.set(userId, []);
        logger.info({ message: `[MOCK] All bundles removed for user ${userId}` });
      } else {
        logger.info({ message: `Clearing all bundles for user ${userId} in Cognito` });
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
          logger.info({ message: `All bundles cleared for user ${userId}` });
        } catch (error) {
          logger.error({ message: "Error clearing bundles for user:", error: error.message });
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
      logger.info({ message: `All bundles removed for user ${userId}` });
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
      logger.info({ message: `Removing bundle ${bundleToRemove} for user ${userId}` });
      const bundlesAfterRemoval = currentBundles.filter((bundle) => !bundle.startsWith(bundleToRemove + "|") && bundle !== bundleToRemove);

      if (bundlesAfterRemoval.length === currentBundles.length) {
        logger.error({ message: `Bundle ${bundleToRemove} not found for user ${userId}` });
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
        mockBundleStore.set(userId, bundlesAfterRemoval);
        logger.info({ message: `[MOCK] Bundle ${bundleToRemove} removed for user ${userId}` });
      } else {
        logger.info({ message: `Updating bundles for user ${userId} in Cognito` });
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
          logger.info({ message: `Bundle ${bundleToRemove} removed for user ${userId}` });
        } catch (error) {
          logger.error({ message: "Error updating bundles for user:", error: error.message });
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

      logger.info({ message: `Bundle ${bundleToRemove} removed for user ${userId}` });
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
    logger.error({ message: "Unexpected error in bundleDelete:", error: error?.message || String(error) });
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
