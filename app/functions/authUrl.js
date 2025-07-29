// app/functions/authUrl.js

import dotenv from "dotenv";

import {extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse} from "../lib/responses.js";

dotenv.config({ path: ".env" });

export default function authUrl(state) {
    const clientId = process.env.DIY_SUBMIT_HMRC_CLIENT_ID;
    const redirectUri = process.env.DIY_SUBMIT_HOME_URL;
    const hmrcBase = process.env.DIY_SUBMIT_HMRC_BASE_URI;
    const scope = "write:vat read:vat";
    return `${hmrcBase}/oauth/authorize?response_type=code` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${encodeURIComponent(state)}`;
}

// GET /api/auth-url?state={state}
export async function httpGet(event) {
    let request;
    try {
        const request = extractRequest(event);

        // Validation
        const state = event.queryStringParameters?.state;
        if (!state) {
            return httpBadRequestResponse({
                request,
                message: "Missing state query parameter from URL",
            });
        }

        // Processing
        const authUrlResult = authUrl(state);

        // Generate a success response
        return httpOkResponse({
            request,
            data: {
                authUrl: authUrlResult,
            },
        });
    }catch (error) {
        // Generate a failure response
        return httpServerErrorResponse({
            request: request,
            data: { error, message: "Internal Server Error in httpGet" },
        });
    }
}
