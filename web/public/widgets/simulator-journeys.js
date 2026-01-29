// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/public/widgets/simulator-journeys.js
// Guided journey automation for simulator iframe - like Playwright running in the browser

/**
 * SimulatorJourney class - automates click-through demos inside the simulator iframe
 */
export class SimulatorJourney {
  constructor(iframe, statusEl) {
    this.iframe = iframe;
    this.statusEl = statusEl;
    this.currentStep = 0;
    this.totalSteps = 0;
    this.paused = false;
    this.aborted = false;

    // Try to access iframe document (may fail for cross-origin)
    try {
      this.doc = iframe.contentDocument || iframe.contentWindow.document;
    } catch (e) {
      console.warn("Cannot access iframe document (cross-origin). Using postMessage instead.");
      this.doc = null;
    }
  }

  /**
   * Get the iframe document, handling cross-origin restrictions
   */
  getDocument() {
    try {
      return this.iframe.contentDocument || this.iframe.contentWindow.document;
    } catch (e) {
      return null;
    }
  }

  /**
   * Find an element by CSS selector matching text content
   */
  findByText(selector, text) {
    const doc = this.getDocument();
    if (!doc) return null;
    for (const el of doc.querySelectorAll(selector)) {
      if (el.textContent.trim().includes(text)) return el;
    }
    return null;
  }

  /**
   * Highlight an element in the iframe
   */
  async highlight(selector) {
    const doc = this.getDocument();
    if (!doc) return null;

    const el = doc.querySelector(selector);
    if (!el) {
      console.warn(`Element not found: ${selector}`);
      return null;
    }

    el.classList.add("simulator-highlight");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return el;
  }

  /**
   * Remove highlight from an element
   */
  unhighlight(selector) {
    const doc = this.getDocument();
    if (!doc) return;

    const el = doc.querySelector(selector);
    if (el) {
      el.classList.remove("simulator-highlight");
    }
  }

  /**
   * Click an element with visual feedback
   */
  async click(selector, description) {
    this.updateStatus(description);
    const el = await this.highlight(selector);
    await this.wait(800);

    if (el) {
      el.click();
      el.classList.remove("simulator-highlight");
    }

    await this.waitForLoad();
  }

  /**
   * Click an element matched by text content with visual feedback
   */
  async clickByText(selector, text, description) {
    this.updateStatus(description);
    const el = this.findByText(selector, text);

    if (el) {
      el.classList.add("simulator-highlight");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.wait(800);
      el.click();
      el.classList.remove("simulator-highlight");
    } else {
      console.warn(`Element not found by text: ${selector} containing "${text}"`);
      await this.wait(800);
    }

    await this.waitForLoad();
  }

  /**
   * Fill a form field with typewriter effect (or direct set for date/number inputs)
   */
  async fill(selector, value, description) {
    this.updateStatus(description);
    const el = await this.highlight(selector);
    await this.wait(500);

    if (el) {
      el.focus();

      // Date and number inputs don't support character-by-character entry;
      // set value directly and dispatch change event
      if (el.type === "date" || el.type === "number" || el.type === "datetime-local") {
        el.value = String(value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        el.value = "";
        // Typewriter effect for text inputs
        for (const char of String(value)) {
          if (this.aborted) throw new Error("Journey aborted");
          while (this.paused) {
            await new Promise((r) => setTimeout(r, 100));
          }

          el.value += char;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 50)); // 50ms per character
        }
      }

      el.classList.remove("simulator-highlight");
    }
  }

  /**
   * Select an option from a dropdown
   */
  async select(selector, value, description) {
    this.updateStatus(description);
    const el = await this.highlight(selector);
    await this.wait(500);

    if (el) {
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.classList.remove("simulator-highlight");
    }

    await this.wait(300);
  }

  /**
   * Wait with pause/abort support
   */
  async wait(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (this.aborted) throw new Error("Journey aborted");
      while (this.paused && !this.aborted) {
        await new Promise((r) => setTimeout(r, 100));
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /**
   * Wait for page/navigation to complete
   */
  async waitForLoad() {
    await this.wait(1500);
  }

  /**
   * Update the status display
   */
  updateStatus(message) {
    this.currentStep++;
    if (this.statusEl) {
      this.statusEl.textContent = `Step ${this.currentStep} of ${this.totalSteps}: ${message}`;
    }
  }

  /**
   * Set the total number of steps for progress display
   */
  setTotalSteps(count) {
    this.totalSteps = count;
  }

  /**
   * Scroll to the bottom of the iframe document to show results
   */
  scrollToResults() {
    const doc = this.getDocument();
    if (!doc) return;
    const body = doc.body || doc.documentElement;
    if (body) {
      body.scrollTop = body.scrollHeight;
      doc.documentElement.scrollTop = doc.documentElement.scrollHeight;
    }
  }

  /**
   * Complete the journey
   */
  complete(message) {
    if (this.statusEl) {
      this.statusEl.textContent = message || "Journey complete!";
    }
  }
}

/**
 * Ensure the test bundle is available before proceeding with a journey.
 * Navigates to the bundles page, requests the test bundle if not already added,
 * then navigates back to the activities page.
 */
async function ensureTestBundle(journey) {
  // Navigate to bundles page via nav link
  await journey.clickByText("a", "Bundles", "Navigating to Bundles page...");

  // Wait for bundles page to load (fetches catalog and user bundles from API)
  await journey.wait(3000);

  // Check if test bundle button exists and whether it's already added
  const doc = journey.getDocument();
  const testBtn = doc ? doc.querySelector('button[data-bundle-id="test"]') : null;
  if (testBtn && !testBtn.disabled) {
    // Test bundle not yet added - click to request it
    await journey.click('button[data-bundle-id="test"]', "Requesting Test bundle...");
    // Wait for the bundle request to complete
    await journey.wait(2000);
  } else {
    // Bundle already added or button not found - log and continue
    journey.updateStatus("Test bundle already added");
    await journey.wait(500);
  }

  // Navigate back to activities page
  await journey.clickByText("a", "Activities", "Returning to Activities page...");

  // Wait for activities page to render dynamic buttons
  await journey.wait(2000);
}

/**
 * Journey: Submit VAT Return
 * Demonstrates the full VAT return submission flow
 */
export async function journeySubmitVat(journey) {
  journey.setTotalSteps(15);

  // Ensure test bundle is available for sandbox API access
  await ensureTestBundle(journey);

  // Navigate to Submit VAT Return page (activity buttons are dynamically rendered)
  await journey.clickByText("button", "Submit VAT", "Selecting Submit VAT Return activity (sandbox)...");

  // Wait for page to load
  await journey.wait(2000);

  // Fill VRN (submitVat uses #vatNumber, not #vrn)
  await journey.fill("#vatNumber", "123456789", "Entering VAT Registration Number...");

  // Fill period dates
  await journey.fill("#periodStart", "2017-01-01", "Entering period start date...");
  await journey.fill("#periodEnd", "2017-03-31", "Entering period end date...");

  // Fill Box 1 - VAT due on sales
  await journey.fill("#vatDueSales", "1250.00", "Entering VAT due on sales (Box 1)...");

  // Fill Box 2 - VAT due on acquisitions
  await journey.fill("#vatDueAcquisitions", "0.00", "Entering VAT due on acquisitions (Box 2)...");

  // Fill Box 4 - VAT reclaimed
  await journey.fill("#vatReclaimedCurrPeriod", "350.00", "Entering VAT reclaimed (Box 4)...");

  // Fill Box 6 - Total sales ex VAT
  await journey.fill("#totalValueSalesExVAT", "6250", "Entering total sales excluding VAT (Box 6)...");

  // Fill Box 7 - Total purchases ex VAT
  await journey.fill("#totalValuePurchasesExVAT", "1750", "Entering total purchases excluding VAT (Box 7)...");

  // Fill Box 8 - Goods supplied to EU
  await journey.fill("#totalValueGoodsSuppliedExVAT", "0", "Entering goods supplied to EU (Box 8)...");

  // Fill Box 9 - Acquisitions from EU
  await journey.fill("#totalAcquisitionsExVAT", "0", "Entering acquisitions from EU (Box 9)...");

  // Check declaration
  const doc = journey.getDocument();
  if (doc) {
    const declaration = doc.querySelector("#declaration");
    if (declaration) declaration.checked = true;
  }

  // Submit the return
  await journey.click("#submitBtn", "Submitting VAT return to HMRC...");

  // Wait for submission response
  await journey.wait(3000);

  // Scroll to show the receipt
  journey.scrollToResults();

  journey.complete("VAT return submitted successfully! Receipt is displayed above.");
}

/**
 * Journey: View VAT Obligations
 * Demonstrates viewing VAT obligations from HMRC
 */
export async function journeyViewObligations(journey) {
  journey.setTotalSteps(6);

  // Ensure test bundle is available for sandbox API access
  await ensureTestBundle(journey);

  // Navigate to Obligations page (activity buttons are dynamically rendered)
  await journey.clickByText("button", "Obligations", "Selecting View Obligations activity (sandbox)...");

  // Wait for page to load
  await journey.wait(2000);

  // Fill VRN
  await journey.fill("#vrn", "123456789", "Entering VAT Registration Number...");

  // Click retrieve button
  await journey.click("#retrieveBtn", "Fetching obligations from HMRC...");

  // Wait for results
  await journey.wait(2500);

  // Scroll down to show the results
  journey.scrollToResults();

  journey.complete("Obligations fetched! You can see which periods need VAT returns and their due dates.");
}

/**
 * Journey: View Submitted VAT Return
 * Demonstrates retrieving a previously submitted VAT return
 */
export async function journeyViewReturn(journey) {
  journey.setTotalSteps(8);

  // Ensure test bundle is available for sandbox API access
  await ensureTestBundle(journey);

  // Navigate to View Return page (activity buttons are dynamically rendered)
  await journey.clickByText("button", "View VAT Return", "Selecting View VAT Return activity (sandbox)...");

  // Wait for page to load
  await journey.wait(2000);

  // Fill VRN
  await journey.fill("#vrn", "123456789", "Entering VAT Registration Number...");

  // Fill period dates (viewVatReturn now uses date inputs, not periodKey dropdown)
  await journey.fill("#periodStart", "2017-01-01", "Entering period start date...");
  await journey.fill("#periodEnd", "2017-03-31", "Entering period end date...");

  // Click retrieve button
  await journey.click("#retrieveBtn", "Fetching VAT return from HMRC...");

  // Wait for results
  await journey.wait(2500);

  // Scroll to show the return details
  journey.scrollToResults();

  journey.complete("VAT return details retrieved! All 9 boxes are displayed as recorded by HMRC.");
}

// Export for use in simulator.html
export default {
  SimulatorJourney,
  journeySubmitVat,
  journeyViewObligations,
  journeyViewReturn,
};
