// behaviour-tests/helpers/wiremock-helper.js
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

//
// Resolve path to the wiremock standalone JAR in ESM mode
//

async function resolveWiremockJar() {
  // Resolve the package.json to locate node_modules/wiremock
  const pkg = await import.meta.resolve("package.json");
  const pkgDir = path.dirname(fileURLToPath(pkg));

  const distDir = path.join(pkgDir, "dist");
  const entries = await fs.readdir(distDir);

  // Find the standalone JAR (WireMock changed naming conventions over time)
  const jarFile = entries.find((f) => f.startsWith("wiremock-standalone") && f.endsWith(".jar"));

  if (!jarFile) {
    throw new Error(`Could not find WireMock standalone JAR in ${distDir}. Files: ${entries.join(", ")}`);
  }

  return path.join(distDir, jarFile);
}
async function waitForWiremockReady(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://localhost:${port}/__admin/mappings`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`WireMock did not start within ${timeoutMs}ms`);
}

let wiremockProcess = null;

export async function startWiremock({ mode = "record", port = 9090, outputDir, targets = [] } = {}) {
  if (mode === "off") return;

  const jar = await resolveWiremockJar();

  const args = ["-jar", jar, "--port", String(port), "--disable-banner"];

  if (outputDir) {
    args.push("--root-dir", outputDir);
  }

  wiremockProcess = spawn("java", args, { stdio: "inherit" });

  await waitForWiremockReady(port);

  if (mode === "record") {
    for (const target of targets) {
      await fetch(`http://localhost:${port}/__admin/mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: { method: "ANY", urlPattern: ".*" },
          response: { proxyBaseUrl: target },
        }),
      });
    }

    await fetch(`http://localhost:${port}/__admin/recordings/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function stopWiremock({ mode = "record", port = 9090 } = {}) {
  if (!wiremockProcess) return;

  if (mode === "record") {
    await fetch(`http://localhost:${port}/__admin/recordings/stop`, { method: "POST" });
    await fetch(`http://localhost:${port}/__admin/recordings/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persist: true }),
    });
  }

  wiremockProcess.kill("SIGTERM");
  wiremockProcess = null;
}
