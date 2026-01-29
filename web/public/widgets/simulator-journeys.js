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
   * Fill a form field with typewriter effect
   */
  async fill(selector, value, description) {
    this.updateStatus(description);
    const el = await this.highlight(selector);
    await this.wait(500);

    if (el) {
      el.value = "";
      el.focus();

      // Typewriter effect
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
   * Complete the journey
   */
  complete(message) {
    if (this.statusEl) {
      this.statusEl.textContent = message || "Journey complete!";
    }
  }
}

/**
 * Journey: Submit VAT Return
 * Demonstrates the full VAT return submission flow
 */
export async function journeySubmitVat(journey) {
  journey.setTotalSteps(12);

  // Navigate to Submit VAT Return page
  await journey.click('a[href*="submitVat"], button:has-text("Submit VAT")', "Selecting Submit VAT Return activity...");

  // Wait for page to load
  await journey.wait(2000);

  // Fill VRN
  await journey.fill("#vrn, input[name='vrn']", "123456789", "Entering VAT Registration Number...");

  // Click fetch obligations or similar button if present
  const doc = journey.getDocument();
  if (doc) {
    const fetchBtn = doc.querySelector("#fetchObligationsBtn, button:has-text('Fetch')");
    if (fetchBtn) {
      await journey.click("#fetchObligationsBtn, button:has-text('Fetch')", "Fetching VAT obligations...");
      await journey.wait(2000);
    }
  }

  // Fill Box 1 - VAT due on sales
  await journey.fill("#vatDueSales, input[name='vatDueSales']", "1250.00", "Entering VAT due on sales (Box 1)...");

  // Fill Box 2 - VAT due on acquisitions
  await journey.fill("#vatDueAcquisitions, input[name='vatDueAcquisitions']", "0.00", "Entering VAT due on acquisitions (Box 2)...");

  // Fill Box 4 - VAT reclaimed
  await journey.fill("#vatReclaimedCurrPeriod, input[name='vatReclaimedCurrPeriod']", "350.00", "Entering VAT reclaimed (Box 4)...");

  // Fill Box 6 - Total sales ex VAT
  await journey.fill("#totalValueSalesExVAT, input[name='totalValueSalesExVAT']", "6250", "Entering total sales excluding VAT (Box 6)...");

  // Fill Box 7 - Total purchases ex VAT
  await journey.fill(
    "#totalValuePurchasesExVAT, input[name='totalValuePurchasesExVAT']",
    "1750",
    "Entering total purchases excluding VAT (Box 7)...",
  );

  // Fill Box 8 - Goods supplied to EU
  await journey.fill(
    "#totalValueGoodsSuppliedExVAT, input[name='totalValueGoodsSuppliedExVAT']",
    "0",
    "Entering goods supplied to EU (Box 8)...",
  );

  // Fill Box 9 - Acquisitions from EU
  await journey.fill("#totalAcquisitionsExVAT, input[name='totalAcquisitionsExVAT']", "0", "Entering acquisitions from EU (Box 9)...");

  // Submit the return
  await journey.click(
    "#submitVatBtn, button[type='submit']:has-text('Submit'), .btn:has-text('Submit')",
    "Submitting VAT return to HMRC...",
  );

  // Wait for submission response
  await journey.wait(3000);

  journey.complete("VAT return submitted successfully! Receipt is displayed above.");
}

/**
 * Journey: View VAT Obligations
 * Demonstrates viewing VAT obligations from HMRC
 */
export async function journeyViewObligations(journey) {
  journey.setTotalSteps(4);

  // Navigate to Obligations page
  await journey.click('a[href*="vatObligations"], button:has-text("Obligations")', "Selecting View Obligations activity...");

  // Wait for page to load
  await journey.wait(2000);

  // Fill VRN
  await journey.fill("#vrn, input[name='vrn']", "123456789", "Entering VAT Registration Number...");

  // Click fetch button
  await journey.click("#fetchObligationsBtn, button:has-text('Fetch'), .btn:has-text('Fetch')", "Fetching obligations from HMRC...");

  // Wait for results
  await journey.wait(2500);

  journey.complete("Obligations fetched! You can see which periods need VAT returns and their due dates.");
}

/**
 * Journey: View Submitted VAT Return
 * Demonstrates retrieving a previously submitted VAT return
 */
export async function journeyViewReturn(journey) {
  journey.setTotalSteps(5);

  // Navigate to View Return page
  await journey.click('a[href*="viewVatReturn"], button:has-text("View Return")', "Selecting View VAT Return activity...");

  // Wait for page to load
  await journey.wait(2000);

  // Fill VRN
  await journey.fill("#vrn, input[name='vrn']", "123456789", "Entering VAT Registration Number...");

  // Fill period key
  await journey.fill("#periodKey, input[name='periodKey']", "24A1", "Entering period key...");

  // Click fetch button
  await journey.click("#fetchReturnBtn, button:has-text('Fetch'), .btn:has-text('Fetch')", "Fetching VAT return from HMRC...");

  // Wait for results
  await journey.wait(2500);

  journey.complete("VAT return details retrieved! All 9 boxes are displayed as recorded by HMRC.");
}

// Export for use in simulator.html
export default {
  SimulatorJourney,
  journeySubmitVat,
  journeyViewObligations,
  journeyViewReturn,
};
