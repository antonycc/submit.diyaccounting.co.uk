// playwright.config.js
import { defineConfig } from "@playwright/test";

export default defineConfig({
  projects: [
    {
      name: "allBehaviour",
      testDir: "behaviour-tests",
      // testMatch: ["**/submitVat.behaviour.test.js", "**/bundles.behaviour.test.js"],
      testMatch: [
        "**/auth.behaviour.test.js",
        "**/bundles.behaviour.test.js",
        "**/compliance.behaviour.test.js",
        "**/submitVat.behaviour.test.js",
        "**/postVatReturn.behaviour.test.js",
        "**/getVatReturn.behaviour.test.js",
        "**/postVatReturnFraudPreventionHeaders.behaviour.test.js",
        "**/getVatObligations.behaviour.test.js",
      ],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "authBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/auth.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "bundleBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/bundles.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "submitVatBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/submitVat.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "postVatReturnFraudPreventionHeadersBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/postVatReturnFraudPreventionHeaders.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "getVatObligationsBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/getVatObligations.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "postVatReturnBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/postVatReturn.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "getVatReturnBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/getVatReturn.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "complianceBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/compliance.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "helpBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/help.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "vatValidationBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/vatValidation.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "vatSchemesBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/vatSchemes.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
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
      size: { width: 1280, height: 1446 }, // (optional)
      // Playwright always uses .webm for video
    },
    // Match viewport to video size so screenshots and recordings align
    viewport: { width: 1280, height: 1446 },
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
    ["./scripts/playwright-video-reporter.js", { verbose: false }],
  ],

  // Optional: customize test timeout or other settings here
  timeout: 120_000,
});
