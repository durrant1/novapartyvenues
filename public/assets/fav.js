/* Favorites, stored on this device only (localStorage). Source: scripts/fav.js -> public/assets/fav.js */
(function () {
  var KEY = "nvpv-favs";
  function read() { try { var a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  var list = read();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  var FAVS = window.FAVS = {
    has: function (n) { return list.indexOf(n) > -1; },
    all: function () { return list.slice(); },
    count: function () { return list.length; },
    toggle: function (n) {
      var i = list.indexOf(n);
      if (i > -1) list.splice(i, 1); else list.push(n);
      save(); paint(); document.dispatchEvent(new CustomEvent("favchange", { detail: { name: n } }));
    }
  };
  function paint(root) {
    [].forEach.call((root || document).querySelectorAll(".fav[data-n]"), function (b) {
      var n = b.getAttribute("data-n"), on = FAVS.has(n);
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", (on ? "Remove " : "Save ") + n + (on ? " from favorites" : " to favorites"));
      b.title = on ? "Saved. Click to remove" : "Save to favorites";
    });
  }
  FAVS.paint = paint;
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".fav[data-n]");
    if (b) {
      e.preventDefault(); FAVS.toggle(b.getAttribute("data-n"));
      var again = document.querySelectorAll('.fav[data-n]'); // restart the pop on whichever buttons now exist
      [].forEach.call(again, function (x) { if (x.getAttribute("data-n") === b.getAttribute("data-n")) { x.classList.remove("pop-it"); void x.offsetWidth; x.classList.add("pop-it"); } });
    }
  });
  window.addEventListener("storage", function (e) { if (e.key === KEY) { list = read(); paint(); document.dispatchEvent(new CustomEvent("favchange", { detail: {} })); } });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { paint(); }); else paint();
})();
