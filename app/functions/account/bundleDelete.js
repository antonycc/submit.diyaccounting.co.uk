// app/functions/bundleDelete.js
import { validateEnv } from "../../lib/env.js";
import logger from "../../lib/logger.js";
import { extractRequest, parseRequestBody } from "../../lib/responses.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";
import { getUserBundles, updateUserBundles } from "../../lib/bundleHelpers.js";

export function apiEndpoint(app) {
  app.delete("/api/v1/bundle", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  // Also support deletion via path parameter for parity with API Gateway
  app.delete("/api/v1/bundle/:id", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

export async function handler(event) {
  const request = extractRequest(event);
  logger.info({ message: "bundleDelete entry", route: "/api/v1/bundle", request });

  validateEnv(["COGNITO_USER_POOL_ID"]);

  try {
    logger.info({ message: "Bundle delete request received:", event });
    let decodedToken;
    try {
      decodedToken = decodeJwtToken(event.headers);
    } catch (error) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(error),
      };
    }
    const userId = decodedToken.sub;
    const body = parseRequestBody(event);
    // Accept bundle id via body.bundleId, path parameter {id}, or query parameter bundleId
    const pathId = event?.pathParameters?.id;
    const queryId = event?.queryStringParameters?.bundleId;
    const bundleToRemove = body?.bundleId || pathId || queryId;
    // Accept removeAll via body.removeAll or query removeAll=true
    const removeAll = Boolean(body?.removeAll || String(event?.queryStringParameters?.removeAll || "").toLowerCase() === "true");

    if (!bundleToRemove && !removeAll) {
      logger.error({ message: "Missing bundle Id in request" });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Missing bundle Id in request" }),
      };
    }

    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const currentBundles = await getUserBundles(userId, userPoolId);

    if (removeAll) {
      // Use DynamoDB as primary storage via updateUserBundles
      await updateUserBundles(userId, userPoolId, []);
      logger.info({ message: `All bundles removed for user ${userId}` });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          status: "removed_all",
          message: "All bundles removed",
          bundles: [],
        }),
      };
    }

    logger.info({ message: `Removing bundle ${bundleToRemove} for user ${userId}` });
    const bundlesAfterRemoval = currentBundles.filter((bundle) => !bundle.startsWith(bundleToRemove + "|") && bundle !== bundleToRemove);

    if (bundlesAfterRemoval.length === currentBundles.length) {
      logger.error({ message: `Bundle ${bundleToRemove} not found for user ${userId}` });
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Bundle not found" }),
      };
    }

    // Use DynamoDB as primary storage via updateUserBundles
    await updateUserBundles(userId, userPoolId, bundlesAfterRemoval);
    logger.info({ message: `Bundle ${bundleToRemove} removed for user ${userId}` });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        status: "removed",
        message: "Bundle removed",
        bundle: bundleToRemove,
        bundles: bundlesAfterRemoval,
      }),
    };
  } catch (error) {
    logger.error({ message: "Unexpected error in bundleDelete:", error: error?.message || String(error) });
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}
