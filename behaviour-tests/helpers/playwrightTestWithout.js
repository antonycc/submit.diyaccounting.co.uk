// behaviour-tests/helpers/playwrightTestWithout.js
import { test as base } from "@playwright/test";

export const test = base.extend({
  // Respect project/test use: options by applying contextOptions and explicitly enabling recordVideo
  context: async ({ browser, contextOptions }, use, testInfo) => {
    const recordVideo = { dir: testInfo.outputPath(""), size: { width: 1280, height: 1024 } };
    const context = await browser.newContext({ ...contextOptions, recordVideo });
    await context.route("**/*", (route) => {
      const url = route.request().url();
      // block GA / gtag / GTM endpoints
      if (
        url.startsWith("https://www.google-analytics.com/g/collect") ||
        url.startsWith("https://www.googletagmanager.com/") ||
        url.includes("analytics.js") ||
        url.includes("gtag/js")
      ) {
        return route.abort();
      }
      return route.continue();
    });
    await use(context);
    try {
      await context.close();
    } catch (e) {
      console.warn("Error closing context:", e);
    }
  },
});
