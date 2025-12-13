(function () {
  // Hamburger menu toggle functionality
  function toggleMenu() {
    const dropdown = document.getElementById("menuDropdown");
    dropdown.classList.toggle("show");
  }

  // Close menu when clicking outside
  function handleOutsideClick(event) {
    if (!event.target.matches(".hamburger-btn")) {
      const dropdown = document.getElementById("menuDropdown");
      if (dropdown.classList.contains("show")) {
        dropdown.classList.remove("show");
      }
    }
  }

  // Initialize outside click handler
  function initializeHamburgerMenu() {
    window.addEventListener("click", handleOutsideClick);
  }

  // Expose functions globally for backward compatibility
  if (typeof window !== "undefined") {
    window.toggleMenu = toggleMenu;
    window.HamburgerMenu = {
      toggle: toggleMenu,
      initialize: initializeHamburgerMenu,
    };
  }

  // Auto-initialize if DOM is already loaded, otherwise wait for it
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeHamburgerMenu);
  } else {
    initializeHamburgerMenu();
  }
})();
