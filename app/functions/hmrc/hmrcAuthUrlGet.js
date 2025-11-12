// app/functions/hmrcAuthUrlGet.js

import { extractRequest, http400BadRequestResponse, http200OkResponse, http500ServerErrorResponse } from "../../lib/responses.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpHelper.js";

export function apiEndpoint(app) {
  app.get("/api/v1/hmrc/authUrl", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await handler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}

// GET /api/v1/hmrc/authUrl?state={state}&scope={scope}
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "HMRC_CLIENT_ID", "DIY_SUBMIT_BASE_URL"]);

  const { request, requestId } = extractRequest(event);
  const state = event.queryStringParameters?.state;
  const sandbox = event.queryStringParameters?.sandbox;

  if (!state) {
    return http400BadRequestResponse({
      request,
      message: "Missing state query parameter from URL",
    });
  }

  try {
    const requestedScope = event.queryStringParameters?.scope || "write:vat read:vat";
    const validScopes = ["write:vat", "read:vat", "write:vat read:vat", "read:vat write:vat"];

    if (!validScopes.includes(requestedScope)) {
      return http400BadRequestResponse({
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

    return http200OkResponse({
      request,
      data: { authUrl },
    });
  } catch (error) {
    return http500ServerErrorResponse({
      request,
      requestId,
      data: { error, message: "Internal Server Error in httpGetHmrc" },
    });
  }
}
