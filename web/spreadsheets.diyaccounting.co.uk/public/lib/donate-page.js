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

// Save download context to sessionStorage for donation return flow
if (downloadUrl) {
  sessionStorage.setItem('donateProduct', productId);
  sessionStorage.setItem('donateFilename', filename);
}

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

// GA4 ecommerce: begin_checkout when user clicks Stripe donate link
document.getElementById('stripe-donate-link').addEventListener('click', function () {
  trackEvent('begin_checkout', {
    currency: 'GBP',
    value: 0,
    payment_method: 'stripe',
    items: [{
      item_id: productId,
      item_name: productId,
      price: 0,
      currency: 'GBP'
    }]
  });
});

// GA4 ecommerce: begin_checkout when user submits the PayPal donate form
document.getElementById('paypal-donate-form').addEventListener('submit', function () {
  trackEvent('begin_checkout', {
    currency: 'GBP',
    value: 0,
    payment_method: 'paypal',
    items: [{
      item_id: productId,
      item_name: productId,
      price: 0,
      currency: 'GBP'
    }]
  });
});
