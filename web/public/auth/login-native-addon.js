// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/public/auth/login-native-addon.js
// Native Cognito user login addon - only served when TEST_AUTH_PROVIDER=cognito-native
// In other environments, server.js returns an empty script for this file

(function () {
  "use strict";

  const container = document.getElementById("native-auth-container");
  if (!container) return;

  // Inject the native login form
  container.innerHTML = `
    <div class="auth-provider" id="nativeCognitoProvider">
      <h3 style="margin: 1rem 0 0.5rem; font-size: 1rem; color: #666;">Test User Login</h3>
      <form id="nativeLoginForm" class="native-login-form">
        <div class="form-group">
          <input
            type="email"
            id="nativeUsername"
            name="username"
            placeholder="Email address"
            required
            autocomplete="username"
          />
        </div>
        <div class="form-group">
          <input
            type="password"
            id="nativePassword"
            name="password"
            placeholder="Password"
            required
            autocomplete="current-password"
          />
        </div>
        <button type="submit" class="btn auth-btn native-btn" id="loginWithNativeCognito">
          Sign in with Test Account
        </button>
        <p class="native-hint">For behavior tests only</p>
      </form>
    </div>
    <style>
      .native-login-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 300px;
        margin: 0 auto;
      }
      .native-login-form .form-group input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 1rem;
      }
      .native-login-form .form-group input:focus {
        outline: none;
        border-color: #2c5aa0;
      }
      .native-btn {
        background: #6c757d !important;
        border: none;
      }
      .native-btn:hover {
        background: #5a6268 !important;
      }
      .native-hint {
        font-size: 0.75rem;
        color: #999;
        margin: 0.5rem 0 0;
        text-align: center;
      }
    </style>
  `;

  // Add form submit handler
  const form = document.getElementById("nativeLoginForm");
  if (form) {
    form.addEventListener("submit", loginWithNativeCognito);
  }

  // Login with native Cognito user (username/password)
  async function loginWithNativeCognito(e) {
    e.preventDefault();

    const username = document.getElementById("nativeUsername").value;
    const password = document.getElementById("nativePassword").value;
    const submitBtn = document.getElementById("loginWithNativeCognito");

    console.log("Initiating native Cognito user login");

    // Clear stored tokens and user info
    localStorage.removeItem("cognitoAccessToken");
    localStorage.removeItem("cognitoIdToken");
    localStorage.removeItem("cognitoRefreshToken");
    localStorage.removeItem("userInfo");
    localStorage.removeItem("authState");

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";

    try {
      const response = await fetch("/api/v1/cognito/native-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Authentication failed: ${response.status}`);
      }

      const tokens = await response.json();

      // Store tokens
      localStorage.setItem("cognitoAccessToken", tokens.accessToken);
      localStorage.setItem("cognitoIdToken", tokens.idToken);
      if (tokens.refreshToken) {
        localStorage.setItem("cognitoRefreshToken", tokens.refreshToken);
      }

      // Decode ID token to extract user info
      const idTokenPayload = decodeJwtPayload(tokens.idToken);
      const userInfo = {
        sub: idTokenPayload.sub,
        email: idTokenPayload.email || username,
        given_name: idTokenPayload.given_name || "",
        family_name: idTokenPayload.family_name || "",
      };
      localStorage.setItem("userInfo", JSON.stringify(userInfo));

      console.log("Native Cognito login successful", { email: userInfo.email });

      if (typeof showStatus === "function") {
        showStatus("Login successful", "success");
      }

      // Redirect to home page
      window.location.href = "../index.html";
    } catch (error) {
      console.error("Native Cognito login failed:", error);
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign in with Test Account";

      if (typeof showStatus === "function") {
        showStatus(error.message || "Login failed. Please check your credentials.", "error");
      } else {
        alert(error.message || "Login failed. Please check your credentials.");
      }
    }
  }

  // Decode JWT payload (base64url)
  function decodeJwtPayload(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
      }
      const payload = parts[1];
      // Handle base64url encoding
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      const decoded = atob(padded);
      return JSON.parse(decoded);
    } catch (e) {
      console.error("Failed to decode JWT:", e);
      return {};
    }
  }
})();
