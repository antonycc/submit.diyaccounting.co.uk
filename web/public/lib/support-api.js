// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

/**
 * Support API client
 *
 * For now, this opens a GitHub issue in a new tab with pre-filled content.
 * In the future, this can be extended to call an authenticated Lambda
 * endpoint that creates GitHub issues via the API.
 */

// GitHub repo for support issues
const GITHUB_REPO = "antonycc/submit.diyaccounting.co.uk";

/**
 * Submit a support ticket
 *
 * Currently opens a GitHub issue in a new tab with pre-filled content.
 * The user must be logged into GitHub to submit.
 *
 * @param {Object} params - Support ticket parameters
 * @param {string} params.subject - Issue subject/title
 * @param {string} params.description - Issue description
 * @param {string} params.category - Issue category
 * @returns {Promise<void>}
 */
export async function submitSupportTicket({ subject, description, category }) {
  // Format the issue body
  const body = `## Support Request

**Category:** ${category}
**Submitted via:** DIY Accounting Submit help page

---

${description}

---
*Submitted via DIY Accounting Submit support form*`;

  // Create GitHub issue URL with pre-filled content
  const issueUrl = new URL(`https://github.com/${GITHUB_REPO}/issues/new`);
  issueUrl.searchParams.set("template", "support.md");
  issueUrl.searchParams.set("title", `[Support] ${subject}`);
  issueUrl.searchParams.set("body", body);
  issueUrl.searchParams.set("labels", `support,${category}`);

  // Open in new tab
  window.open(issueUrl.toString(), "_blank", "noopener");

  // Return resolved promise (the actual issue creation happens on GitHub)
  return Promise.resolve();
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.submitSupportTicket = submitSupportTicket;
}
