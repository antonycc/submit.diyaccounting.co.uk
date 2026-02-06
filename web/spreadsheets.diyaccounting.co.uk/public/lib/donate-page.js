/* SPDX-License-Identifier: AGPL-3.0-only */
/* Copyright (C) 2025-2026 DIY Accounting Ltd */

// Safe wrapper - gtag may not be loaded if blocked by consent/adblocker
function trackEvent(eventName, params) {
  if (typeof gtag === 'function') {
    gtag('event', eventName, params);
  }
}

// Read query parameters from download page
var params = new URLSearchParams(window.location.search);
var productId = params.get('product') || '';
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

  // GA4 ecommerce: begin_checkout when donate page loads with a product
  trackEvent('begin_checkout', {
    currency: 'GBP',
    value: 0,
    items: [{
      item_id: productId,
      item_name: productId,
      price: 0,
      currency: 'GBP'
    }]
  });

  // GA4 ecommerce: add_to_cart when user clicks "Download without donating"
  skipLink.addEventListener('click', function () {
    trackEvent('add_to_cart', {
      currency: 'GBP',
      value: 0,
      items: [{
        item_id: productId,
        item_name: productId,
        price: 0,
        currency: 'GBP'
      }]
    });
  });
}

PayPal.Donation.Button({
  env: "production",
  hosted_button_id: "XTEQ73HM52QQW",
  onComplete: function () {
    // GA4 ecommerce: purchase when PayPal donation completes
    trackEvent('purchase', {
      transaction_id: 'paypal_' + Date.now(),
      value: 0,
      currency: 'GBP',
      items: [{
        item_id: productId,
        item_name: productId,
        price: 0,
        currency: 'GBP'
      }]
    });

    // After donation, redirect to the download or product listing
    if (downloadUrl) {
      window.location = downloadUrl;
    } else {
      window.location = 'index.html';
    }
  }
}).render("#paypal-donate-button");
