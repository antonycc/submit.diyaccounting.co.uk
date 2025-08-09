#!/usr/bin/env node
// app/bin/convert.js

import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobe from "@ffprobe-installer/ffprobe";

/**
 * Convert a WebM/Playwright video to an H.264/AAC MP4 for maximum portability.
 *
 * @param {string} inputPath Absolute or project‑relative path to the source file.
 * @param {string} outputPath Absolute or project‑relative destination path.
 * @returns {Promise<void>} Resolves when conversion finishes, rejects on error.
 */
export function convertVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    // Use static ffmpeg and ffprobe binaries
    ffmpeg.setFfmpegPath(ffmpegStatic);
    ffmpeg.setFfprobePath(ffprobe.path);

    ffmpeg(inputPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-pix_fmt yuv420p",
        "-profile:v baseline",
        "-level 3.1",
        "-movflags +faststart",
        "-crf 22",
        "-preset slow",
      ])
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

// CLI usage: node convert.js --in <input> --out <output>
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const inIdx = args.indexOf("--in");
  const outIdx = args.indexOf("--out");
  if (inIdx === -1 || outIdx === -1 || !args[inIdx + 1] || !args[outIdx + 1]) {
    console.error("Usage: convert.js --in <input> --out <output>");
    process.exit(1);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const inputFile = path.resolve(__dirname, "../../", args[inIdx + 1]);
  const outputFile = path.resolve(__dirname, "../../", args[outIdx + 1]);

  convertVideo(inputFile, outputFile)
    .then(() => {
      console.log(`Converted ${inputFile} → ${outputFile}`);
    })
    .catch((err) => {
      console.error("Conversion failed:", err);
      process.exit(1);
    });
}
