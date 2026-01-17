// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

/**
 * Support API client
 *
 * Attempts to submit support tickets via the authenticated Lambda endpoint.
 * Falls back to opening a GitHub issue in a new tab if:
 * - The user is not authenticated
 * - The API call fails
 * - The API endpoint is not configured
 */

// GitHub repo for support issues (fallback)
const GITHUB_REPO = "antonycc/submit.diyaccounting.co.uk";

/**
 * Get the current user's authentication token if available
 * @returns {Promise<string|null>} The JWT token or null if not authenticated
 */
async function getAuthToken() {
  try {
    // Check if auth module is available
    if (typeof window !== "undefined" && window.auth && typeof window.auth.getIdToken === "function") {
      const token = await window.auth.getIdToken();
      return token || null;
    }
    return null;
  } catch (error) {
    console.debug("Could not get auth token:", error.message);
    return null;
  }
}

/**
 * Get the API base URL from the page configuration
 * @returns {string|null} The API base URL or null if not configured
 */
function getApiBaseUrl() {
  // Check for API URL in page config or environment
  if (typeof window !== "undefined") {
    // Try window.config first (set by the app)
    if (window.config && window.config.apiBaseUrl) {
      return window.config.apiBaseUrl;
    }
    // Try data attribute on document
    const apiUrl = document.documentElement.dataset.apiUrl;
    if (apiUrl) {
      return apiUrl;
    }
  }
  return null;
}

/**
 * Submit a support ticket via the Lambda API
 * @param {Object} params - Support ticket parameters
 * @param {string} params.subject - Issue subject/title
 * @param {string} params.description - Issue description
 * @param {string} params.category - Issue category
 * @param {string} token - JWT authentication token
 * @param {string} apiBaseUrl - Base URL for the API
 * @returns {Promise<Object>} The API response
 */
async function submitViaApi({ subject, description, category }, token, apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/api/v1/support/ticket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ subject, description, category }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Open a GitHub issue in a new tab with pre-filled content (fallback)
 * @param {Object} params - Support ticket parameters
 * @param {string} params.subject - Issue subject/title
 * @param {string} params.description - Issue description
 * @param {string} params.category - Issue category
 */
function openGitHubIssue({ subject, description, category }) {
  const body = `## Support Request

**Category:** ${category}
**Submitted via:** DIY Accounting Submit help page

---

${description}

---
*Submitted via DIY Accounting Submit support form*`;

  const issueUrl = new URL(`https://github.com/${GITHUB_REPO}/issues/new`);
  issueUrl.searchParams.set("template", "support.md");
  issueUrl.searchParams.set("title", `[Support] ${subject}`);
  issueUrl.searchParams.set("body", body);
  issueUrl.searchParams.set("labels", `support,${category}`);

  window.open(issueUrl.toString(), "_blank", "noopener");
}

/**
 * Submit a support ticket
 *
 * Attempts to use the authenticated Lambda API first.
 * Falls back to opening a GitHub issue if the API is unavailable.
 *
 * @param {Object} params - Support ticket parameters
 * @param {string} params.subject - Issue subject/title
 * @param {string} params.description - Issue description
 * @param {string} params.category - Issue category
 * @param {Object} options - Additional options
 * @param {boolean} options.preferGitHub - If true, skip API and use GitHub directly
 * @returns {Promise<{method: string, issueNumber?: number, issueUrl?: string}>}
 */
export async function submitSupportTicket({ subject, description, category }, options = {}) {
  const { preferGitHub = false } = options;

  // If user prefers GitHub or we're in a context without API access
  if (preferGitHub) {
    openGitHubIssue({ subject, description, category });
    return { method: "github" };
  }

  // Try to get auth token and API URL
  const token = await getAuthToken();
  const apiBaseUrl = getApiBaseUrl();

  // If we have both token and API URL, try the API first
  if (token && apiBaseUrl) {
    try {
      console.debug("Attempting to submit support ticket via API");
      const result = await submitViaApi({ subject, description, category }, token, apiBaseUrl);
      console.debug("Support ticket created via API:", result);
      return {
        method: "api",
        issueNumber: result.issueNumber,
        issueUrl: result.issueUrl,
      };
    } catch (error) {
      console.warn("API submission failed, falling back to GitHub:", error.message);
      // Fall through to GitHub fallback
    }
  } else {
    console.debug("API not available (token:", !!token, "apiBaseUrl:", !!apiBaseUrl, "), using GitHub fallback");
  }

  // Fallback: open GitHub issue directly
  openGitHubIssue({ subject, description, category });
  return { method: "github" };
}

/**
 * Check if the API-based support ticket submission is available
 * @returns {Promise<boolean>} True if API submission is available
 */
export async function isSupportApiAvailable() {
  const token = await getAuthToken();
  const apiBaseUrl = getApiBaseUrl();
  return !!(token && apiBaseUrl);
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.submitSupportTicket = submitSupportTicket;
  window.isSupportApiAvailable = isSupportApiAvailable;
}
