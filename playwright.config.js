// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
    // Output directory for all artifacts (screenshots, videos, traces, etc.)
    outputDir: './test-results/',

    // Don't delete the output directory before running tests
    preserveOutput: 'always',

    use: {
        // Save a video for every test
        video: {
            mode: 'on', // 'on', 'retain-on-failure', or 'off'
            size: { width: 1280, height: 720 }, // (optional)
            // Playwright always uses .webm for video
        },
        // Screenshot options
        screenshot: 'on', // or 'only-on-failure', 'off'
        // Screenshots are png by default, but jpeg is also possible
        // To get jpeg: page.screenshot({ type: 'jpeg' }) in test code
    },

    reporter: [['html', { outputFolder: 'test-reports/html-report' }], ['list']],

    // Optional: customize test timeout or other settings here
    timeout: 30 * 1000, // 30 seconds per test
});
