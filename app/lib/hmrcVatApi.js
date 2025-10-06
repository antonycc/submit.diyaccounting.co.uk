// app/lib/hmrcVatApi.js

import fetch from "node-fetch";
import logger from "./logger.js";

/**
 * Common utility for making HMRC VAT API calls
 * Handles base URI selection, headers, fraud prevention, and Gov-Test-Scenario
 */

function isSandboxBase(base) {
  return /\b(test|sandbox)\b/i.test(base || "");
}

/**
 * Build the base URL for HMRC API calls
 */
export function getHmrcBaseUrl() {
  return process.env.HMRC_BASE_URI || "https://test-api.service.hmrc.gov.uk";
}

/**
 * Build common HMRC headers including fraud prevention headers
 */
export function buildHmrcHeaders(accessToken, govClientHeaders = {}, testScenario = null) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${accessToken}`,
    ...govClientHeaders,
  };

  // Add Gov-Test-Scenario header if provided and we're in sandbox
  if (testScenario && isSandboxBase(getHmrcBaseUrl())) {
    headers["Gov-Test-Scenario"] = testScenario;
  }

  return headers;
}

/**
 * Make a GET request to HMRC VAT API
 */
export async function hmrcVatGet(endpoint, accessToken, govClientHeaders = {}, testScenario = null, queryParams = {}) {
  const baseUrl = getHmrcBaseUrl();
  const queryString = new URLSearchParams(queryParams).toString();
  const url = `${baseUrl}${endpoint}${queryString ? `?${queryString}` : ""}`;

  const headers = buildHmrcHeaders(accessToken, govClientHeaders, testScenario);

  logger.info({
    message: `Request to GET ${url}`,
    url,
    headers: Object.keys(headers),
    testScenario,
    environment: {
      hmrcBase: baseUrl,
      nodeEnv: process.env.NODE_ENV,
    },
  });

  const hmrcResponse = await fetch(url, {
    method: "GET",
    headers,
  });

  const hmrcResponseBody = await hmrcResponse.json().catch(() => ({}));

  logger.info({
    message: `Response from GET ${url}`,
    url,
    status: hmrcResponse.status,
    hmrcResponseBody,
  });

  return {
    ok: hmrcResponse.ok,
    status: hmrcResponse.status,
    data: hmrcResponseBody,
    response: hmrcResponse,
  };
}

/**
 * Make a POST request to HMRC VAT API
 */
export async function hmrcVatPost(endpoint, body, accessToken, govClientHeaders = {}, testScenario = null) {
  const baseUrl = getHmrcBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const headers = buildHmrcHeaders(accessToken, govClientHeaders, testScenario);

  logger.info({
    message: `Request to POST ${url}`,
    url,
    headers: Object.keys(headers),
    body,
    testScenario,
    environment: {
      hmrcBase: baseUrl,
      nodeEnv: process.env.NODE_ENV,
    },
  });

  const hmrcResponse = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const hmrcResponseBody = await hmrcResponse.json().catch(() => ({}));

  logger.info({
    message: `Response from POST ${url}`,
    url,
    status: hmrcResponse.status,
    hmrcResponseBody,
  });

  return {
    ok: hmrcResponse.ok,
    status: hmrcResponse.status,
    data: hmrcResponseBody,
    response: hmrcResponse,
  };
}

/**
 * Check if we should use stubbed data based on environment variables
 */
export function shouldUseStub(stubEnvVar) {
  return process.env[stubEnvVar] !== undefined;
}

/**
 * Get stubbed data from environment variable
 */
export function getStubData(stubEnvVar, defaultData = {}) {
  const stubData = process.env[stubEnvVar];
  if (stubData) {
    try {
      return JSON.parse(stubData);
    } catch (e) {
      logger.warn({
        message: `Failed to parse stub data from ${stubEnvVar}`,
        error: e.message,
      });
    }
  }
  return defaultData;
}
