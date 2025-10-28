// app/functions/submitVat.js

import logger from "../lib/logger.js";
import {
  extractRequest,
  httpBadRequestResponse,
  httpOkResponse,
  httpServerErrorResponse,
  extractClientIPFromHeaders,
} from "../lib/responses.js";
import eventToGovClientHeaders from "../lib/eventToGovClientHeaders.js";
import { validateEnv } from "../lib/env.js";

// Lazy load AWS Cognito SDK only if bundle enforcement is on
let __cognitoModule;
let __cognitoClient;
async function getCognitoModule() {
  if (!__cognitoModule) {
    __cognitoModule = await import("@aws-sdk/client-cognito-identity-provider");
  }
  return __cognitoModule;
}
async function getCognitoClient() {
  if (!__cognitoClient) {
    const mod = await getCognitoModule();
    __cognitoClient = new mod.CognitoIdentityProviderClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return __cognitoClient;
}

// POST /api/hmrc/vat/return-post
export async function handler(event) {
  validateEnv(["HMRC_BASE_URI", "COGNITO_USER_POOL_ID"]);

  const request = extractRequest(event);

  const detectedIP = extractClientIPFromHeaders(event);

  // Validation
  let errorMessages = [];
  const { vatNumber, periodKey, vatDue, accessToken, hmrcAccessToken } = JSON.parse(event.body || "{}");
  const token = accessToken || hmrcAccessToken;
  if (!vatNumber) {
    errorMessages.push("Missing vatNumber parameter from body");
  }
  if (!periodKey) {
    errorMessages.push("Missing periodKey parameter from body");
  }
  if (!vatDue) {
    errorMessages.push("Missing vatDue parameter from body");
  }
  if (!token) {
    errorMessages.push("Missing accessToken parameter from body");
  }
  const { govClientHeaders, govClientErrorMessages } = eventToGovClientHeaders(event, detectedIP);
  errorMessages = errorMessages.concat(govClientErrorMessages || []);
  if (errorMessages.length > 0) {
    return httpBadRequestResponse({
      request,
      headers: { ...govClientHeaders },
      message: errorMessages.join(", "),
    });
  }

  // Optional bundle entitlement enforcement (disabled by default)
  try {
    const enforceBundles =
      String(process.env.DIY_SUBMIT_ENFORCE_BUNDLES || "").toLowerCase() === "true" || process.env.DIY_SUBMIT_ENFORCE_BUNDLES === "1";
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (enforceBundles && userPoolId) {
      const authHeader = event.headers?.authorization || event.headers?.Authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return httpBadRequestResponse({ request, message: "Missing Authorization Bearer token" });
      }
      const idToken = authHeader.split(" ")[1];
      const decoded = decodeJwtNoVerify(idToken);
      if (!decoded?.sub) {
        return httpBadRequestResponse({ request, message: "Invalid Authorization token" });
      }
      const bundles = await getUserBundlesFromCognito(userPoolId, decoded.sub);
      const hmrcBase = process.env.HMRC_BASE_URI;
      const sandbox = isSandboxBase(hmrcBase);
      if (sandbox) {
        if (!bundles || !bundles.some((b) => typeof b === "string" && (b === "HMRC_TEST_API" || b.startsWith("HMRC_TEST_API|")))) {
          return httpServerErrorResponse({
            request,
            message: "Forbidden: HMRC Sandbox submission requires HMRC_TEST_API bundle",
            error: { code: "BUNDLE_FORBIDDEN", requiredBundle: "HMRC_TEST_API" },
          });
        }
      } else {
        const allowed = (bundles || []).some(
          (b) =>
            typeof b === "string" &&
            (b === "HMRC_PROD_SUBMIT" ||
              b.startsWith("HMRC_PROD_SUBMIT|") ||
              b === "LEGACY_ENTITLEMENT" ||
              b.startsWith("LEGACY_ENTITLEMENT|")),
        );
        if (!allowed) {
          return httpServerErrorResponse({
            request,
            message: "Forbidden: Production submission requires HMRC_PROD_SUBMIT or LEGACY_ENTITLEMENT bundle",
            error: { code: "BUNDLE_FORBIDDEN", requiredBundle: ["HMRC_PROD_SUBMIT", "LEGACY_ENTITLEMENT"] },
          });
        }
      }
    }
  } catch (authError) {
    return httpServerErrorResponse({
      request,
      message: "Authorization failure while checking entitlements",
      error: authError?.message || String(authError),
    });
  }

  // Processing
  const { receipt, hmrcResponse, hmrcResponseBody } = await submitVat(periodKey, vatDue, vatNumber, token, govClientHeaders);

  if (!hmrcResponse.ok) {
    return httpServerErrorResponse({
      request,
      message: "HMRC VAT submission failed",
      error: {
        hmrcResponseCode: hmrcResponse.status,
        responseBody: hmrcResponseBody,
      },
    });
  }

  // Generate a success response
  return httpOkResponse({
    request,
    data: {
      receipt,
    },
  });
}

// Lightweight JWT decode (no signature verification)
function decodeJwtNoVerify(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (_e) {
    return null;
  }
}

function isSandboxBase(base) {
  return /test|sandbox/i.test(base || "");
}

function hasBundle(bundles, id) {
  return (bundles || []).some((b) => typeof b === "string" && (b === id || b.startsWith(id + "|")));
}

async function getUserBundlesFromCognito(userPoolId, sub) {
  const mod = await getCognitoModule();
  const client = await getCognitoClient();
  const cmd = new mod.AdminGetUserCommand({ UserPoolId: userPoolId, Username: sub });
  const user = await client.send(cmd);
  const attr = user.UserAttributes?.find((a) => a.Name === "custom:bundles")?.Value || "";
  return attr.split("|").filter(Boolean);
}

export async function submitVat(periodKey, vatDue, vatNumber, hmrcAccessToken, govClientHeaders) {
  const submissionStartTime = new Date().toISOString();

  // Validate access token format
  const tokenValidation = {
    hasAccessToken: !!hmrcAccessToken,
    accessTokenLength: hmrcAccessToken ? hmrcAccessToken.length : 0,
    accessTokenPrefix: hmrcAccessToken ? hmrcAccessToken.substring(0, 8) + "..." : "none",
    isValidFormat: hmrcAccessToken && typeof hmrcAccessToken === "string" && hmrcAccessToken.length > 10,
    vatNumber,
    periodKey,
    vatDue,
  };

  // Enhanced debug logging for access token validation
  logger.info({
    message: "submitVat function called with access token",
    submissionStartTime,
    tokenValidation,
    govClientHeaders: Object.keys(govClientHeaders || {}),
  });

  // Early validation - reject if token is clearly invalid
  if (!hmrcAccessToken || typeof hmrcAccessToken !== "string" || hmrcAccessToken.length < 2) {
    logger.error({
      message: "Invalid access token provided to submitVat",
      tokenValidation,
      error: "Access token is missing, not a string, or too short",
    });
    throw new Error("Invalid access token provided");
  }

  // Request processing
  const hmrcRequestHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${hmrcAccessToken}`,
  };
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

  let hmrcResponseBody;
  let hmrcResponse;
  const hmrcBase = process.env.HMRC_BASE_URI;
  const hmrcRequestUrl = `${hmrcBase}/organisations/vat/${vatNumber}/returns`;
  logger.info({
    message: `Request to POST ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    headers: {
      ...hmrcRequestHeaders,
      ...govClientHeaders,
    },
    body: hmrcRequestBody,
    environment: {
      hmrcBase,
      nodeEnv: process.env.NODE_ENV,
    },
  });
  if (process.env.NODE_ENV === "stubbed") {
    hmrcResponse = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: hmrcAccessToken }),
      text: async () => JSON.stringify({ access_token: hmrcAccessToken }),
    };
    // TEST_RECEIPT is already a JSON string, so parse it first
    hmrcResponseBody = JSON.parse(process.env.TEST_RECEIPT || "{}");
    logger.warn({ message: "httpPostMock called in stubbed mode, using test receipt", receipt: hmrcResponseBody });
  } else {
    hmrcResponse = await fetch(hmrcRequestUrl, {
      method: "POST",
      headers: {
        ...hmrcRequestHeaders,
        ...govClientHeaders,
      },
      body: JSON.stringify(hmrcRequestBody),
    });
    hmrcResponseBody = await hmrcResponse.json();
  }
  // const responseBody = await response.json();

  // Enhanced logging for response analysis
  const responseLogData = {
    message: `Response from POST ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    hmrcResponseStatus: hmrcResponse.status,
    hmrcResponseBody,
  };

  // Add detailed error logging for 403 responses
  if (hmrcResponse.status === 403) {
    responseLogData.error403Analysis = {
      message: "403 Forbidden - Access token may be invalid, expired, or lack required permissions",
      possibleCauses: [
        "Invalid or expired access token",
        "Token lacks required scopes (write:vat read:vat)",
        "Client credentials mismatch",
        "Missing or incorrect Gov-Client headers",
        "HMRC API rate limiting",
      ],
      tokenInfo: {
        hasAccessToken: !!hmrcAccessToken,
        accessTokenLength: hmrcAccessToken ? hmrcAccessToken.length : 0,
        accessTokenPrefix: hmrcAccessToken ? hmrcAccessToken.substring(0, 8) + "..." : "none",
      },
      requestHeaders: {
        authorization: hmrcAccessToken ? `Bearer ${hmrcAccessToken.substring(0, 8)}...` : "missing",
        govClientHeadersCount: Object.keys(govClientHeaders || {}).length,
        govClientHeaderKeys: Object.keys(govClientHeaders || {}),
      },
    };
  }

  logger.info(responseLogData);

  return { hmrcRequestBody, receipt: hmrcResponseBody, hmrcResponse, hmrcResponseBody, hmrcRequestUrl };
}
