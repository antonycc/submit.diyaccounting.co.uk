// app/lib/responses.js

import logger from "./logger.js";

export function httpOkResponse({ request, headers, data }) {
  return httpResponse({
    statusCode: 200,
    request,
    headers,
    data,
    levelledLogger: logger.info.bind(logger),
  });
}

export function httpBadRequestResponse({ request, headers, message, error }) {
  return httpResponse({
    statusCode: 400,
    request,
    headers,
    data: { message, ...error },
    levelledLogger: logger.error.bind(logger),
  });
}

export function httpServerErrorResponse({ request, headers, message, error }) {
  return httpResponse({
    statusCode: 500,
    request,
    headers,
    data: { message, ...error },
    levelledLogger: logger.error.bind(logger),
  });
}

function httpResponse({ statusCode, headers, data, request, levelledLogger }) {
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
    levelledLogger({ message: "Responding to request with response", request, response });
  } else {
    levelledLogger({ message: "Responding with response", response });
  }
  return response;
}

export function extractRequest(event) {
  let request;
  if (event.headers) {
    try {
      let baseRequestUrl;
      if (event.headers.referer) {
        const refererUrl = new URL(event.headers.referer);
        baseRequestUrl = `${refererUrl.protocol}//${refererUrl.host}`;
      } else {
        baseRequestUrl = `https://${event.headers.host || "unknown-host"}`;
      }
      const path = event.rawPath || event.path || event.requestContext?.http?.path || "";
      const queryString = event.rawQueryString || "";
      request = new URL(`${baseRequestUrl}${path}?${queryString}`);
      if (event.queryStringParameters) {
        Object.keys(event.queryStringParameters).forEach((key) => {
          request.searchParams.append(key, event.queryStringParameters[key]);
        });
      }
      logger.info({ message: "Processing request with event", request, event });
    } catch (err) {
      logger.warn({ message: "Error building request URL from event", error: err, event });
      request = "https://unknown-url"; // Fallback URL in case of error
    }
  } else {
    logger.warn({ message: "Event has missing URL path or host header", event });
    request = "https://unknown";
  }
  return request;
}

// Helper function to extract client IP from request headers
export function extractClientIPFromHeaders(event) {
  // Try various headers that might contain the client's real IP
  const headers = event.headers || {};
  const possibleIPHeaders = [
    "x-forwarded-for",
    "x-real-ip",
    "x-client-ip",
    "cf-connecting-ip", // Cloudflare
    "x-forwarded",
    "forwarded-for",
    "forwarded",
  ];

  for (const header of possibleIPHeaders) {
    const value = headers[header];
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ip = value.split(",")[0].trim();
      if (ip && ip !== "unknown") {
        return ip;
      }
    }
  }

  // Fallback to source IP from event context
  return event.requestContext?.identity?.sourceIp || "unknown";
}

export function extractAuthToken(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.split(" ")[1];
}

export function extractAuthTokenFromXAuthorization(event) {
  const headers = event.headers || {};
  let xAuthHeader = null;

  // Case-insensitive header lookup
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "x-authorization") {
      xAuthHeader = value;
      break;
    }
  }

  if (!xAuthHeader || !xAuthHeader.startsWith("Bearer ")) {
    return null;
  }
  return xAuthHeader.split(" ")[1];
}

export function extractUserFromAuthorizerContext(event) {
  // Extract user info passed by custom Lambda authorizer
  const authorizerContext = event.requestContext?.authorizer;
  if (authorizerContext && authorizerContext.sub) {
    return {
      sub: authorizerContext.sub,
      username: authorizerContext.username,
      email: authorizerContext.email,
      scope: authorizerContext.scope,
    };
  }
  return null;
}

export function parseRequestBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch (error) {
    logger.error({
      message: "Failed to parse request body as JSON",
      error: error.message,
      body: event.body,
    });
    return null;
  }
}

export function buildValidationError(request, errorMessages, govClientHeaders = {}) {
  return httpBadRequestResponse({
    request,
    headers: { ...govClientHeaders },
    message: errorMessages.join(", "),
  });
}

export async function withErrorHandling(request, govClientHeaders, asyncFn) {
  try {
    return await asyncFn();
  } catch (error) {
    logger.error({
      message: "Error in handler",
      error: error.message,
      stack: error.stack,
    });
    return httpServerErrorResponse({
      request,
      headers: { ...govClientHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }
}

export async function performTokenExchange(providerUrl, body) {
  const requestHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const requestBody = new URLSearchParams(body);

  let response;
  logger.info({
    message: `Request to POST ${providerUrl}`,
    url: providerUrl,
    headers: { ...requestHeaders },
    body: requestBody.toString(),
  });

  if (process.env.NODE_ENV === "stubbed") {
    logger.warn({ message: "httpPostMock called in stubbed mode, using test access token" });
    const testAccessToken = process.env.TEST_ACCESS_TOKEN;
    response = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: testAccessToken }),
      text: async () => JSON.stringify({ access_token: testAccessToken }),
    };
  } else {
    logger.info({ message: "Performing real HTTP POST for token exchange", providerUrl });
    response = await fetch(providerUrl, {
      method: "POST",
      headers: { ...requestHeaders },
      body: requestBody,
    });
  }

  let responseTokens;
  try {
    responseTokens = await response.json();
  } catch (err) {
    logger.warn({ message: "Failed to parse response as JSON, attempting text parse", error: err.message });
    try {
      const text = await response.text();
      logger.info({ message: "Response text received", text });
      responseTokens = JSON.parse(text);
    } catch {
      logger.error({ message: "Failed to parse response as text, returning empty tokens" });
      responseTokens = {};
    }
  }

  logger.info({
    message: "exchangeClientSecretForAccessToken response",
    responseStatus: response.status,
    responseTokens,
    tokenValidation: {
      hasAccessToken: !!responseTokens.access_token,
      accessTokenLength: responseTokens.access_token ? responseTokens.access_token.length : 0,
      tokenType: responseTokens.token_type,
      scope: responseTokens.scope,
      expiresIn: responseTokens.expires_in,
      hasRefreshToken: !!responseTokens.refresh_token,
    },
  });

  const accessToken = responseTokens.access_token;
  const responseBody = { ...responseTokens };
  delete responseBody.access_token;

  return { accessToken, response, responseBody };
}

export async function buildTokenExchangeResponse(request, url, body) {
  const { accessToken, response, responseBody } = await performTokenExchange(url, body);

  if (!response.ok) {
    logger.error({
      message: "Token exchange failed",
      responseCode: response.status,
      responseBody,
    });
    return httpServerErrorResponse({
      request,
      message: "Token exchange failed",
      error: {
        responseCode: response.status,
        responseBody,
      },
    });
  }

  const idToken = responseBody.id_token;
  const refreshToken = responseBody.refresh_token;
  const expiresIn = responseBody.expires_in;
  const tokenType = responseBody.token_type;

  logger.info({
    message: "Token exchange succeeded",
    accessTokenLength: accessToken.length,
    hasIdToken: !!idToken,
    hasRefreshToken: !!refreshToken,
    expiresIn,
    tokenType,
  });
  return httpOkResponse({
    request,
    data: {
      accessToken,
      hmrcAccessToken: accessToken,
      idToken,
      refreshToken,
      expiresIn,
      tokenType,
    },
  });
}
