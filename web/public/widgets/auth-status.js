(function () {
  function pickDisplayName(user) {
    const candidates = ["given_name", "name", "email", "sub"];

    for (const key of candidates) {
      if (user[key]) {
        return user[key];
      }
    }

    return "Unidentified User";
  }

  // Ensure the token-balance element exists in the auth-section
  function ensureTokenBalanceElement(loginStatusElement, loginLinkElement) {
    const authSection = loginStatusElement.parentNode;
    let tokenBalanceEl = authSection.querySelector(".token-balance");
    if (tokenBalanceEl) return tokenBalanceEl;

    tokenBalanceEl = document.createElement("span");
    tokenBalanceEl.className = "token-balance";
    tokenBalanceEl.style.display = "none";

    const tokenCountEl = document.createElement("span");
    tokenCountEl.className = "token-count";

    const refreshBtn = document.createElement("button");
    refreshBtn.className = "token-refresh-btn";
    refreshBtn.setAttribute("aria-label", "check token balance");
    refreshBtn.setAttribute("title", "check token balance");
    refreshBtn.type = "button";
    refreshBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">' +
      '<path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>' +
      "</svg>";
    refreshBtn.addEventListener("click", onRefreshTokenBalance);

    tokenBalanceEl.appendChild(tokenCountEl);
    tokenBalanceEl.appendChild(refreshBtn);
    authSection.insertBefore(tokenBalanceEl, loginLinkElement);
    return tokenBalanceEl;
  }

  // Fetch and display token balance
  async function fetchAndDisplayTokens() {
    const loginStatusElement = document.querySelector(".login-status");
    const loginLinkElement = document.querySelector(".login-link");
    if (!loginStatusElement || !loginLinkElement) return;

    const userInfo = localStorage.getItem("userInfo");
    if (!userInfo) return;

    const tokenBalanceEl = ensureTokenBalanceElement(loginStatusElement, loginLinkElement);
    const tokenCountEl = tokenBalanceEl.querySelector(".token-count");
    if (!tokenCountEl) return;

    // Wait for submit.js to be ready (provides fetchWithIdToken)
    if (!window.__submitReady__) {
      document.addEventListener("submit-ready", () => fetchAndDisplayTokens(), { once: true });
      return;
    }

    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) {
      tokenBalanceEl.style.display = "none";
      return;
    }

    try {
      const rc = window.requestCache;
      let data;
      if (rc && typeof rc.getJSON === "function") {
        data = await rc.getJSON("/api/v1/bundle", {
          ttlMs: 5000,
          init: { headers: { Authorization: "Bearer " + idToken } },
        });
      } else if (window.fetchWithIdToken) {
        const response = await window.fetchWithIdToken("/api/v1/bundle", {});
        if (response.ok) {
          data = await response.json();
        }
      }

      if (data && data.bundles && Array.isArray(data.bundles)) {
        const hasTokenBundles = data.bundles.some(function (b) {
          return b.allocated && b.tokensGranted !== undefined;
        });
        if (hasTokenBundles && typeof data.tokensRemaining === "number") {
          tokenCountEl.textContent = data.tokensRemaining + " token" + (data.tokensRemaining !== 1 ? "s" : "");
          tokenBalanceEl.style.display = "inline-flex";
          return;
        }
      }
      tokenBalanceEl.style.display = "none";
    } catch (err) {
      console.warn("Failed to fetch token balance:", err);
      tokenBalanceEl.style.display = "none";
    }
  }

  // Refresh button handler: clear all caches and re-fetch
  function onRefreshTokenBalance() {
    // Clear L1 in-memory request cache
    if (window.requestCache && typeof window.requestCache.invalidate === "function") {
      window.requestCache.invalidate("/api/v1/bundle");
    }
    // Clear L2 IndexedDB bundle cache
    try {
      var userInfoJson = localStorage.getItem("userInfo");
      if (userInfoJson && window.bundleCache) {
        var user = JSON.parse(userInfoJson);
        if (user && user.sub) {
          window.bundleCache.clearBundles(user.sub);
        }
      }
    } catch (e) {
      // ignore
    }
    // Also reset the entitlement-status widget's in-memory cache
    if (window.__entitlementStatus) {
      // Trigger a fresh entitlement check on next call
      try {
        window.EntitlementStatus.update();
      } catch (e) {
        // ignore
      }
    }
    fetchAndDisplayTokens();
  }

  // Update login status display
  function updateLoginStatus() {
    const userInfo = localStorage.getItem("userInfo");
    const loginStatusElement = document.querySelector(".login-status");
    const loginLinkElement = document.querySelector(".login-link");

    if (!loginStatusElement || !loginLinkElement) {
      return; // Elements not found, skip
    }

    if (userInfo) {
      const user = JSON.parse(userInfo);
      const userLabel = pickDisplayName(user);
      console.log("User info:", user);
      console.log("User label:", userLabel);
      loginStatusElement.textContent = "Logged in as " + userLabel;
      loginLinkElement.textContent = "Logout";
      loginLinkElement.href = "#";
      loginLinkElement.onclick = logout;
      // Fetch token balance after login status is set
      fetchAndDisplayTokens();
    } else {
      loginStatusElement.textContent = "Not logged in";
      // Hide token balance when not logged in
      var tokenBalanceEl = document.querySelector(".token-balance");
      if (tokenBalanceEl) tokenBalanceEl.style.display = "none";

      const currentPage = window.location.pathname.split("/").pop();
      if (currentPage === "login.html") {
        loginLinkElement.textContent = "Home";
        loginLinkElement.href = "../index.html";
      } else {
        loginLinkElement.textContent = "Log in";
        loginLinkElement.href = "../auth/login.html";
      }
      loginLinkElement.onclick = null;
    }
  }

  // Logout function
  function logout() {
    console.log("Logging out user");

    // Clear Cognito tokens and user info from localStorage
    localStorage.removeItem("cognitoAccessToken");
    localStorage.removeItem("cognitoIdToken");
    localStorage.removeItem("cognitoRefreshToken");
    localStorage.removeItem("userInfo");
    localStorage.removeItem("authState");

    // Clear HMRC-related data from sessionStorage
    sessionStorage.removeItem("hmrcAccessToken");
    sessionStorage.removeItem("hmrcAccount");
    sessionStorage.removeItem("submission_data");
    sessionStorage.removeItem("pendingObligationsRequest");
    sessionStorage.removeItem("pendingReturnRequest");
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("cognito_oauth_state");
    sessionStorage.removeItem("traceparent");
    sessionStorage.removeItem("mfaMetadata");

    // Update login status
    updateLoginStatus();

    // In simulator mode, navigate to activities page instead of reloading
    // (demo credentials are re-injected on each page load)
    if (document.documentElement.dataset.simulator === "true") {
      const pathPrefix = window.location.pathname.startsWith("/sim/") ? "/sim/" : "/";
      window.location.href = window.location.origin + pathPrefix + "index.html";
      return;
    }

    // Check if COGNITO_CONFIG is available for logout URL
    // if (typeof COGNITO_CONFIG !== "undefined") {
    //  // Redirect to Cognito logout URL
    //  const logoutUrl =
    //    `https://${COGNITO_CONFIG.domain}/logout?` +
    //    `client_id=${COGNITO_CONFIG.clientId}&` +
    //    `logout_uri=${encodeURIComponent(window.location.origin + "/")}`;
    //
    //  window.location.href = logoutUrl;
    // } else {
    //  // Fallback: just reload the page if COGNITO_CONFIG is not available
    window.location.reload();
    // }
  }

  // Initialize auth status
  function initializeAuthStatus() {
    updateLoginStatus();
  }

  // Expose functions globally for backward compatibility
  if (typeof window !== "undefined") {
    window.updateLoginStatus = updateLoginStatus;
    window.logout = logout;
    window.AuthStatus = {
      update: updateLoginStatus,
      logout: logout,
      initialize: initializeAuthStatus,
      refreshTokens: fetchAndDisplayTokens,
    };

    // Refresh token display when bundles change (e.g. after grant/revoke on bundles.html)
    window.addEventListener("bundle-changed", function () {
      if (window.requestCache) window.requestCache.invalidate("/api/v1/bundle");
      fetchAndDisplayTokens();
    });
  }

  // Auto-initialize if DOM is already loaded, otherwise wait for it
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAuthStatus);
  } else {
    initializeAuthStatus();
  }
})();
