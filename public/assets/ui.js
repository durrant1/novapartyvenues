/* Gentle scroll reveals on inner pages. Source: scripts/ui.js -> public/assets/ui.js */
(function () {
  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var els = [].slice.call(document.querySelectorAll(".page .grid .card, .page h2, .stats, .facts, .side-card, .pricebox, .linklist, ul.plain"));
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
  els.forEach(function (el) { el.classList.add("rv"); io.observe(el); });
})();
