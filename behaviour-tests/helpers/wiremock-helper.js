// behaviour-tests/helpers/wiremock-helper.js
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { createLogger } from "@app/lib/logger.js";

const logger = createLogger({ source: "behaviour-tests/helpers/wiremock-helpers.js" });

//
// Dynamically resolve the WireMock standalone JAR in ESM mode
// Supports both WireMock npm layouts:
//  - v3.x: JAR inside "build/"
//  - v4.x: JAR inside "dist/"
//
async function resolveWiremockJar() {
  // Resolve the absolute path of wiremock/package.json
  const pkgUrl = await import.meta.resolve("wiremock/package.json");
  const pkgDir = path.dirname(fileURLToPath(pkgUrl));

  // Candidate subdirectories where the JAR may live
  const candidates = ["dist", "build"]; // order matters: prefer dist if present

  // Try each candidate directory and find a jar
  for (const sub of candidates) {
    const dirPath = path.join(pkgDir, sub);
    let entries;
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) continue;
      entries = await fs.readdir(dirPath);
    } catch (_) {
      // Directory doesn't exist in this version of the package, try next
      continue;
    }

    // Typical filenames:
    //   wiremock-standalone-3.5.4.jar (v3)
    //   wiremock-standalone.jar       (v4)
    const jarFile = entries.find((f) => f.endsWith(".jar") && (f.startsWith("wiremock-standalone") || f.includes("wiremock")));
    if (jarFile) {
      return path.join(dirPath, jarFile);
    }
  }

  // Fallback: try to locate any jar in the package root (unexpected, but safer error message)
  try {
    const rootEntries = await fs.readdir(pkgDir);
    const anyJar = rootEntries.find((f) => f.endsWith(".jar"));
    if (anyJar) return path.join(pkgDir, anyJar);
  } catch (_) {}

  throw new Error(`WireMock standalone JAR not found. Checked: ${candidates.map((c) => path.join(pkgDir, c)).join(", ")}`);
}

//
// Wait for WireMock to become ready
//
async function waitForWiremockReady(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      logger.debug(`Checking if WireMock is ready on port ${port}...`);
      const r = await fetch(`http://localhost:${port}/__admin/mappings`);
      if (r.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`WireMock did not start within ${timeoutMs}ms`);
}

let wiremockProcess = null;

//
// Start WireMock in record | mock | off mode
//
export async function startWiremock({ mode = "record", port = 9090, outputDir, targets = [] } = {}) {
  if (mode === "off") return;

  const jar = await resolveWiremockJar();
  logger.info(`Starting WireMock in ${mode} mode on port ${port} using JAR: ${jar}`);

  const args = ["-jar", jar, "--port", `${port}`, "--verbose", "--preserve-host-header"];
  if (outputDir) {
    args.push("--root-dir", outputDir);
    logger.info(`Using WireMock root directory: ${outputDir}`);
  }

  wiremockProcess = spawn("java", args, {
    stdio: "inherit",
  });

  logger.info("Waiting for WireMock to become ready...");
  await waitForWiremockReady(port);
  logger.info(`WireMock is ready on port ${port}`);

  if (mode === "record") {
    logger.info(`Configuring WireMock to record and proxy to targets: ${targets.join(", ")}`);
    // Create proxy stubs so WireMock forwards unmatched requests to the live HMRC endpoints
    for (const base of targets) {
      logger.info(`Setting up proxy to: ${base}`);
      await fetch(`http://localhost:${port}/__admin/mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: { method: "ANY", urlPattern: ".*" },
          response: { proxyBaseUrl: base },
        }),
      });
    }

    // Start recording
    logger.info("Starting WireMock recording...");
    await fetch(`http://localhost:${port}/__admin/recordings/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    logger.info(`WireMock started in record mode, recording to directory: ${outputDir}`);
  } else {
    logger.info(`WireMock started in mock mode, serving from directory: ${outputDir}`);
  }
}

//
// Stop WireMock and persist recordings
//
export async function stopWiremock({ mode = "record", port = 9090 } = {}) {
  if (!wiremockProcess) return;

  if (mode === "record") {
    logger.info("Stopping WireMock recording and saving snapshot...");
    await fetch(`http://localhost:${port}/__admin/recordings/stop`, {
      method: "POST",
    });
    logger.info("Persisting recorded mappings and files...");
    await fetch(`http://localhost:${port}/__admin/recordings/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persist: true }),
    });
  } else {
    logger.info("WireMock stopping from mock mode...");
  }

  logger.info("Killing WireMock process...");

  wiremockProcess.kill("SIGTERM");
  wiremockProcess = null;
}
