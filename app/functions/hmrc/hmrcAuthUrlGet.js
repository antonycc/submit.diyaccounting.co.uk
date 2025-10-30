// app/functions/hmrcAuthUrlGet.js

import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../../lib/responses.js";
import { validateEnv } from "../../lib/env.js";

// GET /api/v1/hmrc/authUrl?state={state}&scope={scope}
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "HMRC_CLIENT_ID", "DIY_SUBMIT_BASE_URL"]);

  let request = "Not created";
  try {
    request = extractRequest(event);

    // Validation
    const state = event.queryStringParameters?.state;
    if (!state) {
      return httpBadRequestResponse({
        request,
        message: "Missing state query parameter from URL",
      });
    }

    const clientId = process.env.HMRC_CLIENT_ID;
    const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
    const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`;
    const hmrcBase = process.env.HMRC_BASE_URI;

    // Allow dynamic scope, default to both read and write
    const requestedScope = event.queryStringParameters?.scope;
    const scope = requestedScope || "write:vat read:vat";

    const authUrl =
      `${hmrcBase}/oauth/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;

    return httpOkResponse({
      request,
      data: {
        authUrl,
      },
    });
  } catch (error) {
    return httpServerErrorResponse({
      request: request,
      data: { error, message: "Internal Server Error in httpGetHmrc" },
    });
  }
}
