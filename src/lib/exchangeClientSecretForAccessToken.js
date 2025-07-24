import logger from "./logger.js";
import fetch from "node-fetch";

export default async function exchangeClientSecretForAccessToken(code) {
    const hmrcRequestBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.DIY_SUBMIT_HMRC_CLIENT_ID,
        client_secret: process.env.DIY_SUBMIT_HMRC_CLIENT_SECRET,
        redirect_uri: process.env.DIY_SUBMIT_HOME_URL,
        code,
    });
    const hmrcBase = process.env.DIY_SUBMIT_HMRC_BASE_URI;
    const hmrcRequestUrl = `${hmrcBase}/oauth/token`;
    let hmrcResponse;
    if (process.env.NODE_ENV === "stubbed") {
        logger.warn({message: "exchangeTokenHandler called in stubbed mode, using test access token"});
        const hmrcoptionalTestAccessToken = process.env.DIY_SUBMIT_TEST_ACCESS_TOKEN;
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
    const hmrcAccessToken = hmrcResponseTokens.access_token;

    return {
        hmrcAccessToken,
        hmrcResponse,
    };
}
