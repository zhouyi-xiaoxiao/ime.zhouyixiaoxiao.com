/* Keyboard-state input, version 4: motion. Every animation shows a change of state the study is about (typing,
   garbling, decoding; reasoning off to on), uses transforms and opacity only, eases with cubic-bezier(.2,.8,.2,1),
   plays once when its block is 40% in view, and has a replay control. The page's HTML is the final state of every
   block (written by tools/fill_static.py), so without JavaScript, with prefers-reduced-motion: reduce (theme.js does
   not set html.motion), or if this file fails, the page shows the final state at once and nothing plays.

   It also runs the controls that are not motion: Figure A's reasoning off | on and its row details, the strip
   plots' all settings | reasoning off only, and the 2 px reading-progress line. */
(function () {
  "use strict";
  var root = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var EASE = "cubic-bezier(.2,.8,.2,1)";
  function on() { return root.classList.contains("motion"); }
  var replays = {};   // section id -> [play functions], for the replay buttons of the tiles and the small cards
  function addReplay(el, play) {
    var sec = el.closest("section");
    if (!sec) return;
    (replays[sec.id] = replays[sec.id] || []).push(play);
  }
  function wireReplays() {
    Object.keys(replays).forEach(function (id) {
      $$('[data-replay="' + id + '"]').forEach(function (b) {
        b.addEventListener("click", function () { if (on()) replays[id].forEach(function (f) { f(); }); });
      });
    });
  }
  window.Motion = { on: on };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ------------------------------------------------------------------ helpers: set a start state, then play to the final
  function set(el, tf, op, ms, delay) {
    el.style.transition = ms ? "transform " + ms + "ms " + EASE + " " + (delay || 0) + "ms, opacity " + Math.min(ms, 300) + "ms " + EASE + " " + (delay || 0) + "ms" : "none";
    if (tf !== undefined) el.style.transform = tf;
    if (op !== undefined) el.style.opacity = op;
  }
  function reflow(el) { return el.getBoundingClientRect().width; }
  function whenSeen(el, fn, ratio) {
    if (!el) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio >= (ratio || 0.4) - 0.001) { io.disconnect(); fn(); } });
    }, { threshold: [ratio || 0.4] });
    io.observe(el);
  }
  // A block taller than the screen can never be 40% in view: then it plays when it fills 40% of the screen.
  function whenSeenTall(el, fn) {
    if (!el) return;
    var done = false;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var vis = e.intersectionRect.height, need = Math.min(0.4 * e.boundingClientRect.height, 0.4 * window.innerHeight);
        if (!done && e.isIntersecting && vis >= need - 1) { done = true; io.disconnect(); fn(); }
      });
    }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
    io.observe(el);
  }

  // ------------------------------------------------------------------ 1. hero: keys go down, the word appears, the arrow; the fork
  var HERO_MS = 3700;
  function hero() {
    var g = $("#ex-g"), a = $("#ex-a");
    if (!g || !a) return;
    var t = 0;
    function play() {
      clearTimeout(t);
      [g, a].forEach(function (f) { f.classList.remove("play", "done"); });
      reflow(g);
      [g, a].forEach(function (f) { f.classList.add("play"); });
      t = setTimeout(function () { [g, a].forEach(function (f) { f.classList.add("done"); f.classList.remove("play"); }); }, HERO_MS);
    }
    var btn = $("#hero-replay");
    if (btn) btn.addEventListener("click", function () { if (on()) play(); });
    if (on()) whenSeen($("#top"), play, 0.2); else [g, a].forEach(function (f) { f.classList.add("done"); });
  }

  // ------------------------------------------------------------------ 3. tiles: the digits roll in and stop on the exact value
  function tiles() {
    $$(".tiles > .tile").forEach(function (box) {   // each tile rolls when it is 40% in view
      var strips = [];
      $$(".roll", box).forEach(function (r) {
        var txt = r.textContent;
        r.textContent = "";
        Array.from(txt).forEach(function (c) {
          if (!/[0-9]/.test(c)) { r.appendChild(document.createTextNode(c)); return; }
          var d = +c, dg = document.createElement("span"), st = document.createElement("span");
          dg.className = "dg";
          st.className = "dg-strip";
          for (var k = 0; k < 20; k++) { var x = document.createElement("span"); x.textContent = String(k % 10); st.appendChild(x); }
          dg.appendChild(st);
          r.appendChild(dg);
          strips.push({ el: st, to: 10 + d });
        });
      });
      function final() { strips.forEach(function (s) { set(s.el, "translateY(" + (-s.to) + "em)"); }); }
      function play() {
        strips.forEach(function (s) { set(s.el, "translateY(0)"); });
        reflow(box);
        strips.forEach(function (s, i) { set(s.el, "translateY(" + (-s.to) + "em)", undefined, 1100, 60 * i); });
      }
      final();
      if (!on()) return;
      strips.forEach(function (s) { set(s.el, "translateY(0)"); });
      whenSeen(box, play);
      addReplay(box, play);
    });
  }

  // ------------------------------------------------------------------ 4. Figure A
  function figA() {
    var fig = $("#figA4");
    if (!fig) return;
    var plot = $(".figA-plot", fig), detail = $("#figA-detail");
    var rows = [];
    try { rows = JSON.parse(plot.getAttribute("data-rows")); } catch (e) { rows = []; }
    var state = "on";
    function parts(svg) {
      return {
        rings: $$("[data-ring]", svg), dots: $$("[data-dx]", svg), grow: $$("[data-grow]", svg), fade: $$("[data-fade]", svg)
      };
    }
    var svgs = $$(".figA-svg", fig).map(parts);
    function toOff(ms) {
      svgs.forEach(function (p) {
        p.dots.forEach(function (d) { set(d, "translate(" + d.getAttribute("data-dx") + "px,0)", undefined, ms); });
        p.grow.forEach(function (g) { set(g, "scaleX(0.0001)", undefined, ms); });
        p.fade.forEach(function (f) { set(f, undefined, "0", ms ? 200 : 0); });
      });
    }
    function toOn(ms, delay) {
      svgs.forEach(function (p) {
        p.dots.forEach(function (d) { set(d, "none", "1", ms, delay); });
        p.grow.forEach(function (g) { set(g, "none", undefined, ms, delay); });
        p.fade.forEach(function (f) { set(f, undefined, "1", ms ? 300 : 0, (delay || 0) + (ms || 0)); });
      });
    }
    function press(st) {
      state = st;
      $$("[data-fa]", fig).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-fa") === st ? "true" : "false"); });
    }
    $$("[data-fa]", fig).forEach(function (b) {
      b.addEventListener("click", function () {
        var st = b.getAttribute("data-fa");
        if (st === state) return;
        press(st);
        if (st === "off") toOff(on() ? 700 : 0); else toOn(on() ? 700 : 0, 0);
      });
    });
    function play() {
      press("on");
      svgs.forEach(function (p) { p.rings.forEach(function (r) { set(r, undefined, "0"); }); p.dots.forEach(function (d) { set(d, undefined, "0"); }); });
      toOff(0);
      reflow(fig);
      svgs.forEach(function (p) { p.rings.forEach(function (r, i) { set(r, undefined, "1", 300, 80 * i); }); });
      var after = 80 * 5 + 250;
      svgs.forEach(function (p) { p.dots.forEach(function (d) { set(d, undefined, "1", 150, after); }); });
      setTimeout(function () { toOn(700, 0); }, after + 120);
    }
    var rb = $('[data-replay="figA4"]');
    if (rb) rb.addEventListener("click", function () { if (on()) play(); });
    // a tap on a row: its values, interval, items, and that it is a registered secondary estimate, unadjusted. The drawing becomes a group, so that
    // its rows (buttons) are exposed to assistive technology; the table under it stays the text alternative.
    svgs.length && Array.prototype.forEach.call(fig.querySelectorAll(".figA-svg"), function (x) { x.setAttribute("role", "group"); });
    $$(".fa-row", fig).forEach(function (g) {
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      var i = +g.getAttribute("data-row"), r = rows[i];
      if (!r) return;
      g.setAttribute("aria-label", r.model + ": gap " + r.est + " points, interval " + r.ci);
      function show() {
        $$(".fa-row", fig).forEach(function (x) { x.classList.toggle("sel", +x.getAttribute("data-row") === i); });
        detail.hidden = false;
        detail.innerHTML = "<code>" + esc(r.model) + "</code>, " + esc(r.off) + " against " + esc(r.on.replace("reasoning ", "")) +
          ": the loss from wrong-layout text is <strong class=\"num\">" + esc(r.est.replace("-", "−")) + "</strong> points smaller with reasoning on, " +
          "95% interval <span class=\"num\">" + esc(r.ci) + "</span> for this pair" + (r.incl0 ? " (it includes zero)" : " (it does not include zero)") +
          ". 96 items per language, four languages. Registered secondary estimate, unadjusted.";
      }
      g.addEventListener("click", show);
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(); } });
    });
    if (!on()) return;
    toOff(0);
    svgs.forEach(function (p) { p.rings.forEach(function (r) { set(r, undefined, "0"); }); p.dots.forEach(function (d) { set(d, undefined, "0"); }); });
    whenSeenTall(plot, play);
  }

  // ------------------------------------------------------------------ 5. strip plots: marks settle onto the axis, then the diamonds grow
  function strips() {
    var sec = $("#info");
    if (!sec) return;
    var svgs = $$(".strip-svg", sec);
    var mode = "all";
    function apply(ms) {
      svgs.forEach(function (svg) {
        var dx = svg.getAttribute("data-dx") || "0";
        $$('[data-on="1"]', svg).forEach(function (m) { set(m, undefined, mode === "off" ? "0.15" : "1", ms); });
        var all = $('[data-est="all"]', svg), off = $('[data-est="off"]', svg);
        if (all) {
          set(all, mode === "off" ? "translateX(" + dx + "px)" : "none", undefined, ms);
          $$("line, text", all).forEach(function (x) { set(x, undefined, mode === "off" ? "0" : "1", ms); });
        }
        if (off) $$("text", off).forEach(function (x) { set(x, undefined, "1", ms); });
      });
    }
    $$("[data-strip]", sec).forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.getAttribute("data-strip");
        if (m === mode) return;
        mode = m;
        $$("[data-strip]", sec).forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-strip") === m ? "true" : "false"); });
        apply(on() ? 450 : 0);
      });
    });
    function start(svg) {
      $$("[data-drop]", svg).forEach(function (m) { set(m, "translateY(-26px)", "0"); });
      $$("[data-grow]", svg).forEach(function (m) { set(m, "scale(0.0001)"); });
      $$(".est-row line, .est-row text", svg).forEach(function (m) { set(m, undefined, "0"); });
    }
    function play(svg) {
      start(svg);
      reflow(svg);
      var drops = $$("[data-drop]", svg);
      drops.forEach(function (m, i) { set(m, "none", mode === "off" && m.getAttribute("data-on") === "1" ? "0.15" : "1", 420, 45 * i); });
      var t = 45 * drops.length + 300;
      $$("[data-grow]", svg).forEach(function (m) { set(m, "none", undefined, 380, t); });
      $$(".est-row line, .est-row text", svg).forEach(function (m) { set(m, undefined, "1", 300, t + 200); });
    }
    var rb = $('[data-replay="info"]', sec);
    if (rb) rb.addEventListener("click", function () { if (on()) { mode = "all"; $$("[data-strip]", sec).forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-strip") === "all" ? "true" : "false"); }); apply(0); svgs.forEach(play); } });
    if (!on()) return;
    svgs.forEach(function (svg) { start(svg); whenSeen(svg, function () { play(svg); }); });
  }

  // ------------------------------------------------------------------ 6. smaller cards and the pilot panel: bars grow from the zero line
  function bars() {
    $$("#detail .small-svg, #ambiguous .small-svg").forEach(function (svg) {
      if (!on()) return;
      var b = $$("[data-bar]", svg), d = $$("[data-drop]", svg), g = $$("[data-grow]", svg), f = $$("[data-fade]", svg);
      function start() {
        b.forEach(function (x) { set(x, "scaleX(0.0001)"); });
        d.forEach(function (x) { set(x, "translateY(-20px)", "0"); });
        g.forEach(function (x) { set(x, "scale(0.0001)"); });
        f.forEach(function (x) { set(x, undefined, "0"); });
      }
      function play() {
        b.forEach(function (x, i) { set(x, "none", undefined, 400, 30 * i); });
        d.forEach(function (x, i) { set(x, "none", "1", 400, 40 * i); });
        g.forEach(function (x) { set(x, "none", undefined, 380, 380); });
        f.forEach(function (x) { set(x, undefined, "1", 300, 400); });
      }
      start();
      whenSeen(svg, play);
      addReplay(svg, function () { start(); reflow(svg); play(); });
    });
  }

  // ------------------------------------------------------------------ 7. sections rise 12 px and fade in, once
  function sections() {
    if (!on()) return;
    $$(".v4-sec").forEach(function (s) {
      var r = s.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) { s.classList.add("in"); return; }   // already on screen at load
      whenSeen(s, function () { s.classList.add("in"); }, 0.08);
    });
  }

  // ------------------------------------------------------------------ the converter types its first example, once
  function converter() {
    if (!on()) return;
    whenSeen($("#conv"), function go(tries) {
      tries = tries || 0;
      if (window.ConvDemo && ConvDemo.ready()) ConvDemo.start();
      else if (tries < 20) setTimeout(function () { go(tries + 1); }, 150);
    });
  }

  // ------------------------------------------------------------------ 2 px reading-progress line (follows scrolling; not an animation)
  function progress() {
    var bar = $("#progress");
    if (!bar) return;
    var q = false;
    function upd() {
      q = false;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
      bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    }
    window.addEventListener("scroll", function () { if (!q) { q = true; requestAnimationFrame(upd); } }, { passive: true });
    window.addEventListener("resize", upd);
    upd();
  }

  function boot() {
    if (on()) root.classList.add("motion-live");
    [progress, hero, tiles, figA, strips, bars, sections, converter, wireReplays].forEach(function (f) {
      try { f(); } catch (e) { console.error(e); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
