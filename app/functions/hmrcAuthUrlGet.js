// app/functions/hmrcAuthUrlGet.js

import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";
import { validateEnv } from "../lib/env.js";

// GET /api/hmrc/authUrl-get?state={state}
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "HMRC_CLIENT_ID", "DIY_SUBMIT_BASE_URL"]);

  const clientId = process.env.HMRC_CLIENT_ID;
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`;
  const hmrcBase = process.env.HMRC_BASE_URI;
  const state = event.queryStringParameters?.state;
  const scope = "write:vat read:vat";
  const authUrl =
    `${hmrcBase}/oauth/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

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

    // Processing - occurs in the caller to allow different authUrl construction

    // Generate a success response
    return httpOkResponse({
      request,
      data: {
        authUrl,
      },
    });
  } catch (error) {
    // Generate a failure response
    return httpServerErrorResponse({
      request: request,
      data: { error, message: "Internal Server Error in httpGetHmrc" },
    });
  }
}
