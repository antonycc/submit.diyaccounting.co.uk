#!/usr/bin/env node
// src/lib/main.js

import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fetch from "node-fetch";
import logger from "./logger.js";

import "dotenv/config";

function buildUrl(event) {
  let url;
  if (event.path && event.headers && event.headers.host) {
    url = new URL(event.path, `http://${event.headers.host}`);
    Object.keys(event.queryStringParameters).forEach((key) => {
      url.searchParams.append(key, event.queryStringParameters[key]);
    });
  } else {
    logger.warn({ message: "buildUrl called with missing path or host header", event });
    url = "https://unknown";
  }
  return url;
}

// GET /api/auth-url?state={state}
export async function authUrlHandler(event) {
  const url = buildUrl(event);
  logger.info({ message: "authUrlHandler responding to url by processing event", url, event });

  // Request validation
  const state = event.queryStringParameters?.state;
  if (!state) {
    const response = {
      statusCode: 400,
      body: JSON.stringify({ requestUrl: url, error: "Missing state query parameter from URL" }),
    };
    logger.error(response);
    return response;
  }

  // Request processing
  const clientId = process.env.HMRC_CLIENT_ID;
  const redirectUri = process.env.HMRC_REDIRECT_URI;
  const hmrcBase = process.env.HMRC_BASE_URI;
  const scope = "write:vat read:vat";
  const authUrl =
    `${hmrcBase}/oauth/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

  // Generate the response
  const response = {
    statusCode: 200,
    body: JSON.stringify({ authUrl }),
  };
  logger.info({ message: "authUrlHandler responding to url with", url, response });
  return response;
}

// POST /api/exchange-token
export async function exchangeTokenHandler(event) {
  const url = buildUrl(event);
  logger.info({ message: "exchangeTokenHandler responding to url by processing event", url, event });

  // Request validation
  const { code } = JSON.parse(event.body || "{}");
  if (!code) {
    const response = {
      statusCode: 400,
      body: JSON.stringify({ requestUrl: url, requestBody: event.body, error: "Missing code from event body" }),
    };
    logger.error(response);
    return response;
  }

  // Request processing
  const hmrcRequestBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.HMRC_CLIENT_ID,
    client_secret: process.env.HMRC_CLIENT_SECRET,
    redirect_uri: process.env.HMRC_REDIRECT_URI,
    code,
  });
  const hmrcBase = process.env.HMRC_BASE_URI;
  let hmrcAccessToken;
  if (process.env.HMRC_REDIRECT_URI === process.env.TEST_REDIRECT_URI) {
    hmrcAccessToken = process.env.TEST_ACCESS_TOKEN;
  } else {
    const hmrcRequestUrl = `${hmrcBase}/oauth/token`;
    const hmrcResponse = await fetch(hmrcRequestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: hmrcRequestBody,
    });
    if (!hmrcResponse.ok) {
      const response = {
        statusCode: 500,
        body: JSON.stringify({
          hmrcRequestUrl,
          hmrcRequestBody,
          hmrcResponseCode: hmrcResponse.status,
          hmrcResponseText: await hmrcResponse.text(),
        }),
      };
      logger.error(response);
      return response;
    }
    const tokenResponse = await hmrcResponse.json();
    hmrcAccessToken = tokenResponse.access_token;
  }

  // Generate the response
  const response = {
    statusCode: 200,
    body: JSON.stringify({ hmrcAccessToken }),
  };
  logger.info({ message: "submitVatHandler responding to url with", url, response });
  return response;
}

// Helper function to extract client IP from request headers
function extractClientIPFromHeaders(event) {
  // Try various headers that might contain the client's real IP
  const headers = event.headers || {};
  const possibleIPHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'cf-connecting-ip', // Cloudflare
    'x-forwarded',
    'forwarded-for',
    'forwarded'
  ];

  for (const header of possibleIPHeaders) {
    const value = headers[header];
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ip = value.split(',')[0].trim();
      if (ip && ip !== 'unknown') {
        return ip;
      }
    }
  }

  // Fallback to source IP from event context
  return event.requestContext?.identity?.sourceIp || 'unknown';
}

// POST /api/submit-vat
export async function submitVatHandler(event) {
  const url = buildUrl(event);
  const govClientBrowserJSUserAgentHeader = (event.headers || {})["Gov-Client-Browser-JS-User-Agent"];
  const govClientDeviceIDHeader = (event.headers || {})["Gov-Client-Device-ID"];
  const govClientMultiFactorHeader = (event.headers || {})["Gov-Client-Multi-Factor"];
  
  // Handle IP detection - if browser sent "SERVER_DETECT", extract IP from request headers
  let govClientPublicIPHeader = (event.headers || {})["Gov-Client-Public-IP"];
  let govVendorPublicIPHeader = (event.headers || {})["Gov-Vendor-Public-IP"];
  
  if (govClientPublicIPHeader === "SERVER_DETECT" || !govClientPublicIPHeader) {
    const detectedIP = extractClientIPFromHeaders(event);
    govClientPublicIPHeader = detectedIP;
    logger.info({ message: "Server detected client IP from request headers", detectedIP, headers: event.headers });
  }
  
  if (govVendorPublicIPHeader === "SERVER_DETECT" || !govVendorPublicIPHeader) {
    govVendorPublicIPHeader = extractClientIPFromHeaders(event);
  }
  
  const govClientPublicIPTimestampHeader = (event.headers || {})["Gov-Client-Public-IP-Timestamp"];
  const govClientPublicPortHeader = (event.headers || {})["Gov-Client-Public-Port"];
  const govClientScreensHeader = (event.headers || {})["Gov-Client-Screens"];
  const govClientTimezoneHeader = (event.headers || {})["Gov-Client-Timezone"];
  const govClientUserIDsHeader = (event.headers || {})["Gov-Client-User-IDs"];
  const govClientWindowSizeHeader = (event.headers || {})["Gov-Client-Window-Size"];

  // TODO: Also gather system defined values here and validate, failing the request if they are not present.

  logger.info({ message: "submitVatHandler responding to url by processing event", url, event, headers: event.headers });

  // Request validation
  let errorMessages = [];
  const { vatNumber, periodKey, vatDue, hmrcAccessToken } = JSON.parse(event.body || "{}");
  if (!vatNumber) {
    errorMessages.push("Missing vatNumber parameter from body");
  }
  if (!periodKey) {
    errorMessages.push("Missing periodKey parameter from body");
  }
  if (!vatDue) {
    errorMessages.push("Missing vatDue parameter from body");
  }
  if (!hmrcAccessToken) {
    errorMessages.push("Missing hmrcAccessToken parameter from body");
  }
  if (errorMessages.length > 0) {
    const response = {
      statusCode: 400,
      body:  JSON.stringify({ requestUrl: url, requestBody: event.body, error: errorMessages.join(", ") }),
    };
    logger.error(response);
    return response;
  }

  // Request processing
  const hmrcRequestBody = {
    periodKey,
    vatDueSales: parseFloat(vatDue),
    vatDueAcquisitions: 0,
    totalVatDue: parseFloat(vatDue),
    vatReclaimedCurrPeriod: 0,
    netVatDue: parseFloat(vatDue),
    totalValueSalesExVAT: 0,
    totalValuePurchasesExVAT: 0,
    totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0,
    finalised: true,
  };
  const hmrcBase = process.env.HMRC_BASE_URI;
  let receipt;
  if (process.env.HMRC_REDIRECT_URI === process.env.TEST_REDIRECT_URI) {
    // TEST_RECEIPT is already a JSON string, so parse it first
    receipt = JSON.parse(process.env.TEST_RECEIPT || "{}");
  } else {
    const hmrcRequestUrl = `${hmrcBase}/organisations/vat/${vatNumber}/returns`;
    const hmrcResponse = await fetch(hmrcRequestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.hmrc.1.0+json",
        "Authorization": `Bearer ${hmrcAccessToken}`,
        "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
        "Gov-Client-Browser-JS-User-Agent": govClientBrowserJSUserAgentHeader,
        "Gov-Client-Device-ID": govClientDeviceIDHeader,
        "Gov-Client-Multi-Factor": govClientMultiFactorHeader,
        "Gov-Client-Public-IP": govClientPublicIPHeader,
        "Gov-Client-Public-IP-Timestamp": govClientPublicIPTimestampHeader,
        "Gov-Client-Public-Port": govClientPublicPortHeader,
        "Gov-Client-Screens": govClientScreensHeader,
        "Gov-Client-Timezone": govClientTimezoneHeader,
        "Gov-Client-User-IDs": govClientUserIDsHeader,
        "Gov-Client-Window-Size": govClientWindowSizeHeader,
        "Gov-Vendor-Forwarded": "by=203.0.113.6&for=198.51.100.0",
        "Gov-Vendor-License-IDs": "my-licensed-software=8D7963490527D33716835EE7C195516D5E562E03B224E9B359836466EE40CDE1",
        "Gov-Vendor-Product-Name": "DIY Accounting Submit",
        "Gov-Vendor-Public-IP": govVendorPublicIPHeader,
        "Gov-Vendor-Version": "web-submit-diyaccounting-co-uk-0.0.2-4",
      },
      body: JSON.stringify(hmrcRequestBody),
    });
    if (!hmrcResponse.ok) {
      const response = {
        statusCode: 500,
        body: JSON.stringify({
          hmrcRequestUrl,
          hmrcRequestBody,
          hmrcResponseCode: hmrcResponse.status,
          hmrcResponseText: await hmrcResponse.text(),
        }),
      };
      logger.error(response);
      return response;
    }
    receipt = await hmrcResponse.json();
  }

  // Generate the response
  const response = {
    statusCode: 200,
    body: JSON.stringify({ receipt }),
  };
  logger.info({ message: "submitVatHandler responding to url with", url, response });
  return response;
}

// POST /api/log-receipt
export async function logReceiptHandler(event) {
  const url = buildUrl(event);
  logger.info({ message: "logReceiptHandler responding to url by processing event", url, event });

  // Request validation
  const receipt = JSON.parse(event.body || "{}");
  const key = `receipts/${receipt.formBundleNumber}.json`;
  let errorMessages = [];
  if (!receipt) {
    errorMessages.push("Missing receipt parameter from body");
  }
  if (!key) {
    errorMessages.push("Missing key parameter from body");
  }
  if (errorMessages.length > 0) {
    const response = {
      statusCode: 400,
      body:  JSON.stringify({ requestUrl: url, requestBody: event.body, error: errorMessages.join(", ") }),
    };
    logger.error(response);
    return response;
  }

  // Request processing

  // Configure S3 client for containerized MinIO if environment variables are set
  const s3Config = {};
  if (process.env.TEST_S3_ENDPOINT) {
    s3Config.endpoint = process.env.TEST_S3_ENDPOINT;
    s3Config.forcePathStyle = true;
    s3Config.region = "us-east-1";

    if (process.env.TEST_S3_ACCESS_KEY && process.env.TEST_S3_SECRET_KEY) {
      s3Config.credentials = {
        accessKeyId: process.env.TEST_S3_ACCESS_KEY,
        secretAccessKey: process.env.TEST_S3_SECRET_KEY,
      };
    }
  }

  if (!process.env.RECEIPTS_BUCKET_NAME) {
    logger.warn({message: "RECEIPTS_BUCKET_NAME environment variable is not set, cannot log receipt"});
  } else {
    try {
      const s3Client = new S3Client(s3Config);
      await s3Client.send(
          new PutObjectCommand({
            Bucket: process.env.RECEIPTS_BUCKET_NAME,
            Key: key,
            Body: JSON.stringify(receipt),
            ContentType: "application/json",
          }),
      );
    } catch(err) {
      const response = {
        statusCode: 500,
        body: JSON.stringify({error: "Failed to log receipt", details: err.message}),
      };
      logger.error({message: "logReceiptHandler responding to url with", url, response});
      return response;
    }
  }

  // Generate the response
  const response = {
    statusCode: 200,
    body: JSON.stringify({ receipt, key }),
  };
  logger.info({ message: "logReceiptHandler responding to url with", url, response });
  return response;
}

export function main(args) {
  console.log(`Run with: ${JSON.stringify(args)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  main(args);
}
