// app/functions/exchangeToken.js

import fetch from "node-fetch";
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import dotenv from "dotenv";

import logger from "../lib/logger.js";
import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";

dotenv.config({ path: ".env" });

const secretsClient = new SecretsManagerClient();

let cachedSecret; // caching via module-level variable

export default async function exchangeToken(code) {
    await retrieveSecret();
    const hmrcRequestBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.DIY_SUBMIT_HMRC_CLIENT_ID,
        client_secret: cachedSecret,
        redirect_uri: process.env.DIY_SUBMIT_HOME_URL,
        code,
    });
    const hmrcBase = process.env.DIY_SUBMIT_HMRC_BASE_URI;
    const hmrcRequestUrl = `${hmrcBase}/oauth/token`;

    let hmrcResponse;
    logger.info({
        message: `Request to POST ${hmrcRequestUrl}`,
        url: hmrcRequestUrl,
    });
    if (process.env.NODE_ENV === "stubbed") {
        logger.warn({message: "httpPost called in stubbed mode, using test access token"});
        const hmrcTestAccessToken = process.env.DIY_SUBMIT_TEST_ACCESS_TOKEN;
        hmrcResponse = {
            ok: true,
            status: 200,
            json: async () => ({access_token: hmrcTestAccessToken}),
            text: async () => JSON.stringify({access_token: hmrcTestAccessToken}),
        };
    } else {
        hmrcResponse = await fetch(hmrcRequestUrl, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: hmrcRequestBody,
        });
    }

    const hmrcResponseTokens = await hmrcResponse.json();
    logger.info({
        message: "exchangeClientSecretForAccessToken response",
        hmrcResponseStatus: hmrcResponse.status,
        hmrcResponseTokens,
    });

    const hmrcAccessToken = hmrcResponseTokens.access_token;
    const hmrcResponseBody = { ...hmrcResponseTokens };
    delete hmrcResponseBody.access_token;

    return {
        hmrcAccessToken,
        hmrcResponse,
        hmrcResponseBody
    };
}

// POST /api/exchange-token
export async function httpPost(event) {
    const request = extractRequest(event);

    // Validation
    const { code } = JSON.parse(event.body || "{}");
    if (!code) {
        return httpBadRequestResponse({
            request,
            message: "Missing code from event body",
        });
    }

    let { hmrcAccessToken, hmrcResponse, hmrcResponseBody } = await exchangeToken(code);

    if (!hmrcResponse.ok) {
        return httpServerErrorResponse({
            request,
            message: "HMRC token exchange failed",
            error: {
                hmrcResponseCode: hmrcResponse.status,
                hmrcResponseBody,
            },
        });
    }

    // Generate a success response
    return httpOkResponse({
        request,
        data: {
            hmrcAccessToken,
        },
    });
}

async function retrieveSecret() {
    const secretFromEnv = process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET;
    // Always update the secret from the environment variable if it exists
    if (secretFromEnv) {
        cachedSecret = secretFromEnv;
        logger.info(`Secret retrieved from environment variable DIY_SUBMIT_HMRC_CLIENT_SECRET and cached`);
        // Only update the cached secret if it isn't set
    } else if (!cachedSecret) {
        const secretArn = process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN; // set via Lambda environment variable
        const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
        cachedSecret = data.SecretString;
        logger.info(`Secret retrieved from Secrets Manager with Arn ${secretArn} and cached`);
    }
    return cachedSecret;
};

// Export function to reset cached secret for testing
export function resetCachedSecret() {
    cachedSecret = undefined;
}

