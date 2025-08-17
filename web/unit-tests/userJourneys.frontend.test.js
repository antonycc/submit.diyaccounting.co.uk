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
      expect(loginLink.getAttribute("href")).toBe("./login.html");
    });

    test("should display authentication providers on login page", () => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/login.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;

      const googleBtn = Array.from(document.querySelectorAll("button")).find((btn) =>
        btn.textContent.includes("Continue with Google"),
      );
      expect(googleBtn).toBeTruthy();
    });

    test("should have back to home button on login page", () => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/login.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;

      const backButton = Array.from(document.querySelectorAll("button")).find((btn) =>
        btn.textContent.includes("Back to Home"),
      );
      expect(backButton).toBeTruthy();
      expect(backButton.getAttribute("onclick")).toContain("index.html");
    });
  });

  describe("Service Selection Journey", () => {
    test("should display service options on bundles page", () => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/bundles.html"), "utf-8");
      document.documentElement.innerHTML = htmlContent;

      const pageTitle = document.querySelector("h2");
      expect(pageTitle.textContent).toBe("Add Bundle");
    });
  });

  describe("Cross-Page Navigation Journey", () => {
    test("should maintain consistent header across pages", () => {
      const pages = ["index.html", "login.html", "bundles.html"];

      pages.forEach((page) => {
        const htmlContent = fs.readFileSync(path.join(process.cwd(), `web/public/${page}`), "utf-8");
        document.documentElement.innerHTML = htmlContent;

        const header = document.querySelector("h1");
        expect(header.textContent).toBe("DIY Accounting Submit");

        const subtitle = document.querySelector(".subtitle");
        expect(subtitle.textContent).toBe("Submit UK VAT returns to HMRC under Making Tax Digital (MTD)");
      });
    });

    test("should maintain consistent footer across pages", () => {
      const pages = ["index.html", "login.html", "bundles.html"];

      pages.forEach((page) => {
        const htmlContent = fs.readFileSync(path.join(process.cwd(), `web/public/${page}`), "utf-8");
        document.documentElement.innerHTML = htmlContent;

        const footer = document.querySelector("footer p");
        expect(footer.innerHTML).toContain("&amp;copy; 2025 DIY Accounting Limited");
      });
    });

    test("should have view source link functionality on pages", () => {
      const pages = ["index.html", "login.html", "bundles.html"];

      pages.forEach((page) => {
        const htmlContent = fs.readFileSync(path.join(process.cwd(), `web/public/${page}`), "utf-8");
        document.documentElement.innerHTML = htmlContent;

        const viewSourceLink = document.querySelector("#viewSourceLink");
        expect(viewSourceLink).toBeTruthy();
        expect(viewSourceLink.style.display).toBe("none"); // Initially hidden
      });
    });
  });
});
