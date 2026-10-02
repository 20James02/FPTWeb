/**
 * PAGEFPT ADMIN CHARTS HELPER
 * Lightweight chart animations and SVG builders
 */

document.addEventListener("DOMContentLoaded", () => {
  // Animate funnel bars on page load
  const funnelFills = document.querySelectorAll("#funnel-container div div");
  funnelFills.forEach((bar) => {
    bar.style.transition = "width 1s cubic-bezier(0.16, 1, 0.3, 1)";
  });
});
