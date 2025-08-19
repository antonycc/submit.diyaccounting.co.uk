/* eslint-env browser */
(function () {
  // Load and display view source link
  async function loadViewSourceLink() {
    try {
      // const response = await fetch("submit.version");
      const versionUrl = new URL("../submit.version", import.meta.url);
      const response = await fetch(versionUrl);
      if (response.ok) {
        const text = await response.text();
        const commitHash = text.trim();
        if (commitHash) {
          const currentPage = window.location.pathname.split("/").pop() || "index.html";
          const githubUrl = `https://github.com/antonycc/submit.diyaccounting.co.uk/blob/${commitHash}/web/public/${window.location.pathname}`;
          const viewSourceLink = document.getElementById("viewSourceLink");
          if (viewSourceLink) {
            viewSourceLink.href = githubUrl;
            viewSourceLink.target = "_blank";
            viewSourceLink.textContent = `source: ${currentPage}@${commitHash.substring(0, 7)}`;
            viewSourceLink.style.display = "inline";
          }
        }
      }
    } catch (error) {
      console.log("Could not load submit.version:", error);
    }
  }

  // Initialize view source link
  function initializeViewSourceLink() {
    loadViewSourceLink();
  }

  // Expose functions globally for backward compatibility
  if (typeof window !== "undefined") {
    window.loadViewSourceLink = loadViewSourceLink;
    window.ViewSourceLink = {
      load: loadViewSourceLink,
      initialize: initializeViewSourceLink,
    };
  }

  // Auto-initialize if DOM is already loaded, otherwise wait for it
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeViewSourceLink);
  } else {
    initializeViewSourceLink();
  }
})();
