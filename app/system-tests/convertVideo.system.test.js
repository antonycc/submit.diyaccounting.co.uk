// app/system-tests/convertVideo.system.test.js

import { describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { existsSync, unlinkSync, copyFileSync, mkdirSync } from "node:fs";

// Use a local copy of the sample video in the system test directory.
// Make sure this file exists; you can copy your test video into place before running the test.
const input = "app/system-tests/video.webm";
const output = "target/system-test-output.mp4";

describe("System test: convert video", () => {
  test("converts a .webm to .mp4 using the parameterised npm script", async () => {
    // Ensure the output directory exists
    mkdirSync("target", { recursive: true });
    // Remove any existing output file so we start clean
    if (existsSync(output)) unlinkSync(output);

    // If the input file doesn’t exist yet (e.g. first run), copy it from your test fixture.
    // Replace the source path below with wherever you store your sample `.webm`.
    if (!existsSync(input)) {
      copyFileSync("target/behaviour-test-results/video.webm", input);
    }

    // Run the parameterised convert script. The arguments after "--"
    // are forwarded to your script via npm.
    await new Promise((resolve, reject) => {
      execFile(
        "npm",
        ["run", "convert:video", "--", "--in", input, "--out", output],
        { env: { ...process.env } },
        (err, stdout, stderr) => {
          if (err) {
            console.error(stderr);
            return reject(err);
          }
          resolve(stdout);
        },
      );
    });

    // Verify the MP4 was created
    expect(existsSync(output)).toBe(true);
  }, 20_000);
});
