/* Keyboard-state input: the section "Models" (exploratory roster, 23 Nov 2026).
   The HTML holds every state of the figure as static SVG (tools/roster_render.py): one per language and condition,
   in a 360- and a 640-wide drawing; the newest models first, the others in a group drawn with "all models". This file
   only switches between them, shows a point's counts on hover, focus or tap, moves the keyboard focus between
   points (arrow keys, Home, End), and plays the motion: each point travels from its tick (the original text) to its
   value on wrong-layout text, so that the distance travelled is the loss. Transforms and opacity only; nothing plays
   with prefers-reduced-motion (theme.js then does not set html.motion), and the end state is complete without it. */
(function () {
  "use strict";
  var root = document.documentElement;
  var EASE = "cubic-bezier(.2,.8,.2,1)";
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function moving() { return root.classList.contains("motion"); }
  function set(el, tf, op, ms, delay) {
    el.style.transition = ms ? "transform " + ms + "ms " + EASE + " " + (delay || 0) + "ms, opacity " + Math.min(ms, 300) + "ms " + EASE + " " + (delay || 0) + "ms" : "none";
    if (tf !== undefined) el.style.transform = tf;
    if (op !== undefined) el.style.opacity = op;
  }

  function boot() {
    var fig = document.getElementById("rsFig");
    if (!fig) return;
    var states = $$(".rs-state", fig), detail = document.getElementById("rs-detail");
    var cur = { lang: "heb_Hebr", cond: "kb_layout_keys", all: false };
    function state() {
      for (var i = 0; i < states.length; i++) {
        if (states[i].getAttribute("data-lang") === cur.lang && states[i].getAttribute("data-cond") === cur.cond) return states[i];
      }
      return states[0];
    }
    function visibleSvg(st) {
      var s = $$("svg.rs-svg", st);
      for (var i = 0; i < s.length; i++) if (s[i].getBoundingClientRect().width > 0) return s[i];
      return s[0];
    }

    // ---------------------------------------------------------------- all models: the drawing grows to every row
    function applyAll() {
      fig.classList.toggle("rs-all-on", cur.all);
      $$("svg.rs-svg", fig).forEach(function (svg) {
        var vb = svg.getAttribute("viewBox").split(" ");
        var h = svg.getAttribute(cur.all ? "data-h-all" : "data-h-new");
        svg.setAttribute("viewBox", vb[0] + " " + vb[1] + " " + vb[2] + " " + h);
        svg.setAttribute("height", h);
      });
    }

    // ---------------------------------------------------------------- the details of a point
    function show(pt) {
      $$(".rs-pt.sel", fig).forEach(function (x) { x.classList.remove("sel"); });
      pt.classList.add("sel");
      var d = { m: pt.getAttribute("data-m") || "", t: pt.getAttribute("data-d") || "" };
      detail.textContent = "";
      var c = document.createElement("code");
      c.textContent = d.m;
      detail.appendChild(c);
      d.t.split(" | ").forEach(function (line, i) {
        if (i) detail.appendChild(document.createElement("br"));
        detail.appendChild(document.createTextNode((i ? "" : ", ") + line));
      });
      detail.hidden = false;
    }
    $$("svg.rs-svg", fig).forEach(function (svg) {
      svg.setAttribute("role", "group");
      var pts = $$(".rs-pt", svg);
      pts.forEach(function (pt, i) {
        pt.setAttribute("tabindex", i === 0 ? "0" : "-1");
        pt.setAttribute("role", "button");
        pt.setAttribute("aria-label", pt.getAttribute("data-m") + ", " + (pt.getAttribute("data-d") || "").split(" | ").join("; "));
        pt.addEventListener("click", function () { show(pt); });
        pt.addEventListener("mouseenter", function () { show(pt); });
        pt.addEventListener("focus", function () { show(pt); });
        pt.addEventListener("keydown", function (e) {
          var list = $$(".rs-pt", svg).filter(function (p) { return p.getBoundingClientRect().width > 0; });
          var k = list.indexOf(pt), to = -1;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") to = Math.min(list.length - 1, k + 1);
          else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = Math.max(0, k - 1);
          else if (e.key === "Home") to = 0;
          else if (e.key === "End") to = list.length - 1;
          else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(pt); return; }
          if (to < 0) return;
          e.preventDefault();
          pt.setAttribute("tabindex", "-1");
          list[to].setAttribute("tabindex", "0");
          list[to].focus();
          show(list[to]);   // also when the window has no focus (no focus event then)
        });
      });
    });

    // ---------------------------------------------------------------- motion: from the tick to the value
    function start(st) {
      $$(".rs-mv", st).forEach(function (m) { set(m, "translate(" + m.getAttribute("data-dx") + "px,0)", "1"); });
      $$("[data-fade]", st).forEach(function (f) { set(f, undefined, "0"); });
    }
    function play(st) {
      if (!moving()) return;
      start(st);
      st.getBoundingClientRect();
      var pts = $$(".rs-pt", visibleSvg(st));
      $$(".rs-mv", st).forEach(function (m) {
        var k = pts.indexOf(m.closest(".rs-pt"));
        set(m, "none", "1", 700, 160 + 40 * Math.max(0, k));
      });
      var end = 160 + 40 * pts.length + 700;
      $$("[data-fade]", st).forEach(function (f) { set(f, undefined, "1", 300, end); });
    }
    function finish(st) { $$(".rs-mv, [data-fade]", st).forEach(function (m) { set(m, "none", "1"); }); }

    // ---------------------------------------------------------------- controls
    function press(attr, val) {
      $$("[" + attr + "]", fig).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute(attr) === val ? "true" : "false"); });
    }
    function go() {
      states.forEach(function (s) { s.hidden = true; });
      var st = state();
      st.hidden = false;
      detail.hidden = true;
      $$(".rs-pt.sel", fig).forEach(function (x) { x.classList.remove("sel"); });
      if (moving()) play(st); else finish(st);
    }
    $$("[data-rs-lang]", fig).forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-rs-lang");
        if (v === cur.lang) return;
        cur.lang = v; press("data-rs-lang", v); go();
      });
    });
    $$("[data-rs-cond]", fig).forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-rs-cond");
        if (v === cur.cond) return;
        cur.cond = v; press("data-rs-cond", v); go();
      });
    });
    var allBtn = fig.querySelector("[data-rs-all]");
    if (allBtn) allBtn.addEventListener("click", function () {
      cur.all = !cur.all;
      allBtn.setAttribute("aria-pressed", cur.all ? "true" : "false");
      applyAll();
    });
    var rb = document.querySelector('[data-replay="models"]');
    if (rb) rb.addEventListener("click", function () { play(state()); });
    applyAll();

    // the table is folded on a phone and open on a wide screen
    var tbl = document.getElementById("models-table");
    if (tbl && window.matchMedia && window.matchMedia("(min-width: 900px)").matches) tbl.open = true;

    // first view: play once when the drawing fills 40% of the screen (or is 40% in view)
    if (!moving()) return;
    var st0 = state();
    start(st0);
    var plot = fig.querySelector(".rs-plot");
    var done = false;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var need = Math.min(0.4 * e.boundingClientRect.height, 0.4 * window.innerHeight);
        if (!done && e.isIntersecting && e.intersectionRect.height >= need - 1) { done = true; io.disconnect(); play(state()); }
      });
    }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1] });
    io.observe(plot);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
