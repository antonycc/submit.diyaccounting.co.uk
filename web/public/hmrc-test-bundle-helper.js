/* eslint-env browser */
// web/public/hmrc-test-bundle-helper.js
// Helper functions for test bundle support in HMRC API pages

/**
 * Check if user has test bundle and provide a mock HMRC token for stubbed mode.
 * This allows test bundle users to use VAT API pages without going through HMRC OAuth.
 * The backend will use stubbed data when TEST_VAT_OBLIGATIONS or similar env vars are set.
 */
async function checkForTestBundleAndSetMockToken() {
  try {
    // Check if we already have an HMRC access token
    const existingToken = sessionStorage.getItem("hmrcAccessToken");
    if (existingToken) {
      console.log("HMRC access token already exists, skipping mock token setup");
      return;
    }

    // Check if user has Cognito access token (for bundle authorization)
    const cognitoToken = localStorage.getItem("cognitoAccessToken");
    if (!cognitoToken) {
      console.log("No Cognito token found, skipping mock token setup");
      return;
    }

    // Get user's bundles from JWT
    const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
    const bundles = userInfo.bundles || [];

    // Check if user has test bundle
    const hasTestBundle = bundles.includes("test");

    if (hasTestBundle) {
      console.log("Test bundle detected, setting mock HMRC access token for stubbed API mode");
      // Set a dummy token that the backend will ignore in stubbed mode
      sessionStorage.setItem("hmrcAccessToken", "test-mock-token-for-stubbed-api");
    } else {
      console.log("No test bundle found, HMRC OAuth will be required");
    }
  } catch (error) {
    console.error("Error checking for test bundle:", error);
  }
}
