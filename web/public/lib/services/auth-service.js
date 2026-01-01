// Authentication service for managing user authentication and tokens
import { getJwtExpiryMs } from "../utils/jwt-utils.js";
import { getLocalStorage, setLocalStorage, removeLocalStorage } from "../utils/storage-utils.js";
import { showStatus } from "../utils/dom-utils.js";

let __ensureSessionInflight = null;

/**
 * Get current access token from storage
 * @returns {string|null} Access token or null
 */
export function getAccessToken() {
  return getLocalStorage("cognitoAccessToken");
}

/**
 * Get current ID token from storage
 * @returns {string|null} ID token or null
 */
export function getIdToken() {
  return getLocalStorage("cognitoIdToken");
}

/**
 * Get current refresh token from storage
 * @returns {string|null} Refresh token or null
 */
export function getRefreshToken() {
  return getLocalStorage("cognitoRefreshToken");
}

/**
 * Get current user info from storage
 * @returns {object|null} User info object or null
 */
export function getUserInfo() {
  const userInfoStr = getLocalStorage("userInfo");
  if (!userInfoStr) return null;
  try {
    return JSON.parse(userInfoStr);
  } catch {
    return null;
  }
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if user has access token and user info
 */
export function isAuthenticated() {
  return !!(getAccessToken() && getUserInfo());
}

/**
 * Check authentication status and update UI
 */
export function checkAuthStatus() {
  const accessToken = getAccessToken();
  const idToken = getIdToken();
  const userInfo = getUserInfo();

  if (accessToken && userInfo) {
    console.log("User is authenticated");

    // Check if tokens are expired or about to expire
    checkTokenExpiry(accessToken, idToken);

    // Update login status in UI (if function exists)
    if (typeof window !== "undefined" && typeof window.updateLoginStatus === "function") {
      window.updateLoginStatus();
    }
  } else {
    console.log("User is not authenticated");
    // Update login status in UI (if function exists)
    if (typeof window !== "undefined" && typeof window.updateLoginStatus === "function") {
      window.updateLoginStatus();
    }
  }
}

/**
 * Check if tokens are expired and attempt refresh if needed
 * @param {string} accessToken - Access token to check
 * @param {string} idToken - ID token to check
 */
export function checkTokenExpiry(accessToken, idToken) {
  try {
    const now = Date.now();
    const accessExpMs = getJwtExpiryMs(accessToken);
    const idExpMs = getJwtExpiryMs(idToken);

    // Check if either token is expired
    const accessExpired = accessExpMs && accessExpMs < now;
    const idExpired = idExpMs && idExpMs < now;

    if (accessExpired || idExpired) {
      console.warn("Token(s) expired on page load", { accessExpired, idExpired });

      // Notify user and offer to refresh
      if (typeof window !== "undefined" && window.showStatus) {
        window.showStatus("Your session has expired. Attempting to refresh...", "info");
      }

      // Attempt to refresh tokens (fire-and-forget)
      ensureSession({ force: true })
        .then((newToken) => {
          if (newToken) {
            console.log("Token refresh successful on page load");
            if (typeof window !== "undefined" && window.showStatus) {
              window.showStatus("Session refreshed successfully.", "success");
            }
          } else {
            console.warn("Token refresh failed on page load");
            if (typeof window !== "undefined" && window.showStatus) {
              window.showStatus("Session expired. Please log in again.", "warning");
              setTimeout(() => {
                window.location.href = "/auth/login.html";
              }, 3000);
            }
          }
          return undefined;
        })
        .catch((err) => {
          console.error("Token refresh error on page load:", err);
          if (typeof window !== "undefined" && window.showStatus) {
            window.showStatus("Session expired. Please log in again.", "warning");
            setTimeout(() => {
              window.location.href = "/auth/login.html";
            }, 3000);
          }
        });
      return;
    }

    // Check if tokens are expiring soon (within 5 minutes)
    const fiveMinutes = 5 * 60 * 1000;
    const accessExpiringSoon = accessExpMs && accessExpMs - now < fiveMinutes && accessExpMs - now > 0;
    const idExpiringSoon = idExpMs && idExpMs - now < fiveMinutes && idExpMs - now > 0;

    if (accessExpiringSoon || idExpiringSoon) {
      console.log("Token(s) expiring soon, attempting preemptive refresh");
      // Silently attempt to refresh tokens before they expire (fire-and-forget)
      ensureSession({ force: false, minTTLms: fiveMinutes })
        .then(() => {
          console.log("Preemptive token refresh successful");
          return undefined;
        })
        .catch((err) => {
          console.warn("Preemptive token refresh failed:", err);
        });
    }
  } catch (error) {
    console.warn("Error checking token expiry:", error);
  }
}

/**
 * Ensure Cognito session freshness by refreshing token if needed
 * @param {Object} options - Configuration options
 * @param {number} options.minTTLms - Minimum time-to-live in milliseconds (default: 30000)
 * @param {boolean} options.force - Force refresh even if token is still valid (default: false)
 * @returns {Promise<string|null>} Refreshed access token or null
 */
export async function ensureSession({ minTTLms = 30000, force = false } = {}) {
  try {
    const accessToken = getAccessToken();
    const refreshToken = getRefreshToken();
    if (!accessToken) return null;

    // If not forced, and token is fresh enough, skip
    if (!force) {
      const expMs = getJwtExpiryMs(accessToken);
      const now = Date.now();
      if (expMs && expMs - now > minTTLms) return accessToken;
    }

    // No refresh token or already in-flight
    if (!refreshToken) return accessToken;
    if (__ensureSessionInflight) return __ensureSessionInflight;

    // Attempt refresh via backend endpoint
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });

    __ensureSessionInflight = (async () => {
      try {
        // Use fetchWithId if available, otherwise use fetch directly
        const fetchFn = typeof window !== "undefined" && window.fetchWithId ? window.fetchWithId : fetch;
        const res = await fetchFn("/api/v1/cognito/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        if (!res.ok) {
          // Backend may not support refresh yet; leave tokens as-is
          return accessToken;
        }
        const json = await res.json();
        const newAccess = json.accessToken || json.access_token || accessToken;
        const newId = json.idToken || json.id_token || getIdToken();
        const newRefresh = json.refreshToken || json.refresh_token || refreshToken;

        const prevAccess = getAccessToken();
        // Persist
        if (newAccess) setLocalStorage("cognitoAccessToken", newAccess);
        if (newId) setLocalStorage("cognitoIdToken", newId);
        if (newRefresh) setLocalStorage("cognitoRefreshToken", newRefresh);

        // If token changed, invalidate request cache
        if (newAccess && newAccess !== prevAccess) {
          try {
            window.requestCache?.invalidate?.("/api/");
          } catch (err) {
            console.warn("Failed to invalidate request cache:", err.message);
          }
          try {
            setLocalStorage("auth:lastUpdate", String(Date.now()));
          } catch (err) {
            console.warn("Failed to save auth:lastUpdate to localStorage:", err.message);
          }
        }
        return newAccess;
      } catch (err) {
        console.warn("Failed to refresh access token:", err.message, err.stack);
        return accessToken;
      } finally {
        __ensureSessionInflight = null;
      }
    })();

    return __ensureSessionInflight;
  } catch {
    return getAccessToken();
  }
}

/**
 * Clear all authentication data from storage (logout)
 */
export function clearAuthData() {
  removeLocalStorage("cognitoAccessToken");
  removeLocalStorage("cognitoIdToken");
  removeLocalStorage("cognitoRefreshToken");
  removeLocalStorage("userInfo");
  removeLocalStorage("authState");
}

/**
 * Handle 403 Forbidden errors with user guidance
 * @param {Response} response - Fetch response object
 */
export async function handle403Error(response) {
  try {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody.message || "Access forbidden. You may need to add a bundle to access this feature.";
    console.warn("403 Forbidden:", message);

    // Show user-friendly error and guide to bundles page
    if (typeof window !== "undefined" && window.showStatus) {
      window.showStatus(`${message} Click here to add bundles.`, "error");
      // Add a link to bundles page in the error message
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
