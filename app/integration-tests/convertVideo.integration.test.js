// app/unit-tests/convertVideo.integration.test.js

import { describe, test, expect, vi } from "vitest";
import { spawn } from "child_process";

// Mock child_process spawn
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises access
vi.mock("fs/promises", () => ({
  access: vi.fn().mockResolvedValue(undefined),
  constants: { F_OK: 0 },
}));

// Import the function under test from the new wrapper script
import { convertVideo } from "../../scripts/convert-video.js";

describe("convertVideo", () => {
  test("invokes system ffmpeg with correct options", async () => {
    const mockProcess = {
      stderr: { on: vi.fn() },
      on: vi.fn((event, callback) => {
        if (event === "close") {
          // Simulate successful completion
          callback(0);
        }
      }),
    };

    spawn.mockReturnValue(mockProcess);

    await convertVideo("input.webm", "output.mp4");

    // Verify that spawn was called with ffmpeg and correct arguments
    expect(spawn).toHaveBeenCalledWith("ffmpeg", [
      "-i", "input.webm",
      "-c:v", "libx264",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      "-profile:v", "baseline",
      "-level", "3.1",
      "-movflags", "+faststart",
      "-crf", "22",
      "-preset", "slow",
      "-y",
      "output.mp4"
    ], {
      stdio: ["ignore", "pipe", "pipe"]
    });
  });
});
