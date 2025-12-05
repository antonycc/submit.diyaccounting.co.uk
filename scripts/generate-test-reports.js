#!/usr/bin/env node

/**
 * Generate test report JSON files from behaviour test results
 *
 * This script:
 * 1. Reads testContext.json files from behaviour test results
 * 2. Reads hmrc-api-requests.jsonl files for API data
 * 3. Generates test-report-<test-name>.json files
 * 4. Generates test-reports-index.txt listing all reports
 *
 * Usage:
 *   node scripts/generate-test-reports.js
 *
 * Reads from: target/behaviour-test-results/
 * Writes to: web/public/tests/
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, "..");
const RESULTS_DIR = path.join(PROJECT_ROOT, "target/behaviour-test-results");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "web/public/tests");

/**
 * Read and parse JSONL file
 */
function readJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.warn(`Failed to parse JSONL line: ${line}`);
        return null;
      }
    })
    .filter((item) => item !== null);
}

/**
 * Find testContext.json in a directory recursively
 */
function findTestContext(dir) {
  if (!fs.existsSync(dir)) {
    return null;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isFile() && entry.name === "testContext.json") {
      return fullPath;
    }

    if (entry.isDirectory()) {
      const found = findTestContext(fullPath);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

/**
 * Find hmrc-api-requests.jsonl in a directory
 */
function findHmrcApiRequests(dir) {
  if (!fs.existsSync(dir)) {
    return null;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isFile() && entry.name === "hmrc-api-requests.jsonl") {
      return fullPath;
    }

    if (entry.isDirectory()) {
      const found = findHmrcApiRequests(fullPath);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

/**
 * Check if playwright report exists and extract test status
 */
function getPlaywrightReportStatus(testName) {
  const reportDir = path.join(PROJECT_ROOT, "target/test-reports", testName, "html-report");
  const indexPath = path.join(reportDir, "index.html");

  if (!fs.existsSync(indexPath)) {
    return { exists: false, status: "unknown" };
  }

  try {
    const html = fs.readFileSync(indexPath, "utf-8");

    // Look for Playwright report status indicators
    // Check for passed tests - be more specific
    const passedMatch = html.match(/(\d+)\s+passed/i);
    const failedMatch = html.match(/(\d+)\s+failed/i);
    const skippedMatch = html.match(/(\d+)\s+skipped/i);

    // If we have failed tests, status is failed
    if (failedMatch && parseInt(failedMatch[1]) > 0) {
      return { exists: true, status: "failed" };
    }

    // If we have passed tests and no failures, status is passed
    if (passedMatch && parseInt(passedMatch[1]) > 0) {
      return { exists: true, status: "passed" };
    }

    // Check for class-based indicators as fallback
    if (html.includes('class="passed"') || html.includes("✓") || html.includes("All tests passed")) {
      if (html.includes('class="failed"') || html.includes("test failed")) {
        return { exists: true, status: "failed" };
      }
      return { exists: true, status: "passed" };
    }

    if (html.includes('class="failed"') || html.includes("test failed")) {
      return { exists: true, status: "failed" };
    }

    // Default to unknown if we can't determine
    return { exists: true, status: "unknown" };
  } catch (e) {
    console.warn(`Failed to read playwright report: ${e.message}`);
    return { exists: false, status: "unknown" };
  }
}

/**
 * Find test source file based on test name
 */
function findTestSourceFile(testName) {
  // Map test names to their source files
  const testFileMap = {
    bundle: "behaviour-tests/bundles.behaviour.test.js",
    obligation: "behaviour-tests/vatObligations.behaviour.test.js",
    "obligation-sandbox": "behaviour-tests/vatObligations.behaviour.test.js",
    "submit-vat": "behaviour-tests/submitVat.behaviour.test.js",
    "submit-vat-sandbox": "behaviour-tests/submitVat.behaviour.test.js",
  };

  const testFile = testFileMap[testName];
  if (!testFile) {
    return null;
  }

  const filePath = path.join(PROJECT_ROOT, testFile);
  if (fs.existsSync(filePath)) {
    try {
      return {
        filename: testFile,
        content: fs.readFileSync(filePath, "utf-8"),
      };
    } catch (e) {
      console.warn(`  ⚠ Failed to read test file: ${e.message}`);
      return null;
    }
  }

  return null;
}

/**
 * Find environment config based on test name
 */
function findEnvConfig(testName) {
  // Determine which environment config file to use
  const envFile = ".env.ci";
  const filePath = path.join(PROJECT_ROOT, envFile);

  if (fs.existsSync(filePath)) {
    try {
      return {
        filename: envFile,
        content: fs.readFileSync(filePath, "utf-8"),
      };
    } catch (e) {
      console.warn(`  ⚠ Failed to read env config: ${e.message}`);
      return null;
    }
  }

  return null;
}

/**
 * Find screenshots and videos for a test
 */
function findTestArtifacts(testName) {
  const artifacts = {
    screenshots: [],
    videos: [],
  };

  // Look in behaviour test results directory
  const testResultsDir = path.join(PROJECT_ROOT, "target/behaviour-test-results", testName);
  if (!fs.existsSync(testResultsDir)) {
    return artifacts;
  }

  // Recursively find screenshots and videos
  function findFiles(dir, relativePath = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        findFiles(fullPath, relPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".png") || entry.name.endsWith(".jpg") || entry.name.endsWith(".jpeg")) {
          artifacts.screenshots.push(relPath);
        } else if (entry.name.endsWith(".webm") || entry.name.endsWith(".mp4")) {
          artifacts.videos.push(relPath);
        }
      }
    }
  }

  try {
    findFiles(testResultsDir);
  } catch (e) {
    console.warn(`  ⚠ Failed to find test artifacts: ${e.message}`);
  }

  return artifacts;
}

/**
 * Generate a test report JSON file
 */
function generateTestReport(testName, testContextPath, hmrcApiRequestsPath) {
  console.log(`Generating report for: ${testName}`);

  // Read testContext.json
  let testContext = {};
  if (testContextPath && fs.existsSync(testContextPath)) {
    try {
      testContext = JSON.parse(fs.readFileSync(testContextPath, "utf-8"));
      console.log(`  ✓ Read testContext from ${testContextPath}`);
    } catch (e) {
      console.warn(`  ⚠ Failed to read testContext: ${e.message}`);
    }
  } else {
    console.log(`  ℹ No testContext found for ${testName}`);
  }

  // Read hmrc-api-requests.jsonl
  let hmrcApiRequests = [];
  if (hmrcApiRequestsPath && fs.existsSync(hmrcApiRequestsPath)) {
    try {
      hmrcApiRequests = readJsonlFile(hmrcApiRequestsPath);
      console.log(`  ✓ Read ${hmrcApiRequests.length} HMRC API requests`);
    } catch (e) {
      console.warn(`  ⚠ Failed to read HMRC API requests: ${e.message}`);
    }
  } else {
    console.log(`  ℹ No HMRC API requests found for ${testName}`);
  }

  // Get playwright report status
  const playwrightReport = getPlaywrightReportStatus(testName);

  // Get test source file
  const testSourceFile = findTestSourceFile(testName);
  if (testSourceFile) {
    console.log(`  ✓ Read test source file: ${testSourceFile.filename}`);
  }

  // Get environment config
  const envConfig = findEnvConfig(testName);
  if (envConfig) {
    console.log(`  ✓ Read environment config: ${envConfig.filename}`);
  }

  // Get test artifacts (screenshots and videos)
  const artifacts = findTestArtifacts(testName);
  if (artifacts.screenshots.length > 0) {
    console.log(`  ✓ Found ${artifacts.screenshots.length} screenshot(s)`);
  }
  if (artifacts.videos.length > 0) {
    console.log(`  ✓ Found ${artifacts.videos.length} video(s)`);
  }

  // Build report object
  const report = {
    testName,
    generatedAt: new Date().toISOString(),
    testContext,
    hmrcApiRequests,
    playwrightReport,
    testSourceFile,
    envConfig,
    artifacts,
  };

  // Write report file
  const reportFileName = `test-report-${testName}.json`;
  const reportPath = path.join(OUTPUT_DIR, reportFileName);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`  ✓ Generated ${reportFileName}`);

  return reportFileName;
}

/**
 * Find test-specific data in behaviour test results
 * Returns both testContext.json and hmrc-api-requests.jsonl for a specific test
 */
function findTestData(testName) {
  // Try to find a directory matching this test name in the behaviour test results
  if (!fs.existsSync(RESULTS_DIR)) {
    return { testContextPath: null, hmrcApiRequestsPath: null };
  }

  // Look for test-specific subdirectory first
  const testSpecificDir = path.join(RESULTS_DIR, testName);
  if (fs.existsSync(testSpecificDir)) {
    const testContextPath = findTestContext(testSpecificDir);
    const hmrcApiRequestsPath = findHmrcApiRequests(testSpecificDir);
    return { testContextPath, hmrcApiRequestsPath };
  }

  // Fallback to searching entire results directory
  const testContextPath = findTestContext(RESULTS_DIR);
  const hmrcApiRequestsPath = findHmrcApiRequests(RESULTS_DIR);

  return { testContextPath, hmrcApiRequestsPath };
}

/**
 * Main execution
 */
function main() {
  console.log("=== Generating Test Reports ===");
  console.log(`Results directory: ${RESULTS_DIR}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log("");

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Find all test reports directories
  const testReportsDir = path.join(PROJECT_ROOT, "target/test-reports");
  if (!fs.existsSync(testReportsDir)) {
    console.warn("⚠ No test reports directory found");
    process.exit(0);
  }

  const reportFiles = [];
  const testDirs = fs
    .readdirSync(testReportsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  console.log(`Found ${testDirs.length} test report directories`);
  console.log("");

  for (const testName of testDirs) {
    if (testName === "html-report") {
      continue; // Skip the combined report directory
    }

    // Find test-specific data
    const { testContextPath, hmrcApiRequestsPath } = findTestData(testName);

    if (!testContextPath && !hmrcApiRequestsPath) {
      console.log(`  ℹ No test data found for ${testName}, creating minimal report`);
      // Still create a report with just the playwright info
      const reportFileName = generateTestReport(testName, null, null);
      reportFiles.push(reportFileName);
      continue;
    }

    // Generate report
    const reportFileName = generateTestReport(testName, testContextPath, hmrcApiRequestsPath);
    reportFiles.push(reportFileName);
  }

  // Generate index file
  if (reportFiles.length > 0) {
    const indexPath = path.join(OUTPUT_DIR, "test-reports-index.txt");
    fs.writeFileSync(indexPath, reportFiles.join("\n") + "\n", "utf-8");
    console.log("");
    console.log(`✓ Generated test-reports-index.txt with ${reportFiles.length} reports`);
  } else {
    console.log("");
    console.log("⚠ No test reports generated");
  }

  console.log("");
  console.log("=== Test Report Generation Complete ===");
}

main();
