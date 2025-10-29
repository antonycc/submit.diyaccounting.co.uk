// web/unit-tests/vatFlow.frontend.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

import { buildGovClientTestHeaders } from "@app/unit-tests/govClientTestHeader.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Read the HTML file content
const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/activities/submitVat.html"), "utf-8");

describe("VAT Flow Frontend JavaScript", () => {
  const originalEnv = process.env;

  let window;
  let document;
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
    };

    // Create a new DOM window for each test (v20+ requires enabling JS evaluation)
    try {
      window = new Window({
        settings: {
          enableJavaScriptEvaluation: true,
          // Avoid noisy console warning in CI about insecure JS env during tests
          suppressInsecureJavaScriptEnvironmentWarning: true,
        },
      });
    } catch (err) {
      // Fallback for Happy DOM v19 which doesn't support the setting
      if (String(err?.message || err).includes("Unknown browser setting")) {
        window = new Window();
      } else {
        throw err;
      }
    }
    document = window.document;

    // Set up global objects
    global.window = window;
    global.document = document;
    global.sessionStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    // Also add sessionStorage to window for script access
    Object.defineProperty(window, "sessionStorage", {
      value: global.sessionStorage,
      writable: true,
    });
    global.URLSearchParams = window.URLSearchParams;
    global.FormData = window.FormData;

    // Mock fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    // Set a proper base URL for the document
    Object.defineProperty(window, "location", {
      value: {
        origin: "http://localhost:3000",
        pathname: "/",
        search: "",
        href: "http://localhost:3000/",
      },
      writable: true,
    });

    // Load the HTML content
    document.documentElement.innerHTML = htmlContent;

    // Load and execute submit.js first
    const submitJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/submit.js"), "utf-8");
    const submitScript = document.createElement("script");
    submitScript.textContent = submitJsContent;
    document.head.appendChild(submitScript);

    // Load and execute loading-spinner.js
    const loadingSpinnerJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/loading-spinner.js"), "utf-8");
    const loadingSpinnerScript = document.createElement("script");
    loadingSpinnerScript.textContent = loadingSpinnerJsContent;
    document.head.appendChild(loadingSpinnerScript);

    // Execute the inline script content to define page-specific functions
    const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      const scriptContent = scriptMatch[1];
      // Execute script in the window context
      const script = document.createElement("script");
      script.textContent = scriptContent;
      document.head.appendChild(script);
    }
  });

  afterEach(async () => {
    if (window?.happyDOM?.close) {
      await window.happyDOM.close();
    } else if (typeof window?.close === "function") {
      // Fallback for older Happy DOM versions
      window.close();
    }
  });

  describe("Utility Functions", () => {
    test("showStatus should display status message with correct class", () => {
      const statusMessagesContainer = document.getElementById("statusMessagesContainer");
      // Test info status
      window.showStatus("Test message", "info");
      const statusMessages = statusMessagesContainer.querySelectorAll(".status-message");
      expect(statusMessages.length).toBeGreaterThan(0);
      const firstMsg = statusMessages[0];
      const messageContent = firstMsg.querySelector(".status-message-content");
      const closeButton = firstMsg.querySelector(".status-close-button");
      expect(messageContent.textContent).toBe("Test message");
      expect(closeButton.textContent).toBe("×");
      expect(firstMsg.className).toBe("status-message status-info");
    });

    test("showStatus should display error status", () => {
      const statusMessagesContainer = document.getElementById("statusMessagesContainer");
      window.showStatus("Error message", "error");
      const statusMessages = statusMessagesContainer.querySelectorAll(".status-message");
      expect(statusMessages.length).toBeGreaterThan(0);
      const firstMsg = statusMessages[0];
      const messageContent = firstMsg.querySelector(".status-message-content");
      const closeButton = firstMsg.querySelector(".status-close-button");
      expect(messageContent.textContent).toBe("Error message");
      expect(closeButton.textContent).toBe("×");
      expect(firstMsg.className).toBe("status-message status-error");
    });

    // test("hideStatus should hide status message", () => {
    //  const statusMessage = document.getElementById("statusMessage");

    //  window.hideStatus();
    //  expect(statusMessage.style.display).toBe("none");
    // });

    test("showLoading should show spinner and disable button", () => {
      const loadingSpinner = document.getElementById("loadingSpinner");
      const submitBtn = document.getElementById("submitBtn");

      window.showLoading();
      expect(loadingSpinner.style.display).toBe("block");
      expect(submitBtn.disabled).toBe(true);
    });

    test("hideLoading should hide spinner and enable button", () => {
      const loadingSpinner = document.getElementById("loadingSpinner");
      const submitBtn = document.getElementById("submitBtn");

      window.hideLoading();
      expect(loadingSpinner.style.display).toBe("none");
      expect(submitBtn.disabled).toBe(false);
    });

    test("generateRandomState should return a string", () => {
      const state = window.generateRandomState();
      expect(typeof state).toBe("string");
      expect(state.length).toBeGreaterThan(0);
    });

    test("close button should remove status message when clicked", () => {
      const statusMessagesContainer = document.getElementById("statusMessagesContainer");
      window.showStatus("Test message", "info");

      const statusMessages = statusMessagesContainer.querySelectorAll(".status-message");
      expect(statusMessages.length).toBe(1);

      const closeButton = statusMessages[0].querySelector(".status-close-button");
      expect(closeButton).toBeTruthy();

      // Click the close button
      closeButton.click();

      // Message should be removed
      const remainingMessages = statusMessagesContainer.querySelectorAll(".status-message");
      expect(remainingMessages.length).toBe(0);
    });

    test("close button should work for multiple messages", () => {
      const statusMessagesContainer = document.getElementById("statusMessagesContainer");
      window.showStatus("Message 1", "info");
      window.showStatus("Message 2", "error");
      window.showStatus("Message 3", "success");

      let statusMessages = statusMessagesContainer.querySelectorAll(".status-message");
      expect(statusMessages.length).toBe(3);

      // Click close button on second message
      const secondMessageCloseButton = statusMessages[1].querySelector(".status-close-button");
      secondMessageCloseButton.click();

      // Should have 2 messages remaining
      statusMessages = statusMessagesContainer.querySelectorAll(".status-message");
      expect(statusMessages.length).toBe(2);

      // Verify the correct message was removed (second one)
      const messageContents = Array.from(statusMessages).map((msg) => msg.querySelector(".status-message-content").textContent);
      expect(messageContents).toEqual(["Message 1", "Message 3"]);
    });

    test("removeStatusMessage should safely handle non-existent messages", () => {
      const statusMessagesContainer = document.getElementById("statusMessagesContainer");
      const fakeDiv = document.createElement("div");

      // Should not throw error when trying to remove non-existent message
      expect(() => window.removeStatusMessage(fakeDiv)).not.toThrow();
      expect(() => window.removeStatusMessage(null)).not.toThrow();
      expect(() => window.removeStatusMessage(undefined)).not.toThrow();
    });
  });

  describe("API Functions", () => {
    test("getAuthUrl should make correct API call", async () => {
      const mockResponse = { authUrl: "https://test.com/authUrl" };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await window.getAuthUrl("test-state");

      // New implementation adds a correlation header via fetchWithId
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/hmrc/authUrl?state=test-state",
        expect.objectContaining({ headers: expect.anything() }),
      );
      expect(result).toEqual(mockResponse);
    });

    test("getAuthUrl should throw error on failed response", async () => {
      const mockResponse = { statusText: "Bad Request" };
      fetchMock.mockResolvedValueOnce({
        ok: false,
        statusText: "Bad Request",
        json: () => Promise.resolve(mockResponse),
      });

      await expect(window.getAuthUrl("test-state")).rejects.toThrow(
        'Failed to get auth URL. Remote call failed: GET /api/v1/hmrc/authUrl?state=test-state - Status: undefined Bad Request - Body: {"statusText":"Bad Request"}',
      );
    });

    test("submitVat should make correct API call", async () => {
      const headers = buildGovClientTestHeaders();

      const mockResponse = {
        formBundleNumber: "123456789012",
        chargeRefNumber: "XM002610011594",
        processingDate: "2023-01-01T12:00:00.000Z",
      };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await window.submitVat("111222333", "24A1", "1000.00", "test-token", headers);

      expect(fetchMock).toHaveBeenCalledWith("/api/v1/hmrc/vat/return", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          vatNumber: "111222333",
          periodKey: "24A1",
          vatDue: "1000.00",
          accessToken: "test-token",
        }),
      });
      expect(result).toEqual(mockResponse);
    });

    test("logReceipt should make correct API call", async () => {
      const mockResponse = { status: "receipt logged" };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await window.logReceipt("2023-01-01T12:00:00.000Z", "123456789012", "XM002610011594");

      expect(fetchMock).toHaveBeenCalledWith("/api/v1/hmrc/receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          processingDate: "2023-01-01T12:00:00.000Z",
          formBundleNumber: "123456789012",
          chargeRefNumber: "XM002610011594",
        }),
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe("Form Validation", () => {
    test("form validation should reject empty VAT number", async () => {
      const form = document.getElementById("vatSubmissionForm");
      const vatNumberInput = document.getElementById("vatNumber");
      const periodKeyInput = document.getElementById("periodKey");
      const vatDueInput = document.getElementById("vatDue");

      vatNumberInput.value = "";
      periodKeyInput.value = "24A1";
      vatDueInput.value = "1000.00";

      window.showStatus = vi.fn();
      window.showLoading = vi.fn();

      const event = new window.Event("submit");
      event.preventDefault = vi.fn();

      await window.handleFormSubmission(event);

      expect(window.showStatus).toHaveBeenCalledWith("Please fill in all required fields.", "error");
    });

    test("form validation should reject invalid VAT number format", async () => {
      const vatNumberInput = document.getElementById("vatNumber");
      const periodKeyInput = document.getElementById("periodKey");
      const vatDueInput = document.getElementById("vatDue");

      vatNumberInput.value = "12345678"; // Only 8 digits
      periodKeyInput.value = "24A1";
      vatDueInput.value = "1000.00";

      window.showStatus = vi.fn();

      const event = new window.Event("submit");
      event.preventDefault = vi.fn();

      await window.handleFormSubmission(event);

      expect(window.showStatus).toHaveBeenCalledWith("VAT number must be exactly 9 digits.", "error");
    });

    test("form validation should reject negative VAT due", async () => {
      const vatNumberInput = document.getElementById("vatNumber");
      const periodKeyInput = document.getElementById("periodKey");
      const vatDueInput = document.getElementById("vatDue");

      vatNumberInput.value = "111222333";
      periodKeyInput.value = "24A1";
      vatDueInput.value = "-100.00";

      window.showStatus = vi.fn();

      const event = new window.Event("submit");
      event.preventDefault = vi.fn();

      await window.handleFormSubmission(event);

      expect(window.showStatus).toHaveBeenCalledWith("VAT due cannot be negative.", "error");
    });
  });

  describe("Receipt Display", () => {
    test("displayReceipt should show receipt and hide form", () => {
      const response = {
        processingDate: "2023-01-01T12:00:00.000Z",
        formBundleNumber: "123456789012",
        chargeRefNumber: "XM002610011594",
      };

      const vatFormContainer = document.getElementById("vatForm");
      const receiptDisplay = document.getElementById("receiptDisplay");

      window.displayReceipt(response);

      expect(vatFormContainer.style.display).toBe("none");
      expect(receiptDisplay.style.display).toBe("block");
      expect(document.getElementById("formBundleNumber").textContent).toBe("123456789012");
      expect(document.getElementById("chargeRefNumber").textContent).toBe("XM002610011594");
    });
  });

  describe("Input Event Handlers", () => {
    test("VAT number input should only allow digits", () => {
      const vatNumberInput = document.getElementById("vatNumber");

      // Simulate input event with non-digit characters
      vatNumberInput.value = "abc123def456";
      const event = new window.Event("input");
      Object.defineProperty(event, "target", { value: vatNumberInput });

      // Trigger the input event handler
      vatNumberInput.dispatchEvent(event);

      // The event handler should remove non-digits
      expect(vatNumberInput.value).toBe("123456");
    });

    test("Period key input should convert to uppercase", () => {
      const periodKeyInput = document.getElementById("periodKey");

      // Simulate input event with lowercase
      periodKeyInput.value = "a1b2";
      const event = new window.Event("input");
      Object.defineProperty(event, "target", { value: periodKeyInput });

      // Trigger the input event handler
      periodKeyInput.dispatchEvent(event);

      // The event handler should convert to uppercase
      expect(periodKeyInput.value).toBe("A1B2");
    });
  });
});
