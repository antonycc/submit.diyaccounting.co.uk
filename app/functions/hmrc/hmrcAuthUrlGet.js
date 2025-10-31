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

    // Extract requested scope from query params, default to write:vat read:vat for backward compatibility
    const requestedScope = event.queryStringParameters?.scope || "write:vat read:vat";
    
    // Validate scope - only allow known HMRC scopes
    const validScopes = ["write:vat", "read:vat", "write:vat read:vat", "read:vat write:vat"];
    if (!validScopes.includes(requestedScope)) {
      return httpBadRequestResponse({
        request,
        message: "Invalid scope parameter. Must be one of: write:vat, read:vat, or write:vat read:vat",
      });
    }

    const clientId = process.env.HMRC_CLIENT_ID;
    const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
    const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`;
    const hmrcBase = process.env.HMRC_BASE_URI;
    
    const authUrl =
      `${hmrcBase}/oauth/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(requestedScope)}` +
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
