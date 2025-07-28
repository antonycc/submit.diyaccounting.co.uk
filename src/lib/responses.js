// src/lib/responses.js

import logger from "@src/lib/logger.js";

export function httpOkResponse({request, headers, data}) {
  return httpResponse({
    statusCode: 200,
    request,
    headers,
    data,
    levelledLogger: logger.info
  });
}

export function httpBadRequestResponse({request, headers, message}) {
  return httpResponse({
    statusCode: 400,
    request,
    headers,
    data: {message},
    levelledLogger: logger.error
  });
}

export function httpServerErrorResponse({request, headers, message, error}) {
  return httpResponse({
    statusCode: 500,
    request,
    headers,
    data: {message, ...error},
    levelledLogger: logger.error
  });
}

function httpResponse({statusCode, headers, data, request, levelledLogger}) {
  const response = {
    statusCode: statusCode,
    headers: {
      ...headers,
    },
    body: JSON.stringify({
      ...data,
    }),
  };
  if (request) {
    levelledLogger("Responding to request with response", request, response);
  } else {
    levelledLogger("Responding with response", response);
  }
  return response;
}

export function extractRequest(event) {
  let request;
  if (event.headers && event.headers.host) {
    try {
      const host = event.headers.host;
      const path = event.rawPath || event.path || event.requestContext?.http?.path || '';
      const queryString = event.rawQueryString || '';
      request = new URL(`${path}?${queryString}`, `https://${host}`);
      //Object.keys(event.queryStringParameters).forEach((key) => {
      //  url.searchParams.append(key, event.queryStringParameters[key]);
      //});
      logger.info({message: "Processing request with event", request, event});
    } catch (err) {
      logger.warn({message: "Error building request URL from event", error: err, event});
      request = "https://unknown"; // Fallback URL in case of error
    }
  } else {
    logger.warn({message: "Event has missing URL path or host header", event});
    request = "https://unknown";
  }
  return request;
}