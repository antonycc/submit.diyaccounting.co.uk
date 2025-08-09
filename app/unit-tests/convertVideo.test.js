// app/unit-tests/convertVideo.test.js

import { describe, test, expect, vi } from 'vitest';

// Mock fluent-ffmpeg
vi.mock('fluent-ffmpeg', () => {
  // Create a mock chain object returned by ffmpeg() calls
  const chain = {
    videoCodec: vi.fn().mockReturnThis(),
    audioCodec: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    on: vi.fn().mockImplementation(function (event, cb) {
      if (event === 'end') {
        // Immediately call end handler to simulate success
        cb();
      }
      return this;
    }),
    save: vi.fn().mockReturnThis(),
  };

  // The default export is a function that returns the chain
  const ffmpegFn = vi.fn(() => chain);
  // Add the static methods used by the converter
  ffmpegFn.setFfmpegPath = vi.fn();
  ffmpegFn.setFfprobePath = vi.fn();

  return { default: ffmpegFn };
});

// Mock ffmpeg-static to return a default export (any string is fine)
vi.mock('ffmpeg-static', () => ({
  default: '/usr/bin/ffmpeg',
}));

// Mock ffprobe installer to provide a default export with a path property
vi.mock('@ffprobe-installer/ffprobe', () => ({
  default: { path: '/usr/bin/ffprobe' },
}));

// Import the function under test from your renamed file
import { convertVideo } from '@app/bin/convert.js';

describe('convertVideo', () => {
  test('invokes fluent-ffmpeg with correct options', async () => {
    const ffmpeg = (await import('fluent-ffmpeg')).default;

    await convertVideo('app/unit-tests/input.webm', 'target/output.mp4');

    // Verify that ffmpeg() was called with the input file
    expect(ffmpeg).toHaveBeenCalledWith('app/unit-tests/input.webm');

    // Inspect the chain methods
    const chain = ffmpeg.mock.results[0].value;
    expect(chain.videoCodec).toHaveBeenCalledWith('libx264');
    expect(chain.audioCodec).toHaveBeenCalledWith('aac');
    expect(chain.outputOptions).toHaveBeenCalledWith(
      expect.arrayContaining(['-pix_fmt yuv420p'])
    );
    expect(chain.save).toHaveBeenCalledWith('target/output.mp4');

    // Ensure the static methods were invoked at least once
    expect(ffmpeg.setFfmpegPath).toHaveBeenCalled();
    expect(ffmpeg.setFfprobePath).toHaveBeenCalled();
  });
});
