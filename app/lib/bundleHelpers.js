// app/lib/bundleHelpers.js

import logger from "./logger.js";
import { getBundlesStore } from "../functions/non-lambda-mocks/mockBundleStore.js";

const mockBundleStore = getBundlesStore();

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

export function isMockMode() {
  return String(process.env.TEST_BUNDLE_MOCK || "").toLowerCase() === "true" || process.env.TEST_BUNDLE_MOCK === "1";
}

export async function getUserBundles(userId, userPoolId) {
  if (isMockMode()) {
    const bundles = mockBundleStore.get(userId) || [];
    logger.info({ message: "[MOCK] Current user bundles:", bundles });
    return bundles;
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
    const bundles =
      bundlesAttribute && bundlesAttribute.Value ? bundlesAttribute.Value.split("|").filter((bundle) => bundle.length > 0) : [];
    logger.info({ message: "Current user bundles:", bundles });
    return bundles;
  } catch (error) {
    logger.error({ message: "Error fetching user:", error: error.message });
    throw error;
  }
}

export async function updateUserBundles(userId, userPoolId, bundles) {
  if (isMockMode()) {
    mockBundleStore.set(userId, bundles);
    logger.info({ message: `[MOCK] Updated bundles for user ${userId}`, bundles });
    return;
  }

  try {
    const mod = await getCognitoModule();
    const client = await getCognitoClient();
    const updateCommand = new mod.AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: userId,
      UserAttributes: [{ Name: "custom:bundles", Value: bundles.join("|") }],
    });
    await client.send(updateCommand);
    logger.info({ message: `Updated bundles for user ${userId}`, bundles });
  } catch (error) {
    logger.error({ message: "Error updating bundles for user:", error: error.message });
    throw error;
  }
}
