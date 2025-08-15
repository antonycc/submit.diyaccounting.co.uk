(function () {
  function createFloppyIconSVG() {
    // Simple floppy disk SVG icon (no external deps)
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http:\/\/www.w3.org\/2000\/svg", "path");
    path.setAttribute(
      "d",
      "M3 3h14l4 4v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 2v6h14V8.83L15.17 5H5zm0 16h14v-8H5v8zm3-3h8v2H8v-2z"
    );
    path.setAttribute("fill", "currentColor");

    svg.appendChild(path);
    return svg;
  }

  function prettyValue(value) {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch (_) {
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

    overlay = document.createElement("div");
    overlay.id = "lsv-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.4)";
    overlay.style.display = "none";
    overlay.style.zIndex = "2000";

    const dialog = document.createElement("div");
    dialog.style.position = "absolute";
    dialog.style.top = "50%";
    dialog.style.left = "50%";
    dialog.style.transform = "translate(-50%, -50%)";
    dialog.style.background = "#fff";
    dialog.style.borderRadius = "8px";
    dialog.style.boxShadow = "0 10px 30px rgba(0,0,0,0.2)";
    dialog.style.width = "min(90vw, 720px)";
    dialog.style.maxHeight = "80vh";
    dialog.style.display = "flex";
    dialog.style.flexDirection = "column";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.padding = "12px 16px";
    header.style.borderBottom = "1px solid #eee";

    const title = document.createElement("div");
    title.textContent = "Stored locally by this browser";
    title.style.fontWeight = "bold";
    title.style.color = "#2c5aa0";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.style.background = "transparent";
    closeBtn.style.border = "none";
    closeBtn.style.fontSize = "18px";
    closeBtn.style.cursor = "pointer";

    const emptyBtn = document.createElement("button");
    emptyBtn.textContent = "Empty";
    emptyBtn.title = "Delete all local storage";
    emptyBtn.setAttribute("aria-label", "Empty localStorage");
    emptyBtn.style.marginLeft = "12px";
    emptyBtn.style.background = "#fff";
    emptyBtn.style.border = "1px solid #dc3545";
    emptyBtn.style.color = "#dc3545";
    emptyBtn.style.fontSize = "12px";
    emptyBtn.style.padding = "4px 8px";
    emptyBtn.style.borderRadius = "4px";
    emptyBtn.style.cursor = "pointer";
    emptyBtn.addEventListener("click", () => {
      const proceed = confirm("Delete all local storage for this site? This will log you out.");
      if (!proceed) return;
      try {
        localStorage.clear();
      } catch (e) {
        console.warn("localStorage.clear failed", e);
      }
      pre.textContent = buildLocalStorageText();
    });

    const body = document.createElement("div");
    body.style.padding = "12px 16px";
    body.style.overflow = "auto";

    const pre = document.createElement("pre");
    pre.id = "lsv-pre";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    pre.style.fontSize = "12px";
    pre.style.lineHeight = "1.4";
    pre.style.background = "#f8f9fa";
    pre.style.border = "1px solid #eee";
    pre.style.borderRadius = "6px";
    pre.style.padding = "12px";

    body.appendChild(pre);
    header.appendChild(title);
    header.appendChild(emptyBtn);
    header.appendChild(closeBtn);
    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);

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

    document.body.appendChild(overlay);
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

    const btn = document.createElement("button");
    btn.id = "lsv-button";
    btn.type = "button";
    btn.title = "View localStorage";
    btn.setAttribute("aria-label", "View localStorage");

    // Fixed bottom-right floating button
    btn.style.position = "fixed";
    btn.style.right = "8px";
    btn.style.bottom = "8px";
    btn.style.zIndex = "1500"; // below overlay (2000)

    // Visual style
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.gap = "6px";
    btn.style.padding = "8px 12px";
    btn.style.border = "1px solid #2c5aa0";
    btn.style.background = "white";
    btn.style.color = "#2c5aa0";
    btn.style.borderRadius = "6px";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";

    const icon = createFloppyIconSVG();
    const text = document.createElement("span");
    text.textContent = "Storage";

    btn.appendChild(icon);
    btn.appendChild(text);

    btn.addEventListener("click", openModalWithLocalStorage);

    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectButton);
  } else {
    injectButton();
  }
})();