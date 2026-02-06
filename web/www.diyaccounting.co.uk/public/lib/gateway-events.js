/* SPDX-License-Identifier: AGPL-3.0-only */
/* Copyright (C) 2025-2026 DIY Accounting Ltd */

// GA4: select_content events for gateway navigation buttons
(function () {
  if (typeof gtag !== 'function') return;

  var buttons = document.querySelectorAll('.gateway-btn');
  for (var i = 0; i < buttons.length; i++) {
    (function (btn) {
      var href = btn.getAttribute('href') || '';
      var itemId = null;
      if (href.indexOf('submit.diyaccounting.co.uk') !== -1) {
        itemId = 'submit';
      } else if (href.indexOf('spreadsheets.diyaccounting.co.uk') !== -1) {
        itemId = 'spreadsheets';
      }
      if (itemId) {
        btn.addEventListener('click', function () {
          gtag('event', 'select_content', {
            content_type: 'product_link',
            item_id: itemId
          });
        });
      }
    })(buttons[i]);
  }
})();
