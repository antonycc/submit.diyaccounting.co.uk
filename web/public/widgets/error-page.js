// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// Error page shared functionality

(function () {
  // Display actual URL from browser
  const requestedUrlElement = document.getElementById("requestedUrl");
  if (requestedUrlElement) {
    // Get the original URL from referrer or current location
    // CloudFront custom error responses preserve the original URL in the browser
    requestedUrlElement.textContent = window.location.href;
  }

  // Check auth status from localStorage
  const idToken = localStorage.getItem("cognitoIdToken");
  const userInfo = localStorage.getItem("userInfo");
  const loginStatus = document.getElementById("loginStatus");
  const loginLink = document.getElementById("loginLink");

  if (idToken && userInfo && loginStatus && loginLink) {
    try {
      const user = JSON.parse(userInfo);
      loginStatus.textContent = user.email || "Logged in";
      loginLink.textContent = "Log out";
      loginLink.href = "#";
      loginLink.onclick = function (e) {
        e.preventDefault();
        localStorage.removeItem("cognitoIdToken");
        localStorage.removeItem("cognitoAccessToken");
        localStorage.removeItem("cognitoRefreshToken");
        localStorage.removeItem("userInfo");
        window.location.reload();
      };
    } catch (e) {
      // Parse error, keep default state
    }
  }
})();
