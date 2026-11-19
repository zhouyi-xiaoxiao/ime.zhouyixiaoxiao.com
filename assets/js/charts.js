/* Charts drawn as SVG by hand: no library. One value axis per chart; intervals always drawn; every mark
   has a hover/tap/focus detail; identity by shape as well as colour (open circle = as written, filled
   circle = as typed, square = the model was told); chart text is always ink, never a series colour. */
(function (global) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, s, cls, anchor) {
    var t = el("text", { x: x, y: y, "class": cls || null, "text-anchor": anchor || null }, parent);
    t.textContent = s;
    return t;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  // rough text width for layout decisions (Helvetica ~0.55em, Plex Mono 0.6em)
  function tw(s, px, mono) { return String(s).length * px * (mono ? 0.61 : 0.53); }

  /* ---------------------------------------------------------------- tooltip */
  var tipEl = null, tipOwner = null;
  function tip() { return tipEl || (tipEl = document.getElementById("tip")); }
  function showTip(owner, html, anchorEl) {
    var t = tip();
    if (!t) return;
    tipOwner = owner;
    t.innerHTML = html;
    t.hidden = false;
    var r = anchorEl.getBoundingClientRect();
    var sx = window.pageXOffset, sy = window.pageYOffset;
    var w = t.offsetWidth, h = t.offsetHeight, vw = document.documentElement.clientWidth;
    var x = Math.min(Math.max(8, r.left + sx + Math.min(r.width, 260) / 2 - w / 2), sx + vw - w - 8);
    var y = r.top + sy - h - 8;
    if (y < sy + 4) y = r.bottom + sy + 8;
    t.style.left = x + "px";
    t.style.top = y + "px";
  }
  function hideTip(owner) {
    var t = tip();
    if (t && (!owner || owner === tipOwner)) { t.hidden = true; tipOwner = null; tipShownByTap = false; }
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTip(); });
  document.addEventListener("pointerdown", function (e) {
    if (!e.target.closest || !e.target.closest(".row, .k, .tipable")) hideTip();
  });

  // Hover, focus and tap all show the detail. With a mouse or the keyboard (Enter/Space) a mark with a
  // pick action opens at once; on a touch screen the first tap shows the detail and a second tap on the
  // same mark opens it, so the counts can be read before the page moves.
  var lastPointer = "mouse";
  document.addEventListener("pointerdown", function (e) { lastPointer = e.pointerType || "mouse"; }, true);
  function interactive(g, html, label, pick) {
    g.setAttribute("tabindex", "-1");
    g.setAttribute("role", pick ? "button" : "img");
    g.setAttribute("aria-label", label);
    function act(how) { return pick ? '<span class="tip-act">' + how + " to open it in the explorer.</span>" : ""; }
    g.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") showTip(g, html + act("Click"), g); });
    g.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") hideTip(g); });
    g.addEventListener("focus", function () { if (!tipShownByTap) showTip(g, html + act("Press Enter"), g); });
    g.addEventListener("blur", function () { hideTip(g); });
    g.addEventListener("click", function () {
      if (lastPointer !== "mouse") {
        if (tipOwner !== g || !tipShownByTap) {
          showTip(g, html + act("Tap again"), g);
          tipShownByTap = true;
          return;
        }
        tipShownByTap = false;
        if (pick) { hideTip(); pick(); }
        return;
      }
      if (pick) pick();
    });
    g.addEventListener("keydown", function (e) {
      if (pick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(); }
    });
  }
  var tipShownByTap = false;
  // One tab stop per chart: the rows of an SVG are reached with the arrow keys (roving tabindex).
  function rove(svg) {
    var rows = Array.prototype.slice.call(svg.querySelectorAll(".row"));
    if (!rows.length) return;
    var start = rows.filter(function (r) { return /\bsel\b/.test(r.getAttribute("class") || ""); })[0] || rows[0];
    start.setAttribute("tabindex", "0");
    svg.addEventListener("keydown", function (e) {
      var i = rows.indexOf(e.target);
      if (i < 0) return;
      var j = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 :
              e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : null;
      if (j == null) return;
      e.preventDefault();
      j = Math.max(0, Math.min(rows.length - 1, j));
      rows[i].setAttribute("tabindex", "-1");
      rows[j].setAttribute("tabindex", "0");
      rows[j].focus();
    });
  }

  /* ---------------------------------------------------------------- responsive redraw */
  var observers = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function responsive(container, draw) {
    var last = -1;
    var queued = false;
    function now() {
      queued = false;
      var w = Math.round(container.clientWidth);
      if (w && Math.abs(w - last) > 3) { last = w; draw(w); }
    }
    function run() {
      if (last < 0) return now();
      if (!queued) { queued = true; (window.requestAnimationFrame || setTimeout)(now); }
    }
    if (observers && observers.get(container)) observers.get(container).disconnect();
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(run);
      ro.observe(container);
      if (observers) observers.set(container, ro);
    } else {
      window.addEventListener("resize", run);
    }
    last = -1;
    run();
  }

  /* ---------------------------------------------------------------- axis helper */
  function linear(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }

  /* ---------------------------------------------------------------- dumbbell rows
     spec.rows: [{key, label, mono, sub, group, a:{v,lo,hi}|null, b:{v,lo,hi,cls}|null, single, floor, mark, tip,
     aria, sel, nodata}]. single: the row has one form only (a), so nothing is missing. floor: a per-row
     reference value (drawn as a short tick). spec.groups: [{id,label}]; spec.refs: [{v, cls, label}];
     spec.min/max/ticks/axisLabel; spec.pick(row) */
  function dumbbell(container, spec) {
    responsive(container, function (W) {
      container.innerHTML = "";
      var narrow = W < 620;
      var labelW = 0;
      if (!narrow) {
        spec.rows.forEach(function (r) {
          labelW = Math.max(labelW, tw(r.label, 12.5, r.mono) + (r.sub ? tw(" " + r.sub, 12, false) : 0) + (r.mark ? 10 : 0));
        });
        labelW = labelW ? Math.min(Math.ceil(labelW) + 10, Math.round(W * 0.46)) : 0;
      }
      var padL = narrow ? 6 : labelW + 8, padR = narrow ? 14 : 24;
      var noLabels = spec.rows.every(function (r) { return !r.label; });
      var groupH = 30, top = spec.refs && spec.refs.length && !narrow ? 22 : 8;
      var x = linear(spec.min, spec.max, padL, W - padR);
      // on a narrow screen the label sits above the marks; a long label puts its level on a second line
      function wraps(r) { return narrow && !noLabels && tw(r.label, 12.5, r.mono) + (r.sub ? tw(" " + r.sub, 12, false) : 0) + 16 > W; }
      function rowH(r) { return narrow && !noLabels ? (wraps(r) ? 60 : 44) : 26; }
      var y = top, layout = [];
      var groups = spec.groups || [{ id: null, label: null }];
      groups.forEach(function (g) {
        var rows = spec.rows.filter(function (r) { return (r.group || null) === g.id; });
        if (!rows.length) return;
        if (g.label) { layout.push({ group: g, y: y }); y += groupH; }
        rows.forEach(function (r) { var h = rowH(r); layout.push({ row: r, y: y, h: h }); y += h; });
      });
      var H = y + 26;
      var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "group",
                            "aria-label": spec.aria || "chart" }, container);
      // grid and references: full lines where the labels sit in their own column; on a narrow screen
      // (labels above the marks) only across each row's mark band, so no line crosses a label
      function vline(v, cls, y1, y2) { el("line", { x1: x(v), x2: x(v), y1: y1, y2: y2, "class": cls }, svg); }
      if (!narrow || noLabels) {
        spec.ticks.forEach(function (t) { vline(t, "grid", top - 4, y + 2); });
        (spec.refs || []).forEach(function (rf) {
          vline(rf.v, rf.cls, top - 6, y + 2);
          if (!narrow && rf.label) {
            var anchorEnd = rf.side === "left";
            text(svg, x(rf.v) + (anchorEnd ? -4 : 4), 14, rf.label, "t-2 t-s", anchorEnd ? "end" : "start");
          }
        });
      } else {
        layout.forEach(function (it) {
          if (!it.row) return;
          var cy = it.y + it.h - 14;
          spec.ticks.forEach(function (t) { vline(t, "grid", cy - 9, cy + 9); });
          (spec.refs || []).forEach(function (rf) { vline(rf.v, rf.cls, cy - 9, cy + 9); });
        });
      }
      // rows
      layout.forEach(function (it) {
        if (it.group) {
          text(svg, narrow ? 6 : 0, it.y + 20, it.group.label, "t-b");
          return;
        }
        var r = it.row, cy = narrow && !noLabels ? it.y + it.h - 14 : it.y + it.h / 2;
        var g = el("g", { "class": "row" + (r.sel ? " sel" : "") }, svg);
        el("rect", { x: 0, y: it.y + 1, width: W, height: it.h - 2, "class": "hit", rx: 3 }, g);
        // label
        var lx = narrow ? 6 : padL - 10, ly = narrow ? it.y + 14 : cy + 4.5;
        var lt = el("text", { x: lx, y: ly, "text-anchor": narrow ? "start" : "end" }, g);
        var t1 = el("tspan", { "class": r.mono ? "t-mono" : null }, lt);
        t1.textContent = r.label;
        if (r.sub) {
          var t2 = el("tspan", wraps(r) ? { "class": "t-2 t-s", x: lx, dy: 15 } : { "class": "t-2 t-s", dx: 4 }, lt);
          t2.textContent = r.sub;
        }
        if (r.mark) { var t3 = el("tspan", { "class": "t-2", dx: 2 }, lt); t3.textContent = r.mark; }
        if (r.floor != null) el("line", { x1: x(r.floor), x2: x(r.floor), y1: cy - 8, y2: cy + 8, "class": "ref-floor-row" }, g);
        if (r.nodata || (!r.a && !r.b)) {
          text(g, x(spec.min) + 2, cy + 4, r.nodata || "not run yet", "nodata t-s");
        } else {
          if (r.a && r.b) el("line", { x1: x(r.a.v), x2: x(r.b.v), y1: cy, y2: cy, "class": "conn" }, g);
          if (r.a && r.a.lo != null) el("line", { x1: x(r.a.lo), x2: x(r.a.hi), y1: cy - 5, y2: cy - 5, "class": "ci" }, g);
          if (r.b && r.b.lo != null) el("line", { x1: x(r.b.lo), x2: x(r.b.hi), y1: cy + 5, y2: cy + 5,
                                                  "class": r.b.cls === "told" ? "ci-told" : "ci-typed" }, g);
          if (r.a) el("circle", { cx: x(r.a.v), cy: cy, r: 5, "class": "m-native" }, g);
          if (r.b) {
            if (r.b.cls === "told") el("rect", { x: x(r.b.v) - 5.5, y: cy - 5.5, width: 11, height: 11, "class": "m-told" }, g);
            else el("circle", { cx: x(r.b.v), cy: cy, r: 5.5, "class": "m-typed" }, g);
          }
          var vt = r.b ? r.b.text : r.single && r.a ? r.a.text : null;
          var vv = r.b ? r.b.v : r.a ? r.a.v : null;
          if (vt && r.single && r.a) {  // one form: the value goes beside its interval, not across it
            var lo1 = x(r.a.lo != null ? r.a.lo : r.a.v) - 7, hi1 = x(r.a.hi != null ? r.a.hi : r.a.v) + 7;
            var room = lo1 - tw(vt, 12, false) > padL;
            text(g, room ? lo1 : hi1, cy + 4, vt, "t-s", room ? "end" : "start");
          } else if (vt) {
            var left = r.a && r.b ? r.b.v <= r.a.v : true;
            var vx = x(vv) + (left ? -9 : 9);
            var need = tw(vt, 12, false);
            if (left && vx - need < padL) { left = false; vx = x(r.a && r.b ? Math.max(r.a.v, r.b.v) : vv) + 9; }
            if (!left && vx + need > W - 2) { left = true; vx = x(r.a && r.b ? Math.min(r.a.v, r.b.v) : vv) - 9; }
            text(g, vx, cy + 4, vt, "t-s", left ? "end" : "start");
          } else if (r.a && !r.b && !r.single) {
            text(g, x(r.a.v) + 10, cy + 4, r.bMissing || "not run yet", "nodata t-s");
          }
        }
        interactive(g, r.tip || esc(r.label), r.aria || r.label, spec.pick ? function () { spec.pick(r); } : null);
      });
      rove(svg);
      // axis
      var ay = y + 6;
      el("line", { x1: x(spec.min), x2: x(spec.max), y1: ay, y2: ay, "class": "ax" }, svg);
      spec.ticks.forEach(function (t) {
        el("line", { x1: x(t), x2: x(t), y1: ay, y2: ay + 4, "class": "ax" }, svg);
        text(svg, x(t), ay + 17, String(t), "t-2 t-s", "middle");
      });
      axisCaption(container, spec.axisLabel);
    });
  }
  // An interval drawn over a filled bar: an ink line with a background halo, so it shows on any fill.
  function whisker(g, x1, x2, cy, h) {
    [["whisk-halo"], ["whisk"]].forEach(function (c) {
      el("line", { x1: x1, x2: x2, y1: cy, y2: cy, "class": c[0] }, g);
      el("line", { x1: x1, x2: x1, y1: cy - h, y2: cy + h, "class": c[0] }, g);
      el("line", { x1: x2, x2: x2, y1: cy - h, y2: cy + h, "class": c[0] }, g);
    });
  }
  function axisCaption(container, label) {
    if (!label) return;
    var p = document.createElement("p");
    p.className = "small axis-cap";
    p.textContent = label;
    container.appendChild(p);
  }

  /* ---------------------------------------------------------------- reasoning-token rows (log scale) */
  function tokens(container, spec) {
    responsive(container, function (W) {
      container.innerHTML = "";
      // side: drawn beside a dumbbell chart with the same rows, so it keeps that chart's row geometry
      var side = spec.side ? spec.side() : false;
      if (!side && spec.title) {
        var cap = document.createElement("p");
        cap.className = "small";
        cap.textContent = spec.title + (spec.dropZero ? " (settings that report any)" : "");
        container.appendChild(cap);
      }
      var narrow = !side;
      var noLabels = spec.rows.every(function (r) { return !r.label; });
      var rowH = narrow && !noLabels ? 44 : 26, groupH = 30, top = side ? 22 : 8;
      var padL = 30, padR = 16;
      var rowsIn = spec.rows;
      if (!side && spec.dropZero) {  // on its own (phones), rows with no reasoning tokens at all are left out
        rowsIn = rowsIn.filter(function (r) { return (r.a && r.a.v > 0) || (r.b && r.b.v > 0); });
      }
      var maxV = 1;
      rowsIn.forEach(function (r) { [r.a, r.b].forEach(function (p) { if (p && p.v > maxV) maxV = p.v; }); });
      var decades = Math.max(2, Math.ceil(Math.log(maxV) / Math.LN10));
      var x0 = padL, x1 = padL + 16;
      var lx = function (v) { return v < 1 ? x0 : x1 + Math.log(v) / Math.LN10 / decades * (W - padR - x1); };
      var y = top, layout = [];
      (spec.groups || [{ id: null }]).forEach(function (g) {
        var rows = rowsIn.filter(function (r) { return (r.group || null) === g.id; });
        if (!rows.length) return;
        if (g.label) { layout.push({ group: g, y: y }); y += groupH; }
        rows.forEach(function (r) { layout.push({ row: r, y: y }); y += rowH; });
      });
      var H = y + 26;
      var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "group", "aria-label": spec.aria }, container);
      if (side && spec.title) text(svg, x0, 14, spec.title, "t-2 t-s");  // beside the accuracy chart: title in its top margin
      for (var d = 0; d <= decades; d++) el("line", { x1: lx(Math.pow(10, d)), x2: lx(Math.pow(10, d)), y1: top - 4, y2: y + 2, "class": "grid" }, svg);
      layout.forEach(function (it) {
        if (it.group) { if (!side) text(svg, 0, it.y + 20, it.group.label, "t-b"); return; }
        var r = it.row, cy = narrow ? it.y + 30 : it.y + rowH / 2;
        var g = el("g", { "class": "row" + (r.sel ? " sel" : "") }, svg);
        el("rect", { x: 0, y: it.y + 1, width: W, height: rowH - 2, "class": "hit", rx: 3 }, g);
        if (narrow) {
          var lt = el("text", { x: 2, y: it.y + 14 }, g);
          var t1 = el("tspan", { "class": r.mono ? "t-mono" : null }, lt); t1.textContent = r.label;
          if (r.sub) { var t2 = el("tspan", { "class": "t-2 t-s", dx: 4 }, lt); t2.textContent = r.sub; }
        }
        if (!r.a && !r.b) { text(g, x1, cy + 4, r.nodata || "not reported", "nodata t-s"); }
        else {
          if (r.a && r.b) el("line", { x1: lx(r.a.v), x2: lx(r.b.v), y1: cy, y2: cy, "class": "conn" }, g);
          if (r.a) el("circle", { cx: lx(r.a.v), cy: cy, r: 5, "class": "m-native" }, g);
          if (r.b) {
            if (r.b.cls === "told") el("rect", { x: lx(r.b.v) - 5.5, y: cy - 5.5, width: 11, height: 11, "class": "m-told" }, g);
            else el("circle", { cx: lx(r.b.v), cy: cy, r: 5.5, "class": "m-typed" }, g);
          }
          if (!r.a && !r.single) text(g, x0 - 2, cy - 7, "as written: not reported", "nodata t-xs", "start");
        }
        interactive(g, r.tip || esc(r.label), r.aria || r.label, spec.pick ? function () { spec.pick(r); } : null);
      });
      rove(svg);
      var ay = y + 6;
      el("line", { x1: x0, x2: W - padR, y1: ay, y2: ay, "class": "ax" }, svg);
      text(svg, x0, ay + 17, "0", "t-2 t-s", "middle");
      for (d = 0; d <= decades; d++) {
        var tx = lx(Math.pow(10, d));
        el("line", { x1: tx, x2: tx, y1: ay, y2: ay + 4, "class": "ax" }, svg);
        var lab = d === 0 ? "1" : d === 1 ? "10" : d <= 3 ? String(Math.pow(10, d)) : "10^" + d;
        if (d >= 4) lab = String(Math.pow(10, d) / 1000) + "k";
        text(svg, tx, ay + 17, lab, "t-2 t-s", "middle");
      }
      axisCaption(container, spec.axisLabel);
    });
  }

  /* ---------------------------------------------------------------- horizontal bars with a reference line */
  function bars(container, spec) {
    responsive(container, function (W) {
      container.innerHTML = "";
      var padL = 4, padR = 18, top = 26, barH = 22, gap = 34;
      var x = linear(0, 100, padL, W - padR);
      var y = top;
      var H = top + spec.rows.length * (barH + gap) + 30;
      var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "group", "aria-label": spec.aria }, container);
      [0, 25, 50, 75, 100].forEach(function (t) { el("line", { x1: x(t), x2: x(t), y1: top - 6, y2: H - 30, "class": "grid" }, svg); });
      spec.rows.forEach(function (r) {
        var g = el("g", { "class": "row" }, svg);
        el("rect", { x: 0, y: y - 18, width: W, height: barH + 24, "class": "hit", rx: 3 }, g);
        text(g, padL, y - 5, r.label, "t-s");
        el("rect", { x: x(0), y: y, width: Math.max(0, x(r.v) - x(0)), height: barH, "class": r.cls }, g);
        if (r.lo != null) whisker(g, x(r.lo), x(r.hi), y + barH / 2, barH / 2 - 5);
        var vt = r.valueText;
        var inside = x(r.v) - x(0) > tw(vt, 13, false) + 40 && r.v > 60;
        if (inside) {
          // value inside a hollow bar's end, else just past the interval
          text(g, x(r.lo != null ? r.lo : r.v) - 8, y + barH / 2 + 4.5, vt, "t-b", "end");
        } else {
          text(g, x(r.hi != null ? Math.max(r.hi, spec.ref ? spec.ref.v : 0) : r.v) + 8, y + barH / 2 + 4.5, vt, "t-b", "start");
        }
        interactive(g, r.tip, r.aria || (r.label + ": " + vt), null);
        if (spec.ref) el("line", { x1: x(spec.ref.v), x2: x(spec.ref.v), y1: y - 1, y2: y + barH + 4, "class": "ref-bound" }, svg);
        y += barH + gap;
      });
      rove(svg);
      if (spec.ref) {
        var rl = spec.ref.label, rx = x(spec.ref.v), fits = rx + 6 + tw(rl, 12, false) < W - 2;
        text(svg, fits ? rx + 6 : rx - 6, 12, rl, "t-b t-s", fits ? "start" : "end");
      }
      var ay = H - 26;
      el("line", { x1: x(0), x2: x(100), y1: ay, y2: ay, "class": "ax" }, svg);
      [0, 25, 50, 75, 100].forEach(function (t) {
        el("line", { x1: x(t), x2: x(t), y1: ay, y2: ay + 4, "class": "ax" }, svg);
        text(svg, x(t), ay + 17, String(t), "t-2 t-s", "middle");
      });
      container.appendChild(document.createElement("p")).className = "small";
      container.lastChild.textContent = spec.axisLabel;
    });
  }

  /* ---------------------------------------------------------------- small multiples of bars (one 0-100 scale) */
  function multiples(container, spec) {
    responsive(container, function (W) {
      container.innerHTML = "";
      var cols = W >= 760 ? spec.panels.length : 1;
      var gapX = 24, pw = (W - gapX * (cols - 1)) / cols;
      var wrap = document.createElement("div");
      wrap.style.display = "grid";
      wrap.style.gridTemplateColumns = "repeat(" + cols + ", minmax(0, 1fr))";
      wrap.style.gap = "14px " + gapX + "px";
      container.appendChild(wrap);
      spec.panels.forEach(function (p) {
        var cell = document.createElement("div");
        wrap.appendChild(cell);
        var h = document.createElement("p");
        h.className = "pm-h";
        h.innerHTML = "<strong>" + esc(p.title) + "</strong><br><span class=\"small\">" + esc(p.sub) + "</span>";
        h.style.margin = "0 0 4px";
        cell.appendChild(h);
        var labW = Math.min(132, pw * 0.4), padR = 64, barH = 18, gap = 10, top = 4;
        var x = linear(0, 100, labW, pw - padR);
        var H = top + p.bars.length * (barH + gap) + 30;
        var svg = el("svg", { viewBox: "0 0 " + pw + " " + H, role: "group", "aria-label": p.title }, cell);
        [0, 50, 100].forEach(function (t) { el("line", { x1: x(t), x2: x(t), y1: top, y2: H - 26, "class": "grid" }, svg); });
        var y = top;
        p.bars.forEach(function (b) {
          var g = el("g", { "class": "row" }, svg);
          el("rect", { x: 0, y: y - 4, width: pw, height: barH + 8, "class": "hit", rx: 3 }, g);
          text(g, labW - 8, y + barH / 2 + 4.5, b.label, "t-s", "end");
          el("rect", { x: x(0), y: y, width: Math.max(0, x(b.v) - x(0)), height: barH, "class": b.cls }, g);
          if (b.lo != null) whisker(g, x(b.lo), x(b.hi), y + barH / 2, barH / 2 - 4);
          text(g, x(Math.max(b.v, b.hi || 0)) + 6, y + barH / 2 + 4.5, b.valueText, "t-s", "start");
          interactive(g, b.tip, b.aria || (p.title + ", " + b.label + ": " + b.valueText), null);
          y += barH + gap;
        });
        rove(svg);
        var ay = H - 22;
        el("line", { x1: x(0), x2: x(100), y1: ay, y2: ay, "class": "ax" }, svg);
        [0, 50, 100].forEach(function (t) {
          el("line", { x1: x(t), x2: x(t), y1: ay, y2: ay + 4, "class": "ax" }, svg);
          text(svg, x(t), ay + 17, String(t), "t-2 t-s", "middle");
        });
      });
      var cap = document.createElement("p");
      cap.className = "small";
      cap.textContent = spec.axisLabel;
      container.appendChild(cap);
    });
  }

  /* ---------------------------------------------------------------- tables */
  function table(container, spec) {
    var t = document.createElement("table");
    t.className = "dtable stack";
    if (spec.caption) { var c = t.createCaption(); c.textContent = spec.caption; }
    var th = t.createTHead().insertRow();
    spec.cols.forEach(function (col) {
      var h = document.createElement("th");
      h.scope = "col";
      h.textContent = col.label;
      if (col.num) h.className = "n";
      th.appendChild(h);
    });
    var tb = t.createTBody();
    spec.rows.forEach(function (r) {
      var tr = tb.insertRow();
      if (r.sel) tr.className = "sel";
      spec.cols.forEach(function (col) {
        var td = tr.insertCell();
        td.setAttribute("data-label", col.label);
        if (col.num) td.className = "n";
        var v = r[col.key];
        if (col.html) td.innerHTML = v == null ? "" : v; else td.textContent = v == null ? "" : v;
      });
    });
    container.appendChild(t);
    return t;
  }

  // A figure with a "Table" toggle: draws the chart, or the same rows as a table.
  function figure(fig, drawChart, tableSpec) {
    var body = fig.querySelector(".chart-body");
    var btn = fig.querySelector(".tbl-btn");
    function show(asTable) {
      body.innerHTML = "";
      var inner = document.createElement("div");
      body.appendChild(inner);
      if (asTable) table(inner, tableSpec()); else drawChart(inner);
    }
    if (btn && !btn._wired) {
      btn._wired = true;
      btn.addEventListener("click", function () {
        var on = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        show(on);
      });
    }
    show(btn && btn.getAttribute("aria-pressed") === "true");
  }

  function legend(items) {
    var d = document.createElement("div");
    d.className = "legend";
    items.forEach(function (it) {
      var s = document.createElement("span");
      s.innerHTML = '<i class="lg lg-' + it.k + '" aria-hidden="true"></i>' + esc(it.label);
      d.appendChild(s);
    });
    return d;
  }

  global.Charts = { dumbbell: dumbbell, tokens: tokens, bars: bars, multiples: multiples, table: table,
                    figure: figure, legend: legend, esc: esc, hideTip: hideTip, showTip: showTip,
                    interactive: interactive };
})(window);
