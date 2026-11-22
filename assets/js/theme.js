/* Runs in <head> before the page paints: marks that JavaScript runs, applies a stored theme, and marks whether the
   page may move (no motion with prefers-reduced-motion, without IntersectionObserver, or with ?motion=off). If the
   motion module has not started within 3 s, the mark is taken off again, so nothing can stay in its start state. */
(function () {
  var d = document.documentElement;
  d.classList.add("js");
  try {
    var q = /[?&]theme=(light|dark)\b/.exec(location.search);  // for links and screenshots
    var t = q ? q[1] : localStorage.getItem("theme");
    if (t === "light" || t === "dark") d.setAttribute("data-theme", t);
  } catch (e) { /* storage blocked: follow the system */ }
  var still = /[?&]motion=off\b/.test(location.search) ||
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ||
    typeof window.IntersectionObserver !== "function";
  if (!still) {
    d.classList.add("motion");
    setTimeout(function () { if (!d.classList.contains("motion-live")) d.classList.remove("motion"); }, 3000);
  }
})();
