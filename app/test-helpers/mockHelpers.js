// app/test-helpers/mockHelpers.js
// Helpers for setting up mocks and test environment

import { vi, expect as vitestExpect } from "vitest";

/**
 * Setup fetch mock for tests
 */
export function setupFetchMock() {
  const mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

/**
 * Mock successful HMRC response
 */
export function mockHmrcSuccess(mockFetch, responseData) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(responseData),
    text: () => Promise.resolve(JSON.stringify(responseData)),
  });
}

/**
 * Mock HMRC error response
 */
export function mockHmrcError(mockFetch, statusCode, errorData) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: statusCode,
    json: () => Promise.resolve(errorData),
    text: () => Promise.resolve(JSON.stringify(errorData)),
  });
}

/**
 * Mock network error
 */
export function mockNetworkError(mockFetch, errorMessage = "Network error") {
  mockFetch.mockRejectedValueOnce(new Error(errorMessage));
}

/**
 * Setup test environment variables
 */
export function setupTestEnv(customEnv = {}) {
  const defaultEnv = {
    // NODE_ENV: "test",
    HMRC_BASE_URI: "https://test-api.service.hmrc.gov.uk",
    HMRC_SANDBOX_BASE_URI: "https://test-api.service.hmrc.gov.uk/test",
    HMRC_CLIENT_ID: "test-client-id",
    HMRC_SANDBOX_CLIENT_ID: "test-sandbox-client-id",
    HMRC_CLIENT_SECRET: "test-client-secret",
    HMRC_SANDBOX_CLIENT_SECRET: "test-sandbox-client-secret",
    BUNDLE_DYNAMODB_TABLE_NAME: "test-bundle-table",
    HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME: "test-hmrc-requests-table",
    RECEIPTS_DYNAMODB_TABLE_NAME: "test-receipts-table",
    DIY_SUBMIT_BASE_URL: "https://test.diyaccounting.co.uk",
    COGNITO_CLIENT_ID: "test-cognito-client-id",
    COGNITO_BASE_URI: "https://test-cognito.amazonaws.com",
    COGNITO_USER_POOL_ID: "test-pool-id",
    COGNITO_USER_POOL_CLIENT_ID: "test-pool-client-id",
    TEST_BUNDLE_MOCK: "true",
  };

  return { ...defaultEnv, ...customEnv };
}

/**
 * Setup bundle mock mode
 */
export function enableBundleMock() {
  process.env.TEST_BUNDLE_MOCK = "true";
}

/**
 * Disable bundle mock mode
 */
export function disableBundleMock() {
  delete process.env.TEST_BUNDLE_MOCK;
}

/**
 * Extract response body as JSON
 */
export function parseResponseBody(response) {
  if (!response.body) return null;
  try {
    return JSON.parse(response.body);
  } catch {
    return response.body;
  }
}

/**
 * Verify response structure
 * Note: This function requires 'expect' from vitest to be available in the calling context
 * It's meant to be used within test files, not as a standalone helper
 */
export function verifyResponseStructure(response, expectedStatusCode) {
  // This function is designed to be used in test contexts where expect is available
  vitestExpect(response).toHaveProperty("statusCode");
  vitestExpect(response).toHaveProperty("headers");
  vitestExpect(response).toHaveProperty("body");
  if (expectedStatusCode !== undefined) {
    vitestExpect(response.statusCode).toBe(expectedStatusCode);
  }
}
