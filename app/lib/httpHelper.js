// app/lib/httpHelper.js

import logger from "./logger.js";

export function buildLambdaEventFromHttpRequest(httpRequest) {
  const lambdaEvent = {
    path: httpRequest.path,
    headers: { host: httpRequest.get("host") || "localhost:3000" },
    queryStringParameters: httpRequest.query || {},
  };
  const passThroughHeaders = ["if-none-match", "if-modified-since", "authorization"];
  for (const h of passThroughHeaders) {
    const v = httpRequest.get(h); // case-insensitive lookup
    if (v) lambdaEvent.headers[h] = v;
  }
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
