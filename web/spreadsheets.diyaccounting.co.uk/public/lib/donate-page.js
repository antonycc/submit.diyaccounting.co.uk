/* SPDX-License-Identifier: AGPL-3.0-only */
/* Copyright (C) 2025-2026 DIY Accounting Ltd */

// Read query parameters from download page
var params = new URLSearchParams(window.location.search);
var filename = params.get('filename');
var downloadUrl = filename ? '/zips/' + encodeURIComponent(filename) : null;

// Show download link if a specific file was selected
if (downloadUrl) {
  var linkContainer = document.getElementById('download-link-container');
  var skipLink = document.getElementById('skip-donate-link');
  var browseContainer = document.getElementById('browse-products-container');
  linkContainer.classList.remove('hidden');
  browseContainer.classList.add('hidden');
  skipLink.href = downloadUrl;
}

PayPal.Donation.Button({
  env: "production",
  hosted_button_id: "XTEQ73HM52QQW",
  onComplete: function () {
    // After donation, redirect to the download or product listing
    if (downloadUrl) {
      window.location = downloadUrl;
    } else {
      window.location = 'index.html';
    }
  }
}).render("#paypal-donate-button");
