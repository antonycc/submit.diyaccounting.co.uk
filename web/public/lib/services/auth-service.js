/**
 * Authentication and token management service.
 */

import { getLocalStorageItem, setLocalStorageItem } from "../utils/storage-utils.js";
import { getJwtExpiryMs } from "../utils/jwt-utils.js";
import { showStatus } from "../utils/dom-utils.js";
import { fetchWithId } from "./api-client.js";

let __ensureSessionInflight = null;

export function getAccessToken() {
  return getLocalStorageItem("cognitoAccessToken");
}

export function getIdToken() {
  return getLocalStorageItem("cognitoIdToken");
}

/**
 * Checks authentication status and token expiry.
 */
export function checkAuthStatus() {
  const accessToken = getAccessToken();
  const idToken = getIdToken();
  const userInfo = getLocalStorageItem("userInfo");

  if (accessToken && userInfo) {
    console.log("User is authenticated");
    checkTokenExpiry(accessToken, idToken);
    if (typeof window !== "undefined" && typeof window.updateLoginStatus === "function") {
      window.updateLoginStatus();
    }
  } else {
    console.log("User is not authenticated");
    if (typeof window !== "undefined" && typeof window.updateLoginStatus === "function") {
      window.updateLoginStatus();
    }
  }
}

/**
 * Validates token expiry and attempts refresh if needed.
 */
export function checkTokenExpiry(accessToken, idToken) {
  try {
    const now = Date.now();
    const accessExpMs = getJwtExpiryMs(accessToken);
    const idExpMs = getJwtExpiryMs(idToken);

    const accessExpired = accessExpMs && accessExpMs < now;
    const idExpired = idExpMs && idExpMs < now;

    if (accessExpired || idExpired) {
      console.warn("Token(s) expired on page load", { accessExpired, idExpired });
      const sStatus = typeof window !== "undefined" && typeof window.showStatus === "function" ? window.showStatus : showStatus;
      sStatus("Your session has expired. Attempting to refresh...", "info");

      ensureSession({ force: true })
        .then((newToken) => {
          if (newToken) {
            console.log("Token refresh successful on page load");
            sStatus("Session refreshed successfully.", "success");
          } else {
            console.warn("Token refresh failed on page load");
            sStatus("Session expired. Please log in again.", "warning");
            if (typeof window !== "undefined") {
              setTimeout(() => {
                window.location.href = "/auth/login.html";
              }, 3000);
            }
          }
        })
        .catch((err) => {
          console.error("Token refresh error on page load:", err);
          sStatus("Session expired. Please log in again.", "warning");
          if (typeof window !== "undefined") {
            setTimeout(() => {
              window.location.href = "/auth/login.html";
            }, 3000);
          }
        });
      return;
    }

    const fiveMinutes = 5 * 60 * 1000;
    const accessExpiringSoon = accessExpMs && accessExpMs - now < fiveMinutes && accessExpMs - now > 0;
    const idExpiringSoon = idExpMs && idExpMs - now < fiveMinutes && idExpMs - now > 0;

    if (accessExpiringSoon || idExpiringSoon) {
      console.log("Token(s) expiring soon, attempting preemptive refresh");
      ensureSession({ force: false, minTTLms: fiveMinutes }).catch((err) => {
        console.warn("Preemptive token refresh failed:", err);
      });
    }
  } catch (error) {
    console.warn("Error checking token expiry:", error);
  }
}

/**
 * Ensures a valid session by refreshing tokens if needed.
 * Idempotent: returns existing in-flight promise if refresh is already in progress.
 */
export async function ensureSession({ minTTLms = 30000, force = false } = {}) {
  try {
    const accessToken = getAccessToken();
    const refreshToken = getLocalStorageItem("cognitoRefreshToken");

    if (!force && accessToken) {
      const expMs = getJwtExpiryMs(accessToken);
      if (expMs && expMs - Date.now() > minTTLms) {
        return accessToken;
      }
    }

    if (!refreshToken) {
      console.warn("No refresh token available");
      return accessToken;
    }

    if (__ensureSessionInflight) {
      return __ensureSessionInflight;
    }

    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });

    __ensureSessionInflight = (async () => {
      try {
        const res = await (typeof window !== "undefined" && typeof window.fetchWithId === "function"
          ? window.fetchWithId("/api/v1/cognito/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body,
            })
          : fetchWithId("/api/v1/cognito/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body,
            }));

        if (!res.ok) {
          console.warn("Token refresh failed via backend:", res.status);
          return accessToken;
        }

        const json = await res.json();
        const newAccess = json.accessToken || json.access_token || accessToken;
        const newId = json.idToken || json.id_token || getLocalStorageItem("cognitoIdToken");
        const newRefresh = json.refreshToken || json.refresh_token || refreshToken;

        const prevAccess = getAccessToken();

        if (newAccess) setLocalStorageItem("cognitoAccessToken", newAccess);
        if (newId) setLocalStorageItem("cognitoIdToken", newId);
        if (newRefresh) setLocalStorageItem("cognitoRefreshToken", newRefresh);

        if (newAccess && newAccess !== prevAccess) {
          try {
            if (typeof window !== "undefined" && window.requestCache?.invalidate) {
              window.requestCache.invalidate("/api/");
            }
          } catch (err) {
            console.warn("Failed to invalidate request cache:", err.message);
          }
          setLocalStorageItem("auth:lastUpdate", String(Date.now()));
        }
        return newAccess;
      } catch (err) {
        console.warn("Failed to refresh access token:", err.message);
        return accessToken;
      } finally {
        __ensureSessionInflight = null;
      }
    })();

    return __ensureSessionInflight;
  } catch (err) {
    console.error("Error in ensureSession:", err);
    return getAccessToken();
  }
}

/**
 * Handle 403 Forbidden errors with user guidance.
 */
export async function handle403Error(response) {
  try {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody.message || "Access forbidden. You may need to add a bundle to access this feature.";
    console.warn("403 Forbidden:", message);

    const sStatus = typeof window !== "undefined" && typeof window.showStatus === "function" ? window.showStatus : showStatus;
    if (typeof window !== "undefined") {
      sStatus(`${message} Click here to add bundles.`, "error");
      setTimeout(() => {
        const statusContainer = document.getElementById("statusMessagesContainer");
        if (statusContainer) {
          const lastMessage = statusContainer.lastElementChild;
          if (lastMessage && lastMessage.classList.contains("status-error")) {
            lastMessage.style.cursor = "pointer";
            lastMessage.onclick = () => {
              window.location.href = "/account/bundles.html";
            };
          }
        }
      }, 100);
    }
  } catch (e) {
    console.warn("Failed to handle 403 error:", e);
  }
}
