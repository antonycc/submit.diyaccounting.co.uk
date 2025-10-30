// playwright.config.js
import { defineConfig } from "@playwright/test";

export default defineConfig({
  projects: [
    {
      name: "behaviour-tests",
      testDir: "behaviour-tests",
      testMatch: ["**/submitVat.behaviour.test.js", "**/bundles.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 60_000,
    },
    {
      name: "origin-behaviour-tests",
      testDir: "behaviour-tests",
      testMatch: ["**/bundles.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 60_000,
    },
    {
      name: "web-behaviour-tests",
      testDir: "behaviour-tests",
      // testMatch: ["**/*.behaviour.test.js"],
      // testMatch: ["**/submitVat.behaviour.test.js", "**/bundles.behaviour.test.js"],
      testMatch: ["**/submitVat.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 60_000,
    },
    {
      name: "browser-tests",
      testDir: "web/browser-tests",
      workers: 1, // throttle concurrency to 1
      outputDir: "./target/browser-test-results/",
    },
  ],

  // Output directory for all artifacts (screenshots, videos, traces, etc.)
  outputDir: "./target/test-results/",

  // Don't delete the output directory before running tests
  preserveOutput: "always",

  use: {
    // Save a video for every test
    video: {
      mode: "on", // 'on', 'retain-on-failure', or 'off'
      size: { width: 1280, height: 1024 }, // (optional)
      // Playwright always uses .webm for video
    },
    // Screenshot options
    screenshot: "on",
    // Screenshots are png by default, but jpeg is also possible
    // To get jpeg: page.screenshot({ type: 'jpeg' }) in test code

    // Enable detailed logging
    trace: "on", // Enable tracing for detailed debugging
  },

  reporter: [
    [
      "html",
      {
        outputFolder: "target/test-reports/html-report",
        open: "never", // <-- prevent auto-serving and terminal blocking
      },
    ],
    ["list"],
  ],

  // Optional: customize test timeout or other settings here
  timeout: 120_000,
});
