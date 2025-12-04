// behaviour-tests/helpers/wiremock-helper.js
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

//
// Dynamically resolve the WireMock standalone JAR in ESM mode
// Works with WireMock 3.x and 4.x (npm directory layout changed)
//
async function resolveWiremockJar() {
  // Resolve the absolute path of wiremock/package.json
  const pkgUrl = await import.meta.resolve("wiremock/package.json");
  const pkgDir = path.dirname(fileURLToPath(pkgUrl));
  const distDir = path.join(pkgDir, "dist");

  let entries;
  try {
    entries = await fs.readdir(distDir);
  } catch (err) {
    throw new Error(`WireMock: cannot read dist directory at ${distDir} — ${err.message}`);
  }

  // Filename examples:
  //   wiremock-standalone-3.5.4.jar
  //   wiremock-standalone.jar
  const jarFile = entries.find((f) => f.startsWith("wiremock-standalone") && f.endsWith(".jar"));

  if (!jarFile) {
    throw new Error(`WireMock standalone JAR not found in ${distDir}. Found: ${entries.join(", ")}`);
  }

  return path.join(distDir, jarFile);
}

//
// Wait for WireMock to become ready
//
async function waitForWiremockReady(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
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

  const args = ["-jar", jar, "--port", `${port}`, "--disable-banner"];
  if (outputDir) args.push("--root-dir", outputDir);

  wiremockProcess = spawn("java", args, {
    stdio: "inherit",
  });

  await waitForWiremockReady(port);

  if (mode === "record") {
    // Create proxy stubs so WireMock forwards unmatched requests to the live HMRC endpoints
    for (const base of targets) {
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
    await fetch(`http://localhost:${port}/__admin/recordings/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  }
}

//
// Stop WireMock and persist recordings
//
export async function stopWiremock({ mode = "record", port = 9090 } = {}) {
  if (!wiremockProcess) return;

  if (mode === "record") {
    await fetch(`http://localhost:${port}/__admin/recordings/stop`, {
      method: "POST",
    });
    await fetch(`http://localhost:${port}/__admin/recordings/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persist: true }),
    });
  }

  wiremockProcess.kill("SIGTERM");
  wiremockProcess = null;
}
