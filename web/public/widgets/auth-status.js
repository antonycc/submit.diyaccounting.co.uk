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
      loginStatusElement.textContent = `Logged in as ${userLabel}`;
      loginLinkElement.textContent = "Logout";
      loginLinkElement.href = "#";
      loginLinkElement.onclick = logout;
    } else {
      loginStatusElement.textContent = "Not logged in";
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
    };
  }

  // Auto-initialize if DOM is already loaded, otherwise wait for it
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAuthStatus);
  } else {
    initializeAuthStatus();
  }
})();
