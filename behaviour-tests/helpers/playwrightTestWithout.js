// behaviour-tests/helpers/playwrightTestWithout.js
import { test as base } from "@playwright/test";

export const test = base.extend({
  context: async ({ browser }, use) => {
    const context = await browser.newContext();
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
    await context.close();
  },
});
