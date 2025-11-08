// app/functions/hmrcAuthUrlGet.js

import { extractRequest, httpBadRequestResponse, httpOkResponse, httpServerErrorResponse } from "../../lib/responses.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";

export function apiEndpoint(app) {
  app.get("/api/v1/hmrc/authUrl", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

// GET /api/v1/hmrc/authUrl?state={state}&scope={scope}&sandbox={true|false}
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "HMRC_CLIENT_ID", "DIY_SUBMIT_BASE_URL"]);

  const request = extractRequest(event);
  const state = event.queryStringParameters?.state;

  if (!state) {
    return httpBadRequestResponse({
      request,
      message: "Missing state query parameter from URL",
    });
  }

  try {
    const requestedScope = event.queryStringParameters?.scope || "write:vat read:vat";
    const validScopes = ["write:vat", "read:vat", "write:vat read:vat", "read:vat write:vat"];

    if (!validScopes.includes(requestedScope)) {
      return httpBadRequestResponse({
        request,
        message: "Invalid scope parameter. Must be one of: write:vat, read:vat, or write:vat read:vat",
      });
    }

    const useSandbox = event.queryStringParameters?.sandbox === "true";
    const clientId = useSandbox && process.env.HMRC_SANDBOX_CLIENT_ID 
      ? process.env.HMRC_SANDBOX_CLIENT_ID 
      : process.env.HMRC_CLIENT_ID;
    const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
    const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`;
    const hmrcBase = useSandbox && process.env.HMRC_SANDBOX_BASE_URI
      ? process.env.HMRC_SANDBOX_BASE_URI
      : process.env.HMRC_BASE_URI;

    const authUrl =
      `${hmrcBase}/oauth/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(requestedScope)}` +
      `&state=${encodeURIComponent(state)}`;

    return httpOkResponse({
      request,
      data: { authUrl },
    });
  } catch (error) {
    return httpServerErrorResponse({
      request,
      data: { error, message: "Internal Server Error in httpGetHmrc" },
    });
  }
}
