// app/lib/httpHelper.js

import logger from "./logger.js";

export function buildLambdaEventFromHttpRequest(httpRequest) {
  // Start with a copy of all incoming headers (Express normalizes to lowercase keys)
  const incomingHeaders = { ...(httpRequest.headers || {}) };
  // Ensure host header is present
  incomingHeaders.host = httpRequest.get("host") || incomingHeaders.host || "localhost:3000";
  // Pass through referer if available via accessor (helps construct full URL in logs)
  const referer = httpRequest.get("referer");
  if (referer) incomingHeaders.referer = referer;

  const lambdaEvent = {
    path: httpRequest.path,
    headers: incomingHeaders,
    queryStringParameters: httpRequest.query || {},
  };

  if (httpRequest.params) {
    lambdaEvent.pathParameters = httpRequest.params;
  }
  if (httpRequest.query) {
    lambdaEvent.queryStringParameters = httpRequest.query;
  }
  if (httpRequest.body) {
    lambdaEvent.body = JSON.stringify(httpRequest.body);
  }
  return lambdaEvent;
}

export function buildHttpResponseFromLambdaResult({ headers, statusCode, body }, httpResponse) {
  if (headers) httpResponse.set(headers);
  if (statusCode === 304) {
    return httpResponse.status(304).end();
  }
  try {
    return httpResponse.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    logger.warn(`Response body is not valid JSON, sending as text ${_e}`);
    return httpResponse.status(statusCode).send(body || "");
  }
}

export function logHmrcRequestDetails(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, hmrcBase) {
  logger.info({
    message: `Request to POST ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    headers: {
      ...hmrcRequestHeaders,
      ...govClientHeaders,
    },
    body: hmrcRequestBody,
    environment: {
      nodeEnv: process.env.NODE_ENV,
    },
  });
}
