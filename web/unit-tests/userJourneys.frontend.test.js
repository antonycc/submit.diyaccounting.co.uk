// web/unit-tests/userJourneys.frontend.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";
import fs from "fs";
import path from "path";

describe("User Journeys Frontend Tests", () => {
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
    global.fetch = vi.fn();
    
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

  describe("Login Journey", () => {
    test("should navigate from home to login page", () => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/index.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;

      const loginLink = document.querySelector("a.login-link");
      expect(loginLink).toBeTruthy();
      expect(loginLink.textContent).toBe("Log in");
      expect(loginLink.getAttribute("href")).toBe("login.html");
    });

    test("should display authentication providers on login page", () => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/login.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;

      const googleBtn = Array.from(document.querySelectorAll("button")).find(btn => btn.textContent.includes("Continue with Google"));
      expect(googleBtn).toBeTruthy();

      const microsoftBtn = Array.from(document.querySelectorAll("button")).find(btn => btn.textContent.includes("Continue with Microsoft"));
      expect(microsoftBtn).toBeTruthy();
      expect(microsoftBtn.disabled).toBe(true);

      const appleBtn = Array.from(document.querySelectorAll("button")).find(btn => btn.textContent.includes("Continue with Apple"));
      expect(appleBtn).toBeTruthy();
      expect(appleBtn.disabled).toBe(true);

      const facebookBtn = Array.from(document.querySelectorAll("button")).find(btn => btn.textContent.includes("Continue with Facebook"));
      expect(facebookBtn).toBeTruthy();
      expect(facebookBtn.disabled).toBe(true);
    });

    test("should have back to home button on login page", () => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/login.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;

      const backButton = Array.from(document.querySelectorAll("button")).find(btn => btn.textContent.includes("Back to Home"));
      expect(backButton).toBeTruthy();
      expect(backButton.getAttribute("onclick")).toContain("index.html");
    });
  });

  describe("Service Selection Journey", () => {
    test("should navigate to bundles page from hamburger menu", () => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/index.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;

      const hamburgerMenu = document.querySelector(".menu-dropdown");
      expect(hamburgerMenu).toBeTruthy();

      const bundlesLink = hamburgerMenu.querySelector("a[href='bundles.html']");
      expect(bundlesLink).toBeTruthy();
      expect(bundlesLink.textContent).toBe("Add Bundle");
    });

    test("should display service options on bundles page", () => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/bundles.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;

      const pageTitle = document.querySelector("h2");
      expect(pageTitle.textContent).toBe("Add Bundle");

      const hmrcTestBtn = Array.from(document.querySelectorAll("button")).find(btn => btn.textContent.includes("Add HMRC Test API Bundle"));
      expect(hmrcTestBtn).toBeTruthy();
      expect(hmrcTestBtn.disabled).toBe(false);

      const hmrcProdBtn = Array.from(document.querySelectorAll("button")).find(btn => btn.textContent.includes("Add HMRC Production API Bundle"));
      expect(hmrcProdBtn).toBeTruthy();
      expect(hmrcProdBtn.disabled).toBe(true);

      const companiesHouseBtn = Array.from(document.querySelectorAll("button")).find(btn => btn.textContent.includes("Add Companies House API Bundle"));
      expect(companiesHouseBtn).toBeTruthy();
      expect(companiesHouseBtn.disabled).toBe(true);
    });

    test("should have service descriptions on bundles page", () => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/bundles.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;

      const descriptions = document.querySelectorAll(".service-description");
      expect(descriptions.length).toBeGreaterThan(0);

      const hmrcTestDesc = Array.from(descriptions).find(desc => desc.textContent.includes("test environment"));
      expect(hmrcTestDesc).toBeTruthy();

      const hmrcProdDesc = Array.from(descriptions).find(desc => desc.textContent.includes("production environment"));
      expect(hmrcProdDesc).toBeTruthy();

      const companiesHouseDesc = Array.from(descriptions).find(desc => desc.textContent.includes("Companies House"));
      expect(companiesHouseDesc).toBeTruthy();
    });
  });

  describe("Hamburger Menu Navigation Journey", () => {
    test("should have hamburger menu on all pages", () => {
      const pages = ["index.html", "login.html", "bundles.html", "activities.html"];
      
      pages.forEach(page => {
        const htmlContent = fs.readFileSync(path.join(process.cwd(), `web/public/${page}`), "utf-8");
        document.documentElement.innerHTML = htmlContent;

        const hamburgerBtn = document.querySelector(".hamburger-btn");
        expect(hamburgerBtn).toBeTruthy();
        expect(hamburgerBtn.textContent).toBe("☰");

        const menuDropdown = document.querySelector(".menu-dropdown");
        expect(menuDropdown).toBeTruthy();

        const homeLink = menuDropdown.querySelector("a[href='index.html']");
        expect(homeLink).toBeTruthy();
        expect(homeLink.textContent).toBe("Home");

        const activitiesLink = menuDropdown.querySelector("a[href='activities.html']");
        expect(activitiesLink).toBeTruthy();
        expect(activitiesLink.textContent).toBe("View Activities");

        const bundlesLink = menuDropdown.querySelector("a[href='bundles.html']");
        expect(bundlesLink).toBeTruthy();
        expect(bundlesLink.textContent).toBe("Add Bundle");
      });
    });

    test("should have toggle menu function", () => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/index.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;

      // Execute the inline script to get the toggleMenu function
      const scriptMatch = document.documentElement.innerHTML.match(/<script>([\s\S]*?)<\/script>/);
      if (scriptMatch) {
        const scriptContent = scriptMatch[1];
        const script = document.createElement("script");
        script.textContent = scriptContent;
        document.head.appendChild(script);
      }

      const menuDropdown = document.querySelector("#menuDropdown");
      expect(menuDropdown).toBeTruthy();

      // Test that the function exists
      expect(typeof window.toggleMenu).toBe("function");
    });
  });

  describe("Cross-Page Navigation Journey", () => {
    test("should maintain consistent header across all pages", () => {
      const pages = ["index.html", "login.html", "bundles.html", "activities.html"];
      
      pages.forEach(page => {
        const htmlContent = fs.readFileSync(path.join(process.cwd(), `web/public/${page}`), "utf-8");
        document.documentElement.innerHTML = htmlContent;

        const header = document.querySelector("h1");
        expect(header.textContent).toBe("DIY Accounting Submit");

        const subtitle = document.querySelector(".subtitle");
        expect(subtitle.textContent).toBe("Submit UK VAT returns to HMRC under Making Tax Digital (MTD)");
      });
    });

    test("should maintain consistent footer across all pages", () => {
      const pages = ["index.html", "login.html", "bundles.html", "activities.html"];
      
      pages.forEach(page => {
        const htmlContent = fs.readFileSync(path.join(process.cwd(), `web/public/${page}`), "utf-8");
        document.documentElement.innerHTML = htmlContent;

        const footer = document.querySelector("footer p");
        expect(footer.innerHTML).toContain("&amp;copy; 2025 DIY Accounting Limited. Licensed under GPL v3.0");
      });
    });

    test("should have view source link functionality on all pages", () => {
      const pages = ["index.html", "login.html", "bundles.html", "activities.html"];
      
      pages.forEach(page => {
        const htmlContent = fs.readFileSync(path.join(process.cwd(), `web/public/${page}`), "utf-8");
        document.documentElement.innerHTML = htmlContent;

        const viewSourceLink = document.querySelector("#viewSourceLink");
        expect(viewSourceLink).toBeTruthy();
        expect(viewSourceLink.style.display).toBe("none"); // Initially hidden
      });
    });
  });
});