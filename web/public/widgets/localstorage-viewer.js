(function () {
  function createFloppyIconSVG() {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M3 3h14l4 4v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 2v6h14V8.83L15.17 5H5zm0 16h14v-8H5v8zm3-3h8v2H8v-2z" fill="none" stroke="currentColor" stroke-width="2"></path>
      </svg>
    `;
  }

  function prettyValue(value) {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      console.warn("prettyValue: JSON.parse failed", error);
      return value;
    }
  }

  function buildLocalStorageText() {
    const keys = Object.keys(localStorage).sort();
    const lines = [];
    lines.push(`localStorage (${keys.length} keys)`);
    lines.push("");
    for (const k of keys) {
      let v;
      try {
        v = localStorage.getItem(k);
      } catch (e) {
        v = `[unreadable: ${e}]`;
      }
      lines.push(`• ${k}:`);
      lines.push(prettyValue(v));
      lines.push("");
    }
    if (keys.length === 0) {
      lines.push("(empty)");
    }
    return lines.join("\n");
  }

  function ensureModal() {
    let overlay = document.getElementById("lsv-overlay");
    if (overlay) return overlay;

    const modalHTML = `
      <div id="lsv-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: none; z-index: 2000;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); width: min(90vw, 720px); max-height: 80vh; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #eee;">
            <div style="font-weight: bold; color: #2c5aa0;">Stored locally by this browser</div>
            <div>
              <button aria-label="Empty localStorage" title="Delete all local storage" style="margin-left: 12px; background: #fff; border: 1px solid #dc3545; color: #dc3545; font-size: 12px; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Empty</button>
              <button aria-label="Close" style="background: transparent; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>
          </div>
          <div style="padding: 12px 16px; overflow: auto;">
            <pre id="lsv-pre" style="white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.4; background: #f8f9fa; border: 1px solid #eee; border-radius: 6px; padding: 12px;"></pre>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    overlay = document.getElementById("lsv-overlay");

    const closeBtn = overlay.querySelector("[aria-label='Close']");
    const emptyBtn = overlay.querySelector("[aria-label='Empty localStorage']");
    const pre = overlay.querySelector("#lsv-pre");

    function close() {
      overlay.style.display = "none";
    }

    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.style.display !== "none") {
        close();
      }
    });

    emptyBtn.addEventListener("click", () => {
      const proceed = confirm("Delete all local storage for this site? This will log you out.");
      if (!proceed) return;
      try {
        // Preserve RUM consent settings before clearing
        const rumConsent = localStorage.getItem("consent.rum");
        const analyticsConsent = localStorage.getItem("consent.analytics");
        const rumConfig = localStorage.getItem("rum.config");

        localStorage.clear();

        // Restore RUM consent settings
        if (rumConsent !== null) localStorage.setItem("consent.rum", rumConsent);
        if (analyticsConsent !== null) localStorage.setItem("consent.analytics", analyticsConsent);
        if (rumConfig !== null) localStorage.setItem("rum.config", rumConfig);
      } catch (e) {
        console.warn("localStorage.clear failed", e);
      }
      pre.textContent = buildLocalStorageText();
    });

    return overlay;
  }

  function openModalWithLocalStorage() {
    const overlay = ensureModal();
    const pre = overlay.querySelector("#lsv-pre");
    pre.textContent = buildLocalStorageText();
    overlay.style.display = "block";
  }

  function injectButton() {
    if (document.getElementById("lsv-button")) return;

    const buttonHTML = `
      <button id="lsv-button" type="button" title="View localStorage" aria-label="View localStorage" style="position: fixed; right: 8px; bottom: 8px; z-index: 1500; display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px solid #2c5aa0; background: white; color: #2c5aa0; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
        ${createFloppyIconSVG()}<span>Storage</span>
      </button>
    `;
    const lsvContainer = document.getElementById("localstorageContainer");
    if (lsvContainer) {
      lsvContainer.innerHTML = buttonHTML;
    } else {
      // Container not present on this page; fail gracefully without injecting
      // to avoid runtime errors on pages that do not include the footer slot.
    }

    const btn = document.getElementById("lsv-button");
    if (btn) {
      btn.addEventListener("click", openModalWithLocalStorage);
    }
  }

  injectButton();
})();
