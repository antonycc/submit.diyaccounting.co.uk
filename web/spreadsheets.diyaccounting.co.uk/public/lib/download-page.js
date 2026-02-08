/* SPDX-License-Identifier: AGPL-3.0-only */
/* Copyright (C) 2025-2026 DIY Accounting Ltd */

// Safe wrapper - gtag may not be loaded if blocked by consent/adblocker
function trackEvent(eventName, params) {
  if (typeof gtag === 'function') {
    gtag('event', eventName, params);
  }
}

var catalogue = null;

function loadCatalogue() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'catalogue.toml', true);
  xhr.onload = function () {
    if (xhr.status === 200) {
      catalogue = TomlParser.parse(xhr.responseText);
      initForm();
    } else {
      document.getElementById('product-description').textContent =
        'Could not load product catalogue. Please try again later.';
    }
  };
  xhr.onerror = function () {
    document.getElementById('product-description').textContent =
      'Could not load product catalogue. Please try again later.';
  };
  xhr.send();
}

function initForm() {
  var products = catalogue.products || [];
  var productSelect = document.getElementById('product-select');

  // Populate product dropdown
  productSelect.innerHTML = '';
  for (var i = 0; i < products.length; i++) {
    var opt = document.createElement('option');
    opt.value = products[i].id;
    opt.textContent = products[i].name;
    productSelect.appendChild(opt);
  }

  // Set product from URL query parameter if present
  var params = new URLSearchParams(window.location.search);
  var urlProduct = params.get('product');
  if (urlProduct) {
    for (var j = 0; j < products.length; j++) {
      if (products[j].id === urlProduct) {
        productSelect.value = urlProduct;
        break;
      }
    }
  }

  // Show the form
  document.getElementById('download-form').classList.remove('hidden');
  updatePeriods();
  updateTitle();

  // Detect donation return (Stripe or PayPal) and auto-trigger download from sessionStorage
  var returnParams = new URLSearchParams(window.location.search);
  var isPayPalReturn = returnParams.get('st') === 'Completed';
  var isStripeReturn = returnParams.get('stripe') === 'success';
  if (isPayPalReturn || isStripeReturn) {
    var savedFilename = sessionStorage.getItem('donateFilename');
    var savedProduct = sessionStorage.getItem('donateProduct');
    sessionStorage.removeItem('donateFilename');
    sessionStorage.removeItem('donateProduct');
    if (savedFilename) {
      var provider = isStripeReturn ? 'stripe' : 'paypal';
      trackEvent('purchase', {
        transaction_id: provider + '_' + Date.now(),
        value: 0,
        currency: 'GBP',
        items: [{
          item_id: savedProduct,
          item_name: savedProduct,
          price: 0,
          currency: 'GBP'
        }]
      });
      window.location = '/zips/' + encodeURIComponent(savedFilename);
      return;
    }
  }
}

function getSelectedProduct() {
  if (!catalogue) return null;
  var productId = document.getElementById('product-select').value;
  var products = catalogue.products || [];
  for (var i = 0; i < products.length; i++) {
    if (products[i].id === productId) return products[i];
  }
  return null;
}

function updateTitle() {
  var product = getSelectedProduct();
  if (product) {
    document.getElementById('product-title').textContent = 'Download ' + product.name;
    document.getElementById('product-description').textContent = product.description;
    trackEvent('view_item', {
      currency: 'GBP',
      value: 0,
      items: [{
        item_id: product.id,
        item_name: product.name,
        price: 0,
        currency: 'GBP'
      }]
    });
  }
}

function updatePeriods() {
  var product = getSelectedProduct();
  var periodSelect = document.getElementById('period-select');
  periodSelect.innerHTML = '';

  if (!product || !product.periods || product.periods.length === 0) {
    var opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No periods available';
    periodSelect.appendChild(opt);
    return;
  }

  for (var i = 0; i < product.periods.length; i++) {
    var period = product.periods[i];
    var opt = document.createElement('option');
    opt.value = i;
    opt.textContent = period.label + ' (' + period.format + ')';
    periodSelect.appendChild(opt);
  }

  updateLinks();
}

function getSelectedPeriod() {
  var product = getSelectedProduct();
  if (!product) return null;
  var idx = parseInt(document.getElementById('period-select').value, 10);
  if (isNaN(idx) || !product.periods[idx]) return null;
  return product.periods[idx];
}

function updateLinks() {
  var product = getSelectedProduct();
  var period = getSelectedPeriod();
  if (!product || !period) return;

  var filename = period.filename;

  // Donate link passes parameters
  var donateBtn = document.getElementById('download-donate-btn');
  donateBtn.href = 'donate.html?product=' + encodeURIComponent(product.id)
    + '&filename=' + encodeURIComponent(filename);

  // Direct download link to zip on this site
  var directBtn = document.getElementById('download-direct-btn');
  directBtn.href = '/zips/' + encodeURIComponent(filename);
}

document.getElementById('product-select').addEventListener('change', function () {
  updateTitle();
  updatePeriods();
});
document.getElementById('period-select').addEventListener('change', updateLinks);

// GA4 ecommerce: begin_checkout when user clicks "Download with optional donation"
document.getElementById('download-donate-btn').addEventListener('click', function () {
  var product = getSelectedProduct();
  if (product) {
    trackEvent('begin_checkout', {
      currency: 'GBP',
      value: 0,
      items: [{
        item_id: product.id,
        item_name: product.name,
        price: 0,
        currency: 'GBP'
      }]
    });
  }
});

// GA4 ecommerce: add_to_cart when user clicks "Download without donating" (free download)
document.getElementById('download-direct-btn').addEventListener('click', function () {
  var product = getSelectedProduct();
  if (product) {
    trackEvent('add_to_cart', {
      currency: 'GBP',
      value: 0,
      items: [{
        item_id: product.id,
        item_name: product.name,
        price: 0,
        currency: 'GBP'
      }]
    });
  }
});

loadCatalogue();
