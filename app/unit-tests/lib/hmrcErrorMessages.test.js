// app/unit-tests/lib/hmrcErrorMessages.test.js

import { describe, test, expect } from 'vitest';
import {
  getHmrcErrorMessage,
  parseHmrcErrorResponse,
  getErrorMessageFromHmrcResponse,
} from '@app/lib/hmrcErrorMessages.js';

describe('hmrcErrorMessages', () => {
  describe('getHmrcErrorMessage', () => {
    test('returns message for INVALID_VRN error code', () => {
      const result = getHmrcErrorMessage('INVALID_VRN');
      expect(result.code).toBe('INVALID_VRN');
      expect(result.message).toContain('Invalid VAT Registration Number');
      expect(result.userGuidance).toContain('9-digit VRN');
      expect(result.httpStatus).toBe(400);
    });

    test('returns message for INSOLVENT_TRADER error code', () => {
      const result = getHmrcErrorMessage('INSOLVENT_TRADER');
      expect(result.code).toBe('INSOLVENT_TRADER');
      expect(result.message).toContain('insolvent');
      expect(result.userGuidance).toContain('contact HMRC');
      expect(result.httpStatus).toBe(403);
    });

    test('returns message for DATE_RANGE_TOO_LARGE error code', () => {
      const result = getHmrcErrorMessage('DATE_RANGE_TOO_LARGE');
      expect(result.code).toBe('DATE_RANGE_TOO_LARGE');
      expect(result.message).toContain('Date range too large');
      expect(result.userGuidance).toContain('reduce the date range');
      expect(result.httpStatus).toBe(400);
    });

    test('returns message for DUPLICATE_SUBMISSION error code', () => {
      const result = getHmrcErrorMessage('DUPLICATE_SUBMISSION');
      expect(result.code).toBe('DUPLICATE_SUBMISSION');
      expect(result.message).toContain('Duplicate');
      expect(result.userGuidance).toContain('already been submitted');
      expect(result.httpStatus).toBe(409);
    });

    test('returns message for UNAUTHORIZED error code', () => {
      const result = getHmrcErrorMessage('UNAUTHORIZED');
      expect(result.code).toBe('UNAUTHORIZED');
      expect(result.message).toContain('Authorization failed');
      expect(result.userGuidance).toContain('token is invalid or has expired');
      expect(result.httpStatus).toBe(401);
    });

    test('returns message for RATE_LIMIT_EXCEEDED error code', () => {
      const result = getHmrcErrorMessage('RATE_LIMIT_EXCEEDED');
      expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(result.message).toContain('Rate limit');
      expect(result.userGuidance).toContain('wait');
      expect(result.httpStatus).toBe(429);
    });

    test('returns message for SERVICE_UNAVAILABLE error code', () => {
      const result = getHmrcErrorMessage('SERVICE_UNAVAILABLE');
      expect(result.code).toBe('SERVICE_UNAVAILABLE');
      expect(result.message).toContain('unavailable');
      expect(result.userGuidance).toContain('try again');
      expect(result.httpStatus).toBe(503);
    });

    test('returns default message for unknown error code', () => {
      const result = getHmrcErrorMessage('SOME_UNKNOWN_ERROR');
      expect(result.code).toBe('SOME_UNKNOWN_ERROR');
      expect(result.message).toContain('error occurred');
      expect(result.userGuidance).toContain('unexpected error');
      expect(result.httpStatus).toBe(500);
    });

    test('includes error details when provided', () => {
      const details = { field: 'vrn', value: '123' };
      const result = getHmrcErrorMessage('INVALID_VRN', details);
      expect(result.details).toEqual(details);
    });

    test('handles null or undefined error code', () => {
      const result = getHmrcErrorMessage(null);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBeDefined();
    });
  });

  describe('parseHmrcErrorResponse', () => {
    test('parses single error with code field', () => {
      const response = {
        code: 'INVALID_VRN',
        message: 'The VAT registration number is invalid',
      };
      const result = parseHmrcErrorResponse(response);
      expect(result.errorCode).toBe('INVALID_VRN');
      expect(result.errorDetails.hmrcMessage).toBe('The VAT registration number is invalid');
    });

    test('parses errors array format', () => {
      const response = {
        errors: [
          { code: 'INVALID_PERIOD_KEY', message: 'Invalid period key format' },
          { code: 'ANOTHER_ERROR', message: 'Another error' },
        ],
      };
      const result = parseHmrcErrorResponse(response);
      expect(result.errorCode).toBe('INVALID_PERIOD_KEY');
      expect(result.errorDetails.hmrcMessage).toBe('Invalid period key format');
      expect(result.errorDetails.allErrors).toHaveLength(2);
    });

    test('parses OAuth-style error format', () => {
      const response = {
        error: 'invalid_grant',
        error_description: 'Authorization code is invalid or expired',
      };
      const result = parseHmrcErrorResponse(response);
      expect(result.errorCode).toBe('invalid_grant');
      expect(result.errorDetails.hmrcMessage).toBe('Authorization code is invalid or expired');
    });

    test('parses errorCode field as fallback', () => {
      const response = {
        errorCode: 'SOME_ERROR',
        description: 'Error description',
      };
      const result = parseHmrcErrorResponse(response);
      expect(result.errorCode).toBe('SOME_ERROR');
    });

    test('handles empty errors array', () => {
      const response = { errors: [] };
      const result = parseHmrcErrorResponse(response);
      expect(result.errorCode).toBe(null);
    });

    test('handles null response', () => {
      const result = parseHmrcErrorResponse(null);
      expect(result.errorCode).toBe(null);
      expect(result.errorDetails).toEqual({});
    });

    test('handles response with no recognizable error structure', () => {
      const response = { someField: 'someValue' };
      const result = parseHmrcErrorResponse(response);
      expect(result.errorCode).toBe(null);
    });
  });

  describe('getErrorMessageFromHmrcResponse', () => {
    test('extracts error from response with error code in body', () => {
      const hmrcResponse = {
        status: 400,
        data: {
          code: 'INVALID_VRN',
          message: 'Invalid VRN format',
        },
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('INVALID_VRN');
      expect(result.message).toContain('Invalid VAT Registration Number');
    });

    test('maps 400 status to INVALID_REQUEST when no error code in body', () => {
      const hmrcResponse = {
        status: 400,
        data: { someField: 'someValue' },
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('INVALID_REQUEST');
      expect(result.httpStatus).toBe(400);
    });

    test('maps 401 status to UNAUTHORIZED when no error code in body', () => {
      const hmrcResponse = {
        status: 401,
        data: {},
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    test('maps 403 status to CLIENT_OR_AGENT_NOT_AUTHORISED', () => {
      const hmrcResponse = {
        status: 403,
        data: {},
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('CLIENT_OR_AGENT_NOT_AUTHORISED');
    });

    test('maps 404 status to NOT_FOUND_VRN', () => {
      const hmrcResponse = {
        status: 404,
        data: {},
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('NOT_FOUND_VRN');
    });

    test('maps 409 status to DUPLICATE_SUBMISSION', () => {
      const hmrcResponse = {
        status: 409,
        data: {},
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('DUPLICATE_SUBMISSION');
    });

    test('maps 429 status to RATE_LIMIT_EXCEEDED', () => {
      const hmrcResponse = {
        status: 429,
        data: {},
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    test('maps 503 status to SERVICE_UNAVAILABLE', () => {
      const hmrcResponse = {
        status: 503,
        data: {},
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('SERVICE_UNAVAILABLE');
    });

    test('maps 504 status to GATEWAY_TIMEOUT', () => {
      const hmrcResponse = {
        status: 504,
        data: {},
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('GATEWAY_TIMEOUT');
    });

    test('maps other 5xx statuses to SERVER_ERROR', () => {
      const hmrcResponse = {
        status: 500,
        data: {},
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('SERVER_ERROR');
    });

    test('handles null response', () => {
      const result = getErrorMessageFromHmrcResponse(null);
      expect(result.code).toBe('UNKNOWN_ERROR');
    });

    test('handles response without status', () => {
      const hmrcResponse = {
        data: {},
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('SERVER_ERROR');
    });

    test('prefers error code from body over status code', () => {
      const hmrcResponse = {
        status: 400,
        data: {
          code: 'INSOLVENT_TRADER',
          message: 'Trader is insolvent',
        },
      };
      const result = getErrorMessageFromHmrcResponse(hmrcResponse);
      expect(result.code).toBe('INSOLVENT_TRADER');
      expect(result.httpStatus).toBe(403); // From error code mapping, not status
    });
  });
});
