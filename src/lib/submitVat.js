import logger from "./logger.js";
import fetch from "node-fetch";

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

    let receipt;
    let hmrcResponse;
    const hmrcBase = process.env.DIY_SUBMIT_HMRC_BASE_URI;
    const hmrcRequestUrl = `${hmrcBase}/organisations/vat/${vatNumber}/returns`;
    if (process.env.NODE_ENV === "stubbed") {
        hmrcResponse = {
            ok: true,
            status: 200,
            json: async () => ({access_token: hmrcTestAccessToken}),
            text: async () => JSON.stringify({access_token: hmrcAccessToken}),
        };
        // DIY_SUBMIT_TEST_RECEIPT is already a JSON string, so parse it first
        receipt = JSON.parse(process.env.DIY_SUBMIT_TEST_RECEIPT || "{}");
        logger.warn({message: "submitVatHandler called in stubbed mode, using test receipt", receipt});
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
        receipt = await hmrcResponse.json();
    }
    return {hmrcRequestBody, receipt, hmrcResponse, hmrcRequestUrl};
}