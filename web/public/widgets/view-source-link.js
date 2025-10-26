/* eslint-env browser */
(function () {
  // Load and display view source link
  async function loadViewSourceLink() {
    try {
      const deploymentUrl = new URL("../submit.deployment", import.meta.url);
      const deploymentResponse = await fetch(deploymentUrl);
      let deploymentName = "";
      if (deploymentResponse.ok) {
        const deploymentText = await deploymentResponse.text();
        deploymentName = deploymentText.trim();
      }
      const versionUrl = new URL("../submit.version", import.meta.url);
      const versionResponse = await fetch(versionUrl);
      if (versionResponse.ok) {
        const versionText = await versionResponse.text();
        const commitHash = versionText.trim();
        if (commitHash) {
          const githubUrl = `https://github.com/antonycc/submit.diyaccounting.co.uk/blob/${commitHash}/web/public/${window.location.pathname}`;
          const viewSourceLink = document.getElementById("viewSourceLink");
          if (viewSourceLink) {
            viewSourceLink.href = githubUrl;
            viewSourceLink.target = "_blank";
            viewSourceLink.textContent = `${deploymentName}: @${commitHash.substring(0, 7)}`;
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
