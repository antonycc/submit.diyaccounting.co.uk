// app/lib/hmrcErrorMessages.js
/**
 * HMRC error code to user-friendly message mapping.
 *
 * This module provides helpful, actionable error messages for various HMRC API error codes.
 * Based on HMRC Making Tax Digital (MTD) VAT API documentation.
 */

/**
 * Map HMRC error codes to user-friendly messages with specific guidance.
 *
 * @param {string} errorCode - The HMRC error code
 * @param {object} errorDetails - Additional error details from HMRC response
 * @returns {object} Object with message and userGuidance properties
 */
export function getHmrcErrorMessage(errorCode, errorDetails = {}) {
  const errorMap = {
    // VAT Registration Number errors
    INVALID_VRN: {
      message: "Invalid VAT Registration Number",
      userGuidance: "The VAT Registration Number (VRN) provided is not valid. Please check that you have entered a 9-digit VRN correctly.",
      httpStatus: 400,
    },
    VRN_NOT_FOUND: {
      message: "VAT Registration Number not found",
      userGuidance:
        "The VAT Registration Number (VRN) could not be found in HMRC records. Please verify the VRN is correct and that the business is registered for VAT.",
      httpStatus: 404,
    },

    // Period key and date errors
    INVALID_PERIOD_KEY: {
      message: "Invalid period key",
      userGuidance:
        'The period key provided is not in the correct format. Period keys should be in the format like "24A1" (year + quarter) or as provided in your VAT obligations.',
      httpStatus: 400,
    },
    PERIOD_KEY_INVALID: {
      message: "Invalid period key",
      userGuidance:
        "The period key provided is not valid for this VAT Registration Number. Please check your VAT obligations to find the correct period key.",
      httpStatus: 400,
    },
    DATE_RANGE_TOO_LARGE: {
      message: "Date range too large",
      userGuidance:
        "The date range specified is too large. HMRC typically allows a maximum of 4 years for obligation queries. Please reduce the date range and try again.",
      httpStatus: 400,
    },
    INVALID_DATE_FROM: {
      message: 'Invalid "from" date',
      userGuidance: 'The "from" date is not valid. Please provide a date in YYYY-MM-DD format (e.g., 2024-01-01).',
      httpStatus: 400,
    },
    INVALID_DATE_TO: {
      message: 'Invalid "to" date',
      userGuidance: 'The "to" date is not valid. Please provide a date in YYYY-MM-DD format (e.g., 2024-12-31).',
      httpStatus: 400,
    },
    INVALID_DATE_RANGE: {
      message: "Invalid date range",
      userGuidance: 'The "from" date must be before or equal to the "to" date. Please check your date range and try again.',
      httpStatus: 400,
    },

    // Submission errors
    DUPLICATE_SUBMISSION: {
      message: "Duplicate VAT return submission",
      userGuidance:
        "A VAT return has already been submitted for this period. You cannot submit the same period more than once. If you need to correct a submission, contact HMRC.",
      httpStatus: 409,
    },
    INVALID_SUBMISSION: {
      message: "Invalid submission data",
      userGuidance:
        "The VAT return data provided is invalid. Please check that all required fields are present and contain valid numeric values.",
      httpStatus: 400,
    },
    NOT_FINALISED: {
      message: "Return not finalised",
      userGuidance: 'The VAT return must be finalised before submission. Please ensure the "finalised" flag is set to true.',
      httpStatus: 400,
    },

    // Business status errors
    INSOLVENT_TRADER: {
      message: "Cannot submit - business is insolvent",
      userGuidance:
        "VAT returns cannot be submitted for this business as it is marked as insolvent in HMRC records. Please contact HMRC for assistance.",
      httpStatus: 403,
    },
    NOT_FOUND_VRN: {
      message: "VAT Registration Number not found",
      userGuidance:
        "The VAT Registration Number is not found or not active in HMRC records. Please verify the VRN and business registration status.",
      httpStatus: 404,
    },
    INVALID_PERIODKEY: {
      message: "Invalid period key format",
      userGuidance: 'The period key format is incorrect. Period keys should match the format from your VAT obligations (e.g., "24A1").',
      httpStatus: 400,
    },

    // Authorization and authentication errors
    UNAUTHORIZED: {
      message: "Authorization failed",
      userGuidance: "Your HMRC authorization token is invalid or has expired. Please log in to HMRC again to obtain a new authorization.",
      httpStatus: 401,
    },
    INVALID_CREDENTIALS: {
      message: "Invalid credentials",
      userGuidance: "The HMRC credentials provided are invalid. Please log in to HMRC again.",
      httpStatus: 401,
    },
    CLIENT_OR_AGENT_NOT_AUTHORISED: {
      message: "Not authorized for this VRN",
      userGuidance:
        "You are not authorized to access VAT information for this VAT Registration Number. Please ensure you have the correct permissions and are logged in with the appropriate credentials.",
      httpStatus: 403,
    },
    AGENT_NOT_SUBSCRIBED: {
      message: "Agent not subscribed",
      userGuidance:
        "If you are an agent, you must be subscribed to the Agent Services Account. Please visit HMRC to complete your agent subscription.",
      httpStatus: 403,
    },

    // Obligation status errors
    NO_OBLIGATIONS_FOUND: {
      message: "No VAT obligations found",
      userGuidance:
        "No VAT obligations were found for the specified date range and status. Try expanding your date range or checking a different status (Open/Fulfilled).",
      httpStatus: 404,
    },
    INVALID_STATUS: {
      message: "Invalid status parameter",
      userGuidance: 'The status parameter must be either "O" for Open obligations or "F" for Fulfilled obligations.',
      httpStatus: 400,
    },

    // HMRC service errors
    SERVER_ERROR: {
      message: "HMRC service error",
      userGuidance: "An error occurred in the HMRC service. Please try again later. If the problem persists, contact HMRC support.",
      httpStatus: 500,
    },
    SERVICE_UNAVAILABLE: {
      message: "HMRC service temporarily unavailable",
      userGuidance:
        "The HMRC service is temporarily unavailable. Please try again in a few minutes. HMRC services may be undergoing maintenance.",
      httpStatus: 503,
    },
    GATEWAY_TIMEOUT: {
      message: "HMRC service timeout",
      userGuidance: "The request to HMRC timed out. This is usually temporary. Please try again in a moment.",
      httpStatus: 504,
    },

    // Rate limiting
    MESSAGE_THROTTLED_OUT: {
      message: "Too many requests",
      userGuidance: "You have made too many requests to HMRC in a short period. Please wait a few minutes before trying again.",
      httpStatus: 429,
    },
    RATE_LIMIT_EXCEEDED: {
      message: "Rate limit exceeded",
      userGuidance: "The HMRC API rate limit has been exceeded. Please wait before making additional requests.",
      httpStatus: 429,
    },

    // Request format errors
    INVALID_REQUEST: {
      message: "Invalid request format",
      userGuidance: "The request to HMRC was not formatted correctly. Please check that all required fields are present and valid.",
      httpStatus: 400,
    },
    MISSING_HEADER: {
      message: "Missing required header",
      userGuidance: "A required header is missing from the request. This is likely a system error - please contact support.",
      httpStatus: 400,
    },
    INVALID_HEADER: {
      message: "Invalid request header",
      userGuidance: "One or more request headers are invalid. This is likely a system error - please contact support.",
      httpStatus: 400,
    },
  };

  const errorInfo = errorMap[errorCode];

  if (errorInfo) {
    return {
      code: errorCode,
      message: errorInfo.message,
      userGuidance: errorInfo.userGuidance,
      httpStatus: errorInfo.httpStatus,
      details: errorDetails,
    };
  }

  // Default error message for unknown error codes
  return {
    code: errorCode || "UNKNOWN_ERROR",
    message: "An error occurred while processing your request",
    userGuidance: "An unexpected error occurred. Please check your input and try again. If the problem persists, contact support.",
    httpStatus: 500,
    details: errorDetails,
  };
}

/**
 * Parse HMRC response body and extract error code and details.
 *
 * @param {object} hmrcResponseBody - The response body from HMRC API
 * @returns {object} Object with errorCode and errorDetails properties
 */
export function parseHmrcErrorResponse(hmrcResponseBody) {
  if (!hmrcResponseBody) {
    return { errorCode: null, errorDetails: {} };
  }

  // HMRC error responses can have different structures:
  // 1. { code: "ERROR_CODE", message: "..." }
  // 2. { errors: [{ code: "ERROR_CODE", message: "..." }] }
  // 3. { error: "ERROR_CODE", error_description: "..." }

  let errorCode = null;
  let errorDetails = {};

  // Structure 1: Single error with code
  if (hmrcResponseBody.code) {
    errorCode = hmrcResponseBody.code;
    errorDetails = {
      hmrcMessage: hmrcResponseBody.message,
      ...hmrcResponseBody,
    };
  }
  // Structure 2: Array of errors
  else if (hmrcResponseBody.errors && Array.isArray(hmrcResponseBody.errors) && hmrcResponseBody.errors.length > 0) {
    const firstError = hmrcResponseBody.errors[0];
    errorCode = firstError.code;
    errorDetails = {
      hmrcMessage: firstError.message,
      allErrors: hmrcResponseBody.errors,
    };
  }
  // Structure 3: OAuth-style error
  else if (hmrcResponseBody.error) {
    errorCode = hmrcResponseBody.error;
    errorDetails = {
      hmrcMessage: hmrcResponseBody.error_description || hmrcResponseBody.message,
      ...hmrcResponseBody,
    };
  }
  // Fallback: Try to extract any code-like field
  else if (hmrcResponseBody.errorCode) {
    errorCode = hmrcResponseBody.errorCode;
    errorDetails = hmrcResponseBody;
  }

  return { errorCode, errorDetails };
}

/**
 * Get a user-friendly error message from an HMRC response.
 * This is the main entry point for error message mapping.
 *
 * @param {object} hmrcResponse - The HMRC response object (with status, data, etc.)
 * @returns {object} Object with code, message, userGuidance, and httpStatus
 */
export function getErrorMessageFromHmrcResponse(hmrcResponse) {
  if (!hmrcResponse) {
    return getHmrcErrorMessage("UNKNOWN_ERROR");
  }

  const { errorCode, errorDetails } = parseHmrcErrorResponse(hmrcResponse.data);

  // If we found an error code in the response body, use it
  if (errorCode) {
    return getHmrcErrorMessage(errorCode, errorDetails);
  }

  // Otherwise, map HTTP status to a generic error
  const statusCode = hmrcResponse.status || 500;

  if (statusCode === 400) {
    return getHmrcErrorMessage("INVALID_REQUEST", { httpStatus: statusCode });
  } else if (statusCode === 401) {
    return getHmrcErrorMessage("UNAUTHORIZED", { httpStatus: statusCode });
  } else if (statusCode === 403) {
    return getHmrcErrorMessage("CLIENT_OR_AGENT_NOT_AUTHORISED", { httpStatus: statusCode });
  } else if (statusCode === 404) {
    return getHmrcErrorMessage("NOT_FOUND_VRN", { httpStatus: statusCode });
  } else if (statusCode === 409) {
    return getHmrcErrorMessage("DUPLICATE_SUBMISSION", { httpStatus: statusCode });
  } else if (statusCode === 429) {
    return getHmrcErrorMessage("RATE_LIMIT_EXCEEDED", { httpStatus: statusCode });
  } else if (statusCode === 503) {
    return getHmrcErrorMessage("SERVICE_UNAVAILABLE", { httpStatus: statusCode });
  } else if (statusCode === 504) {
    return getHmrcErrorMessage("GATEWAY_TIMEOUT", { httpStatus: statusCode });
  } else {
    return getHmrcErrorMessage("SERVER_ERROR", { httpStatus: statusCode });
  }
}
