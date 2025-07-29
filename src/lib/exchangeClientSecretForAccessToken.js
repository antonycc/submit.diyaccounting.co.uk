import logger from "./logger.js";
import fetch from "node-fetch";
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient();

let cachedSecret; // caching via module-level variable

// Retrieve secret at initialization unless the secret is already in the environment
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

export default async function exchangeClientSecretForAccessToken(code) {
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
        logger.warn({message: "exchangeTokenHandler called in stubbed mode, using test access token"});
        const hmrcTestAccessToken = process.env.DIY_SUBMIT_TEST_ACCESS_TOKEN;
        hmrcResponse = {
            ok: true,
            status: 200,
            json: async () => ({access_token: hmrcTestAccessToken}),
            text: async () => JSON.stringify({access_token: hmrcAccessToken}),
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
