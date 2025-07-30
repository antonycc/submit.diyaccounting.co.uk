// app/functions/submitVat.js

import dotenv from "dotenv";
import fetch from "node-fetch";

import logger from "../lib/logger.js";
import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse, extractClientIPFromHeaders } from "../lib/responses.js";
import eventToGovClientHeaders from "../lib/eventToGovClientHeaders.js";

dotenv.config({ path: ".env" });

export default async function submitVat(periodKey, vatDue, vatNumber, hmrcAccessToken, govClientHeaders) {
    const submissionStartTime = new Date().toISOString();
    
    // Validate access token format
    const tokenValidation = {
        hasAccessToken: !!hmrcAccessToken,
        accessTokenLength: hmrcAccessToken ? hmrcAccessToken.length : 0,
        accessTokenPrefix: hmrcAccessToken ? hmrcAccessToken.substring(0, 8) + "..." : "none",
        isValidFormat: hmrcAccessToken && typeof hmrcAccessToken === 'string' && hmrcAccessToken.length > 10,
        vatNumber,
        periodKey,
        vatDue
    };

    // Enhanced debug logging for access token validation
    logger.info({
        message: "submitVat function called with access token",
        submissionStartTime,
        tokenValidation,
        govClientHeaders: Object.keys(govClientHeaders || {})
    });

    // Early validation - reject if token is clearly invalid
    if (!hmrcAccessToken || typeof hmrcAccessToken !== 'string' || hmrcAccessToken.length < 2) {
        logger.error({
            message: "Invalid access token provided to submitVat",
            tokenValidation,
            error: "Access token is missing, not a string, or too short"
        });
        throw new Error("Invalid access token provided");
    }

    // Request processing
    const hmrcRequestHeaders = {
        "Content-Type": "application/json",
        "Accept": "application/vnd.hmrc.1.0+json",
        "Authorization": `Bearer ${hmrcAccessToken}`,
    }
    const hmrcRequestBody = {
        periodKey,
        vatDueSales: parseFloat(vatDue),
        vatDueAcquisitions: 0,
        totalVatDue: parseFloat(vatDue),
        vatReclaimedCurrPeriod: 0,
        netVatDue: parseFloat(vatDue),
        totalValueSalesExVAT: 0,
        totalValuePurchasesExVAT: 0,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
        finalised: true,
    };

    let hmrcResponseBody;
    let hmrcResponse;
    const hmrcBase = process.env.DIY_SUBMIT_HMRC_BASE_URI;
    const hmrcRequestUrl = `${hmrcBase}/organisations/vat/${vatNumber}/returns`;
    logger.info({
        message: `Request to POST ${hmrcRequestUrl}`,
        url: hmrcRequestUrl,
        environment: {
            hmrcBase,
            nodeEnv: process.env.NODE_ENV
        }
    });
    if (process.env.NODE_ENV === "stubbed") {
        hmrcResponse = {
            ok: true,
            status: 200,
            json: async () => ({access_token: hmrcAccessToken}),
            text: async () => JSON.stringify({access_token: hmrcAccessToken}),
        };
        // DIY_SUBMIT_TEST_RECEIPT is already a JSON string, so parse it first
        hmrcResponseBody = JSON.parse(process.env.DIY_SUBMIT_TEST_RECEIPT || "{}");
        logger.warn({message: "httpPost called in stubbed mode, using test receipt", receipt: hmrcResponseBody});
    } else {
        hmrcResponse = await fetch(hmrcRequestUrl, {
            method: "POST",
            headers: {
                ...hmrcRequestHeaders,
                ...govClientHeaders,
            },
            body: JSON.stringify(hmrcRequestBody),
        });
        hmrcResponseBody = await hmrcResponse.json();
    }
    //const hmrcResponseBody = await hmrcResponse.json();

    // Enhanced logging for response analysis
    const responseLogData = {
        message: `Response from POST ${hmrcRequestUrl}`,
        url: hmrcRequestUrl,
        hmrcResponseStatus: hmrcResponse.status,
        hmrcRequestBody,
    };

    // Add detailed error logging for 403 responses
    if (hmrcResponse.status === 403) {
        responseLogData.error403Analysis = {
            message: "403 Forbidden - Access token may be invalid, expired, or lack required permissions",
            possibleCauses: [
                "Invalid or expired access token",
                "Token lacks required scopes (write:vat read:vat)",
                "Client credentials mismatch",
                "Missing or incorrect Gov-Client headers",
                "HMRC API rate limiting"
            ],
            tokenInfo: {
                hasAccessToken: !!hmrcAccessToken,
                accessTokenLength: hmrcAccessToken ? hmrcAccessToken.length : 0,
                accessTokenPrefix: hmrcAccessToken ? hmrcAccessToken.substring(0, 8) + "..." : "none"
            },
            requestHeaders: {
                authorization: hmrcAccessToken ? `Bearer ${hmrcAccessToken.substring(0, 8)}...` : "missing",
                govClientHeadersCount: Object.keys(govClientHeaders || {}).length,
                govClientHeaderKeys: Object.keys(govClientHeaders || {})
            }
        };
    }

    logger.info(responseLogData);

    return {hmrcRequestBody, receipt: hmrcResponseBody, hmrcResponse, hmrcResponseBody, hmrcRequestUrl};
}

// POST /api/submit-vat
export async function httpPost(event) {
    const request = extractRequest(event);

    const detectedIP = extractClientIPFromHeaders(event);

    // Validation
    let errorMessages = [];
    const { vatNumber, periodKey, vatDue, hmrcAccessToken } = JSON.parse(event.body || "{}");
    if (!vatNumber) {
        errorMessages.push("Missing vatNumber parameter from body");
    }
    if (!periodKey) {
        errorMessages.push("Missing periodKey parameter from body");
    }
    if (!vatDue) {
        errorMessages.push("Missing vatDue parameter from body");
    }
    if (!hmrcAccessToken) {
        errorMessages.push("Missing hmrcAccessToken parameter from body");
    }
    const {
        govClientHeaders,
        govClientErrorMessages
    } = eventToGovClientHeaders(event, detectedIP);
    errorMessages = errorMessages.concat(govClientErrorMessages || []);
    if (errorMessages.length > 0) {
        return httpBadRequestResponse({
            request,
            headers: { ...govClientHeaders },
            message: errorMessages.join(", "),
        });
    }

    // Processing
    let {
        receipt,
        hmrcResponse,
        hmrcResponseBody
    } = await submitVat(periodKey, vatDue, vatNumber, hmrcAccessToken, govClientHeaders);

    if (!hmrcResponse.ok) {
        return httpServerErrorResponse({
            request,
            message: "HMRC VAT submission failed",
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
            receipt,
        },
    });
}
