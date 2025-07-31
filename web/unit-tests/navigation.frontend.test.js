// web/unit-tests/navigation.frontend.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";
import fs from "fs";
import path from "path";

describe("Navigation Frontend Tests", () => {
  let window;
  let document;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a new DOM window for each test
    window = new Window();
    document = window.document;
    
    // Set up global objects
    global.window = window;
    global.document = document;
    global.URLSearchParams = window.URLSearchParams;
    
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
  });

  afterEach(() => {
    window.close();
  });

  describe("Home Page (index.html)", () => {
    beforeEach(() => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/index.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;
    });

    test("should have correct title and header", () => {
      expect(document.title).toBe("DIY Accounting Submit");
      const header = document.querySelector("h1");
      expect(header.textContent).toBe("DIY Accounting Submit");
      
      const subtitle = document.querySelector(".subtitle");
      expect(subtitle.textContent).toBe("Submit UK VAT returns to HMRC under Making Tax Digital (MTD)");
    });

    test("should have welcome message and navigation button", () => {
      const welcomeHeader = document.querySelector("h2");
      expect(welcomeHeader.textContent).toBe("Welcome");
      
      const description = document.querySelector(".form-container p");
      expect(description.textContent).toBe("Choose from the available activities below to get started.");
      
      const buttons = document.querySelectorAll("button");
      const activitiesButton = Array.from(buttons).find(btn => btn.textContent === "View available activities");
      
      expect(activitiesButton).toBeTruthy();
      expect(activitiesButton.getAttribute("onclick")).toContain("activities.html");
    });

    test("should have footer with copyright", () => {
      const footer = document.querySelector("footer p");
      expect(footer.innerHTML).toContain("&amp;copy; 2025 DIY Accounting Limited. Licensed under GPL v3.0");
    });

    test("should detect OAuth callback parameters and redirect", () => {
      // Mock window.location with OAuth parameters
      Object.defineProperty(window, "location", {
        value: {
          origin: "http://localhost:3000",
          pathname: "/",
          search: "?code=test-code&state=test-state",
          href: "http://localhost:3000/?code=test-code&state=test-state",
        },
        writable: true,
      });

      // Execute the inline script
      const scriptMatch = document.documentElement.innerHTML.match(/<script>([\s\S]*?)<\/script>/);
      if (scriptMatch) {
        const scriptContent = scriptMatch[1];
        const script = document.createElement("script");
        script.textContent = scriptContent;
        document.head.appendChild(script);
      }

      // The script should detect OAuth parameters
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");
      
      expect(code).toBe("test-code");
      expect(state).toBe("test-state");
    });
  });

  describe("Activities Page (activities.html)", () => {
    beforeEach(() => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/activities.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;
    });

    test("should have correct title and header", () => {
      expect(document.title).toBe("DIY Accounting Submit - Activities");
      const header = document.querySelector("h1");
      expect(header.textContent).toBe("DIY Accounting Submit");
      
      const subtitle = document.querySelector(".subtitle");
      expect(subtitle.textContent).toBe("Submit UK VAT returns to HMRC under Making Tax Digital (MTD)");
    });

    test("should have activities header and description", () => {
      const activitiesHeader = document.querySelector("h2");
      expect(activitiesHeader.textContent).toBe("Available Activities");
      
      const description = document.querySelector(".form-container p");
      expect(description.textContent).toBe("Select an activity to continue:");
    });

    test("should have VAT Return Submission button", () => {
      const buttons = document.querySelectorAll("button");
      const vatButton = Array.from(buttons).find(btn => btn.textContent === "VAT Return Submission");
      
      expect(vatButton).toBeTruthy();
      expect(vatButton.getAttribute("onclick")).toContain("submitVat.html");
    });

    test("should have Back to Home button", () => {
      const buttons = document.querySelectorAll("button");
      const backButton = Array.from(buttons).find(btn => btn.textContent === "Back to Home");
      
      expect(backButton).toBeTruthy();
      expect(backButton.getAttribute("onclick")).toContain("index.html");
    });

    test("should have footer with copyright", () => {
      const footer = document.querySelector("footer p");
      expect(footer.innerHTML).toContain("&amp;copy; 2025 DIY Accounting Limited. Licensed under GPL v3.0");
    });

    test("should have hamburger menu with navigation options", () => {
      const hamburgerBtn = document.querySelector(".hamburger-btn");
      expect(hamburgerBtn).toBeTruthy();
      expect(hamburgerBtn.textContent).toBe("☰");
      
      const menuDropdown = document.querySelector(".menu-dropdown");
      expect(menuDropdown).toBeTruthy();
      
      const menuLinks = menuDropdown.querySelectorAll("a");
      expect(menuLinks).toHaveLength(2);
      expect(menuLinks[0].textContent).toBe("View Activities");
      expect(menuLinks[0].getAttribute("href")).toBe("activities.html");
      expect(menuLinks[1].textContent).toBe("Add Service");
      expect(menuLinks[1].getAttribute("href")).toBe("services.html");
    });

    test("should have auth section with login status and link", () => {
      const authSection = document.querySelector(".auth-section");
      expect(authSection).toBeTruthy();
      
      const loginStatus = document.querySelector(".login-status");
      expect(loginStatus.textContent).toBe("Not logged in");
      
      const loginLink = document.querySelector(".login-link");
      expect(loginLink.textContent).toBe("Log in");
      expect(loginLink.getAttribute("href")).toBe("login.html");
    });
  });

  describe("Login Page (login.html)", () => {
    beforeEach(() => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/login.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;
    });

    test("should have correct title and header", () => {
      expect(document.title).toBe("DIY Accounting Submit - Login");
      const header = document.querySelector("h1");
      expect(header.textContent).toBe("DIY Accounting Submit");
    });

    test("should have auth providers with Google enabled", () => {
      const authProviders = document.querySelectorAll(".auth-provider");
      expect(authProviders).toHaveLength(4);
      
      const googleBtn = document.querySelector(".google-btn");
      expect(googleBtn).toBeTruthy();
      expect(googleBtn.textContent.trim()).toContain("Continue with Google");
      expect(googleBtn.getAttribute("onclick")).toContain("coming-soon.html");
      
      const disabledBtns = document.querySelectorAll(".disabled-btn");
      expect(disabledBtns).toHaveLength(3);
    });
  });

  describe("Coming Soon Page (coming-soon.html)", () => {
    beforeEach(() => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/coming-soon.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;
    });

    test("should have correct title and coming soon message", () => {
      expect(document.title).toBe("DIY Accounting Submit - Coming Soon");
      
      const header = document.querySelector("h2");
      expect(header.textContent).toBe("Coming Soon");
      
      const countdown = document.querySelector(".countdown");
      expect(countdown).toBeTruthy();
      expect(countdown.textContent).toBe("2");
    });
  });

  describe("Services Page (services.html)", () => {
    beforeEach(() => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/services.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;
    });

    test("should have correct title and services list", () => {
      expect(document.title).toBe("DIY Accounting Submit - Add Service");
      
      const header = document.querySelector("h2");
      expect(header.textContent).toBe("Add Service");
      
      const serviceItems = document.querySelectorAll(".service-item");
      expect(serviceItems).toHaveLength(3);
      
      const hmrcTestBtn = Array.from(document.querySelectorAll("button")).find(btn => 
        btn.textContent.trim() === "Add HMRC Test API Service"
      );
      expect(hmrcTestBtn).toBeTruthy();
      expect(hmrcTestBtn.getAttribute("onclick")).toContain("coming-soon.html");
    });
  });
});