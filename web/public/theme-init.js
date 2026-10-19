// Runs before first paint: apply the saved theme so there is no flash.
(function () {
  try {
    var saved = localStorage.getItem('paisaflow.landing.theme');
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {
    /* storage unavailable: fall back to prefers-color-scheme */
  }
})();
