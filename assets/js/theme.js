/* Runs in <head> before the page paints: marks that JavaScript runs and applies a stored theme. */
(function () {
  var d = document.documentElement;
  d.classList.add("js");
  try {
    var q = /[?&]theme=(light|dark)\b/.exec(location.search);  // for links and screenshots
    var t = q ? q[1] : localStorage.getItem("theme");
    if (t === "light" || t === "dark") d.setAttribute("data-theme", t);
  } catch (e) { /* storage blocked: follow the system */ }
})();
