import { get } from "svelte/store";
import { authStore } from "../stores/authStore";

class ApiClient {
  constructor() {
    this.baseUrl = "";
  }

  async request(url, options = {}) {
    const auth = get(authStore);
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (auth.isAuthenticated && auth.accessToken) {
      headers["Authorization"] = `Bearer ${auth.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("API request failed:", url, error);
      throw error;
    }
  }

  // Auth endpoints
  async getCognitoAuthUrl() {
    return this.request("/api/auth/cognito/authurl");
  }

  async exchangeCognitoToken(code, state) {
    return this.request("/api/auth/cognito/token", {
      method: "POST",
      body: JSON.stringify({ code, state }),
    });
  }

  // HMRC endpoints
  async getHmrcAuthUrl(account = "prod") {
    return this.request(`/api/hmrc/authurl?account=${account}`);
  }

  async exchangeHmrcToken(code, state, account = "prod") {
    return this.request("/api/hmrc/token", {
      method: "POST",
      body: JSON.stringify({ code, state, account }),
    });
  }

  async getVatObligations(vrn, account = "prod") {
    return this.request(`/api/hmrc/vat/obligations?vrn=${vrn}&account=${account}`);
  }

  async getVatReturn(vrn, periodKey, account = "prod") {
    return this.request(`/api/hmrc/vat/returns?vrn=${vrn}&periodKey=${periodKey}&account=${account}`);
  }

  async submitVatReturn(vrn, periodKey, vatReturn, account = "prod") {
    return this.request("/api/hmrc/vat/returns", {
      method: "POST",
      body: JSON.stringify({ vrn, periodKey, vatReturn, account }),
    });
  }

  async getReceipts() {
    return this.request("/api/hmrc/receipts");
  }

  async getReceipt(receiptId) {
    return this.request(`/api/hmrc/receipts?receiptId=${receiptId}`);
  }

  // Account endpoints
  async getBundles() {
    return this.request("/api/account/bundles");
  }

  async addBundle(product) {
    return this.request("/api/account/bundles", {
      method: "POST",
      body: JSON.stringify({ product }),
    });
  }

  async removeBundle(product) {
    return this.request("/api/account/bundles", {
      method: "DELETE",
      body: JSON.stringify({ product }),
    });
  }

  async getCatalog() {
    return this.request("/api/account/catalog");
  }
}

export const api = new ApiClient();
