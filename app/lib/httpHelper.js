// app/lib/httpHelper.js

import logger, { context } from "./logger.js";
import { decodeJwtNoVerify } from "./jwtHelper.js";

export function buildLambdaEventFromHttpRequest(httpRequest) {
  // Start with a copy of all incoming headers (Express normalizes to lowercase keys)
  const incomingHeaders = { ...(httpRequest.headers || {}) };
  // Ensure host header is present
  incomingHeaders.host = httpRequest.get("host") || incomingHeaders.host || "localhost:3000";
  // Pass through referer if available via accessor (helps construct full URL in logs)
  const referer = httpRequest.get("referer");
  if (referer) incomingHeaders.referer = referer;

  // Extract bearer token from Authorization header if present
  const authorization = httpRequest.get("x-authorization") || httpRequest.get("authorization");
  const bearerToken = authorization ? authorization.match(/^Bearer (.+)$/) : null;
  const jwtPayload = decodeJwtNoVerify(bearerToken);

  const lambdaEvent = {
    requestContext: {
      authorizer: {
        lambda: {
          jwt: {
            claims: {
              ...jwtPayload,
              "cognito:username": "test",
              "email": "test@test.submit.diyaccunting.co.uk",
              "scope": "read write",
            },
          },
        },
      },
    },
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

export function logHmrcRequestDetails(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody) {
  logger.info({
    message: `Request to POST ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    headers: {
      ...hmrcRequestHeaders,
      ...govClientHeaders,
    },
    body: hmrcRequestBody,
    environment: {
      // nodeEnv: process.env.NODE_ENV,
    },
  });
}

export function http404NotFound(request, message, responseHeaders) {
  // Log with clear semantics and avoid misusing headers as a response code
  logger.warn({ message, request });
  // Return a proper 404 response (was incorrectly returning 400)
  // We keep using the generic bad request builder style but with correct status
  const reqId = context.get("requestId") || String(Date.now());
  return {
    statusCode: 404,
    headers: {
      ...(responseHeaders || {}),
      "x-request-id": reqId,
      ...(context.get("amznTraceId") ? { "x-amzn-trace-id": context.get("amznTraceId") } : {}),
      ...(context.get("traceparent") ? { traceparent: context.get("traceparent") } : {}),
    },
    body: JSON.stringify({ message }),
  };
}
