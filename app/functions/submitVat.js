// app/functions/submitVat.js

import dotenv from "dotenv";
import fetch from "node-fetch";

import logger from "../lib/logger.js";
import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse, extractClientIPFromHeaders } from "../lib/responses.js";
import eventToGovClientHeaders from "../lib/eventToGovClientHeaders.js";

dotenv.config({ path: ".env" });

export default async function submitVat(periodKey, vatDue, vatNumber, hmrcAccessToken, govClientHeaders) {
    // Request processing
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
                "Content-Type": "application/json",
                "Accept": "application/vnd.hmrc.1.0+json",
                "Authorization": `Bearer ${hmrcAccessToken}`,
                ...govClientHeaders,
            },
            body: JSON.stringify(hmrcRequestBody),
        });
        hmrcResponseBody = await hmrcResponse.json();
    }
    //const hmrcResponseBody = await hmrcResponse.json();

    logger.info({
        message: `Response from POST ${hmrcRequestUrl}`,
        url: hmrcRequestUrl,
        hmrcResponseStatus: hmrcResponse.status,
        hmrcRequestBody,
    });

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
