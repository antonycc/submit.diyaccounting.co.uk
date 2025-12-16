import { writable, derived } from "svelte/store";

// Auth state
function createAuthStore() {
  const { subscribe, set, update } = writable({
    accessToken: null,
    idToken: null,
    refreshToken: null,
    userInfo: null,
    isAuthenticated: false,
  });

  // Initialize from localStorage
  if (typeof window !== "undefined") {
    const accessToken = localStorage.getItem("cognitoAccessToken");
    const idToken = localStorage.getItem("cognitoIdToken");
    const refreshToken = localStorage.getItem("cognitoRefreshToken");
    const userInfoStr = localStorage.getItem("userInfo");

    if (accessToken && userInfoStr) {
      set({
        accessToken,
        idToken,
        refreshToken,
        userInfo: JSON.parse(userInfoStr),
        isAuthenticated: true,
      });
    }
  }

  return {
    subscribe,
    login: (tokens, userInfo) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("cognitoAccessToken", tokens.accessToken);
        localStorage.setItem("cognitoIdToken", tokens.idToken);
        if (tokens.refreshToken) {
          localStorage.setItem("cognitoRefreshToken", tokens.refreshToken);
        }
        localStorage.setItem("userInfo", JSON.stringify(userInfo));
      }
      set({
        ...tokens,
        userInfo,
        isAuthenticated: true,
      });
    },
    logout: () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("cognitoAccessToken");
        localStorage.removeItem("cognitoIdToken");
        localStorage.removeItem("cognitoRefreshToken");
        localStorage.removeItem("userInfo");
      }
      set({
        accessToken: null,
        idToken: null,
        refreshToken: null,
        userInfo: null,
        isAuthenticated: false,
      });
    },
    updateTokens: (tokens) => {
      update((state) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("cognitoAccessToken", tokens.accessToken);
          localStorage.setItem("cognitoIdToken", tokens.idToken);
          if (tokens.refreshToken) {
            localStorage.setItem("cognitoRefreshToken", tokens.refreshToken);
          }
        }
        return {
          ...state,
          ...tokens,
        };
      });
    },
  };
}

export const authStore = createAuthStore();

// Derived store for user display name
export const userName = derived(authStore, ($auth) => $auth.userInfo?.name || $auth.userInfo?.email || "User");
