#!/usr/bin/env node
// scripts/convert-video.js

import { spawn } from "child_process";
import { access, constants } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Convert a WebM/Playwright video to an H.264/AAC MP4 for maximum portability using system ffmpeg.
 *
 * @param {string} inputPath Absolute or project‑relative path to the source file.
 * @param {string} outputPath Absolute or project‑relative destination path.
 * @returns {Promise<void>} Resolves when conversion finishes, rejects on error.
 */
export async function convertVideo(inputPath, outputPath) {
  // Check if input file exists
  try {
    await access(inputPath, constants.F_OK);
  } catch (error) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  const ffmpegArgs = [
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-movflags",
    "+faststart",
    "-crf",
    "22",
    "-preset",
    "slow",
    "-y", // Overwrite output file if it exists
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}. Error: ${stderr}`));
      }
    });

    ffmpeg.on("error", (error) => {
      reject(new Error(`Failed to start ffmpeg: ${error.message}. Please ensure ffmpeg is installed and available in PATH.`));
    });
  });
}

// CLI usage: node convert-video.js --in <input> --out <output>
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const inIdx = args.indexOf("--in");
  const outIdx = args.indexOf("--out");
  if (inIdx === -1 || outIdx === -1 || !args[inIdx + 1] || !args[outIdx + 1]) {
    console.error("Usage: convert-video.js --in <input> --out <output>");
    process.exit(1);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const inputFile = path.resolve(__dirname, "../", args[inIdx + 1]);
  const outputFile = path.resolve(__dirname, "../", args[outIdx + 1]);

  convertVideo(inputFile, outputFile)
    .then(() => {
      console.log(`Converted ${inputFile} → ${outputFile}`);
    })
    .catch((err) => {
      console.error("Conversion failed:", err.message);
      process.exit(1);
    });
}
