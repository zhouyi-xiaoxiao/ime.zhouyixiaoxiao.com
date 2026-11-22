/* Keyboard-state input: page logic for the results. Reads data/bundle.json once (or its .js copy when the
   page is opened from a file), then draws the figures and the explorer. Every number shown comes from the
   bundle; nothing is computed here except formatting and choosing which cell to show. The converter and
   the headline flip live in converter.js and do not need the bundle. */
(function () {
  "use strict";
  var B = null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return Charts.esc(s == null ? "" : s); };
  var MINUS = "−";
  function has(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function dict() { return Object.create(null); }

  /* ------------------------------------------------------------------ loading */
  function loadJSON(name) {
    var url = "data/" + name + ".json";
    function viaScript() {
      return new Promise(function (resolve, reject) {
        window.__IME_DATA__ = window.__IME_DATA__ || {};
        if (window.__IME_DATA__[name]) return resolve(window.__IME_DATA__[name]);
        var s = document.createElement("script");
        s.src = "data/" + name + ".js";
        s.onload = function () { window.__IME_DATA__[name] ? resolve(window.__IME_DATA__[name]) : reject(new Error(name)); };
        s.onerror = function () { reject(new Error("cannot load " + name)); };
        document.head.appendChild(s);
      });
    }
    if (location.protocol === "file:" || !window.fetch) return viaScript();
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }).catch(viaScript);
  }

  /* ------------------------------------------------------------------ formatting (null-safe) */
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function pct(v, d) { return fin(v) ? (100 * v).toFixed(d == null ? 1 : d) + "%" : ""; }
  function pctN(v, d) { return fin(v) ? (100 * v).toFixed(d == null ? 1 : d) : ""; }
  function signed(x, d) {
    if (!fin(x)) return "";
    var s = x.toFixed(d == null ? 1 : d);
    if (/^-?0(\.0+)?$/.test(s)) return s.replace("-", "");
    return x > 0 ? "+" + s : MINUS + s.slice(1);
  }
  function ival(ci, scale, d) {
    if (!ci || !fin(ci[0]) || !fin(ci[1])) return "";
    var f = function (v) { var s = (v * scale).toFixed(d == null ? 1 : d); return s.charAt(0) === "-" ? MINUS + s.slice(1) : s; };
    return "[" + f(ci[0]) + ", " + f(ci[1]) + "]";
  }
  function sival(ci, scale, d) {
    if (!ci || !fin(ci[0]) || !fin(ci[1])) return "";
    return "[" + signed(ci[0] * scale, d) + ", " + signed(ci[1] * scale, d) + "]";
  }
  function int(n) { return fin(n) ? Number(n).toLocaleString("en-GB") : ""; }
  function share(k, n) { return fin(k) && fin(n) && n > 0 ? int(k) + " of " + int(n) + " (" + (100 * k / n).toFixed(1) + "%)" : ""; }
  function tok(v) {
    if (!fin(v)) return "not reported";
    if (v >= 100) return Math.round(v).toLocaleString("en-GB");
    return (Math.round(v * 10) / 10).toLocaleString("en-GB");
  }
  function fillText(t) {
    return String(t).replace(/\{\{([^}]+)\}\}/g, function (m, k) { return has(B.numbers, k) ? B.numbers[k].text : m; });
  }
  function cp(id) { return has(B.copy, id) ? fillText(B.copy[id].text) : ""; }
  function num(k) { return has(B.numbers, k) ? B.numbers[k].text : ""; }
  function chanceLabel() { return cp("lab_chance") + " " + num("layout.chance"); }
  function chanceRef() { return { v: B.numbers["layout.chance"].value, cls: "ref-chance", label: chanceLabel(), side: "left" }; }
  function stChip(st) { return '<span class="st st-' + esc(st) + '">' + esc(st) + "</span>"; }

  /* ------------------------------------------------------------------ indexes over the bundle (no prototype keys) */
  var I = {};
  function index() {
    I.set = dict(); B.settings.forEach(function (s) { I.set[s.id] = s; });
    I.model = dict(); B.models.forEach(function (m) { I.model[m.key] = m; });
    I.lang = dict(); B.languages.forEach(function (l) { I.lang[l.code] = l; });
    I.arm = dict(); B.arms.forEach(function (a) { I.arm[a.id] = a; });
    I.run = dict(); B.runs.forEach(function (r) { I.run[r.id] = r; });
    I.cells = dict(); I.bySetting = dict(); I.langArm = dict(); I.settingArm = dict();
    var rank = { final: 3, interim: 2, pilot: 1 };
    B.cells.forEach(function (c) {
      var k = c.setting + "|" + c.lang + "|" + c.arm + "|" + (c.scope || "full");
      (I.cells[k] = I.cells[k] || []).push(c);
      (I.bySetting[c.setting] = I.bySetting[c.setting] || []).push(c);
      I.langArm[c.lang + "|" + c.arm] = true;
      I.settingArm[c.setting + "|" + c.arm] = true;
    });
    Object.keys(I.cells).forEach(function (k) {
      I.cells[k].sort(function (a, b) { return (rank[b.status] || 0) - (rank[a.status] || 0) || (b.date > a.date ? 1 : -1); });
    });
    I.zh = dict(); ((B.zh || {}).per_setting || []).forEach(function (p) { I.zh[p.setting] = p; });
    I.contrast = dict(); (B.contrasts || []).forEach(function (c) { I.contrast[c.id] = c; });
  }
  function cellsOf(s, l, a) { return I.cells[s + "|" + l + "|" + a + "|full"] || []; }
  function cellOf(s, l, a) { return cellsOf(s, l, a)[0] || null; }
  function setLabel(s) { return s.model_id + " " + s.level_label; }
  function langName(l, withNative) {
    if (!l) return "";
    var n = l.name_en || l.code;
    if (l.romanised_variant) n += " (" + (l.script_name || "Latin") + " script)";
    if (withNative && l.name_native && l.name_native !== l.name_en) n += " · " + l.name_native;
    return n;
  }
  function langHTML(l) {
    if (!l) return "";
    var s = esc(langName(l, false));
    if (l.name_native && l.name_native !== l.name_en) s += ' <span lang="' + esc(l.bcp47) + '" dir="' + esc(l.dir) + '">' + esc(l.name_native) + "</span>";
    return s;
  }
  // The wrong-layout arm is a cipher for English and a near-identity layout for German and French.
  function armLabel(arm, lang, short) {
    var a = I.arm[arm], l = I.lang[lang], fam = l && l.layout_family;
    if (!a) return arm;
    if (arm === "kb_layout_keys" && fam === "shift") return short ? "keys shifted right" : "Keys shifted right (a cipher)";
    if (arm === "kb_layout_keys" && fam === "near-identity") return short ? "wrong layout (near-identity)" : "Wrong layout (near-identity)";
    if (arm === "kb_layout_keys" && fam === "greek") return short ? "wrong layout (phonetic)" : "Wrong layout (phonetic layout)";
    return short ? a.short : a.label;
  }
  function familyNote(lang) {
    var l = I.lang[lang];
    return l && l.layout_family && has(B.layout_families, l.layout_family) && l.layout_family !== "cross-script" ? B.layout_families[l.layout_family].note : "";
  }

  /* ------------------------------------------------------------------ what a missing cell means */
  // Never a guess: reported pooled only (the pilot ran it; its summary gives one pooled number), not part
  // of the design (no run builds this typed form for this language), not planned for this setting (smoke
  // check failed, a pilot-only setting, or the plan keeps the model out), or not run yet.
  function missing(s, lang, arm) {
    var a = I.arm[arm] || {}, l = I.lang[lang];
    if (!s.planned && !s.has_cells) {
      return { kind: "notplanned", short: "not planned", text: s.smoke === "fail"
        ? "Not planned: this setting did not pass the registry's 5-call smoke check (" + (s.smoke_note || "") + "), so the main run leaves it out."
        : "Not planned: the main run leaves this setting out." };
    }
    var po = (B.design.pilot_pooled_only || []).filter(function (p) { return p.setting === s.id && p.arm === arm && p.langs.indexOf(lang) >= 0; })[0];
    if (po) return { kind: "pooled", short: "pooled only", link: { lang: po.pooled, arm: arm },
                     text: "Reported pooled only: the pilot ran this form on " + langName(l) + ", but its summary gives one number over the six cross-script layouts." };
    if (!s.planned) return { kind: "notplanned", short: "not planned", text: "Not planned: a pilot-only setting (thinking off was requested, and the model does not honour it)." };
    var rule = (B.design.not_planned || []).filter(function (r) { return r.model_key === s.model_key && a.kind === r.arms_kind; })[0];
    if (rule) return { kind: "notplanned", short: "not planned", text: "Not planned: " + rule.why + "." };
    var built = has(B.design.built, lang) ? B.design.built[lang] : [];
    if (built.indexOf(arm) < 0 && !I.langArm[lang + "|" + arm]) {
      return { kind: "notdesign", short: "not in the design", text: "Not part of the design: no run builds this typed form for " + langName(l) + "." };
    }
    return { kind: "notrun", short: "not run yet", text: "Not run yet: there is no result for this setting here. Nothing is filled in." };
  }

  /* ------------------------------------------------------------------ theme */
  function initTheme() {
    var btn = $("#theme-btn");
    if (!btn) return;
    var root = document.documentElement;
    var order = ["auto", "light", "dark"];
    var names = { auto: "Auto", light: "Light", dark: "Dark" };
    function paint() {
      var t = root.getAttribute("data-theme") || "auto";
      btn.querySelector(".theme-txt").textContent = names[t];
      btn.setAttribute("aria-label", "Colour theme: " + (t === "auto" ? "follows the system" : names[t].toLowerCase()) + ". Change");
      $$('meta[name="theme-color"]').forEach(function (m) {
        var dk = /dark/.test(m.getAttribute("media") || "");
        m.setAttribute("content", t === "auto" ? (dk ? "#141414" : "#ffffff") : (t === "dark" ? "#141414" : "#ffffff"));
      });
    }
    btn.addEventListener("click", function () {
      var t = root.getAttribute("data-theme") || "auto";
      var n = order[(order.indexOf(t) + 1) % order.length];
      root.setAttribute("data-theme", n);
      try { if (n === "auto") localStorage.removeItem("theme"); else localStorage.setItem("theme", n); } catch (e) {}
      paint();
    });
    paint();
  }

  /* ------------------------------------------------------------------ findings: Figure A */
  function figARows() {
    var rows = [];
    B.settings.forEach(function (s) {
      var a = cellOf(s.id, "pool_cross6", "native"), b = cellOf(s.id, "pool_cross6", "kb_layout_keys");
      if (!a || !b || b.subset || /^claude-haiku/.test(s.model_id)) return;
      var oc = b.outcomes || {};
      var dag = fin(oc.truncated) && oc.truncated >= 0.1 * b.calls;
      rows.push(dumbRow(s, a, b, "typed", dag, "pool_cross6"));
    });
    rows.forEach(function (r) { r.group = r.s.reasoning === "off" ? "off" : "on"; });
    rows.sort(function (x, y) { return y.b.v - x.b.v; });
    return rows;
  }
  function mark(c, cls) {
    return c ? { v: 100 * c.acc, lo: c.ci && 100 * c.ci[0], hi: c.ci && 100 * c.ci[1], cls: cls, text: pctN(c.acc) } : null;
  }
  // A row of the dumbbell charts. With the arm "as written" there is one form only (single), so nothing is missing.
  function dumbRow(s, a, b, cls, dag, lang) {
    var single = !!(b && b.arm === "native");
    var r = { key: s.id, s: s, label: s.model_id, mono: true, sub: s.level_label, mark: dag ? "†" : "", single: single,
              a: single ? mark(b) : mark(a), b: single ? null : mark(b, cls) };
    if (!single && !a) r.bMissing = "as written: " + missing(s, lang, "native").short;
    r.tip = cellTip(s, single ? null : a, b, lang);
    r.aria = setLabel(s) + ": " + (single ? "as written " + pct(b.acc) : "as written " + (a ? pct(a.acc) : missing(s, lang, "native").short) +
             ", " + armLabel(b.arm, lang, true) + " " + pct(b.acc));
    return r;
  }
  function cellLine(c, name) {
    var t = esc(name) + ": <strong>" + pct(c.acc) + "</strong> " + ival(c.ci, 100) + ", " + int(c.items) + " items, " + int(c.calls) + " calls";
    if (fin(c.no_valid)) t += "; no valid answer " + int(c.no_valid);
    return t;
  }
  function cellTip(s, a, b, lang) {
    var h = '<strong class="mid">' + esc(s.model_id) + "</strong> " + esc(s.level_label);
    if (a) h += "<br>" + cellLine(a, "as written");
    if (b) h += "<br>" + cellLine(b, b.arm === "native" ? "as written" : armLabel(b.arm, lang, true));
    var c = b || a;
    if (c && c.subset) h += "<br>On " + esc(c.subset) + ".";
    if (c) h += "<br>" + stChip(c.status) + " " + esc(I.run[c.run] ? I.run[c.run].label + ", " + I.run[c.run].date : c.run);
    return h;
  }
  function tokenTip(s, a, b, lang) {
    var h = '<strong class="mid">' + esc(s.model_id) + "</strong> " + esc(s.level_label) + "<br>reasoning tokens per call, as each API reports them:";
    function l(c, name) {
      if (!c) return "";
      var rt = c.reasoning_tokens || {};
      return "<br>" + esc(name) + ": mean " + tok(rt.mean) + (fin(rt.median) ? ", median " + tok(rt.median) : "") + " (" + int(c.items) + " items, " + int(c.calls) + " calls)";
    }
    h += l(a, "as written") + l(b, b && b.arm === "native" ? "as written" : armLabel(b ? b.arm : "", lang, true));
    return h + "<br>The summaries give no interval for these.";
  }
  function tokenRow(r, a, b, lang, cls) {
    var single = !!(b && b.arm === "native");
    var am = a && a.reasoning_tokens ? a.reasoning_tokens.mean : null, bm = b && b.reasoning_tokens ? b.reasoning_tokens.mean : null;
    if (single) { am = bm; bm = null; }
    return { key: r.key, s: r.s, label: r.label, mono: true, sub: r.sub, group: r.group, single: single,
             a: fin(am) ? { v: am } : null, b: fin(bm) ? { v: bm, cls: cls } : null,
             tip: tokenTip(r.s, single ? null : a, b, lang),
             aria: setLabel(r.s) + ": reasoning tokens per call, " + (single ? "as written " + tok(am) : "as written " + tok(am) + ", " + armLabel(b ? b.arm : "", lang, true) + " " + tok(bm)) };
  }
  var TOKEN_NOTE = "Means per call; the summaries give no interval for reasoning tokens.";
  function wide() { return window.matchMedia("(min-width: 900px)").matches; }
  // On a narrow screen a secondary chart or block folds into a <details>; from 900 px it is open.
  function fold(parent, title) {
    var d = document.createElement("details");
    d.className = "fold";
    if (wide()) d.open = true;
    var sm = document.createElement("summary");
    sm.textContent = title;
    d.appendChild(sm);
    parent.appendChild(d);
    return d;
  }
  function drawFigA() {
    var fig = $("#figA");
    if (!fig) return;
    var rows = figARows();
    var floor = B.numbers["layout.floor"], chance = B.numbers["layout.chance"];
    var groups = [{ id: "on", label: cp("lab_reasoning_on") }, { id: "off", label: cp("lab_reasoning_off") }];
    Charts.figure(fig, function (inner) {
      inner.appendChild(Charts.legend([
        { k: "native", label: cp("lab_native") }, { k: "typed", label: cp("lab_wrong") },
        { k: "floor", label: cp("lab_floor") + " " + floor.text }, { k: "chance", label: cp("lab_chance") + " " + chance.text }]));
      var pair = document.createElement("div");
      pair.className = "chart-pair";
      inner.appendChild(pair);
      var left = document.createElement("div"), right = document.createElement("div");
      pair.appendChild(left); pair.appendChild(right);
      var side = function () { return window.matchMedia("(min-width: 900px)").matches; };
      Charts.dumbbell(left, {
        rows: rows, groups: groups, min: 0, max: 100, ticks: [0, 25, 50, 75, 100], axisLabel: (cp("lab_accuracy") || "accuracy (%)") + ", 95% intervals",
        refs: [{ v: floor.value, cls: "ref-floor", label: cp("lab_floor") + " " + floor.text, side: "right" },
               { v: chance.value, cls: "ref-chance", label: cp("lab_chance") + " " + chance.text, side: "left" }],
        aria: "Figure A: accuracy on native text and on wrong-layout text per setting",
        pick: function (r) { goExplore({ view: "model", model: r.s.model_key, level: r.s.level, lang: "pool_cross6", arm: "kb_layout_keys" }); },
      });
      var trows = rows.map(function (r) {
        return tokenRow(r, cellOf(r.s.id, "pool_cross6", "native"), cellOf(r.s.id, "pool_cross6", "kb_layout_keys"), "pool_cross6", "typed");
      });
      var tbox = document.createElement("div");
      fold(right, "Reasoning tokens per call").appendChild(tbox);
      Charts.tokens(tbox, { rows: trows, groups: groups, axisLabel: "per call, log scale; 0 at the left. " + TOKEN_NOTE, side: side, dropZero: true,
                            title: "reasoning tokens per call", aria: "Reasoning tokens per call on native and on wrong-layout text" });
    }, function () {
      return { caption: "Figure A as a table: " + I.lang.pool_cross6.name_en + ", " + int(cellOf(rows[0].s.id, "pool_cross6", "native").items) +
                        " items and calls per cell; intervals 95%; reasoning tokens are means (no interval in the summaries).",
        cols: [{ key: "set", label: "setting", html: true }, { key: "n", label: "as written", num: true }, { key: "l", label: "wrong layout", num: true },
               { key: "c", label: "change, points", num: true }, { key: "nv", label: "no valid answer", num: true }, { key: "rt", label: "reasoning tokens per call, wrong layout (mean)", num: true }],
        rows: rows.map(function (r) {
          var a = cellOf(r.s.id, "pool_cross6", "native"), b = cellOf(r.s.id, "pool_cross6", "kb_layout_keys");
          var con = I.contrast["layout_minus_native|" + r.s.id + "|pool_cross6"];
          return { set: '<span class="mid">' + esc(r.s.model_id) + "</span> " + esc(r.s.level_label) + (r.mark ? " †" : ""),
                   n: pct(a.acc) + " " + ival(a.ci, 100), l: pct(b.acc) + " " + ival(b.ci, 100),
                   c: con ? signed(100 * con.est) + " " + sival(con.ci, 100) : "", nv: fin(b.no_valid) ? int(b.no_valid) + " of " + int(b.calls) : "not split",
                   rt: b.reasoning_tokens ? tok(b.reasoning_tokens.mean) : "" };
        }) };
    });
  }

  /* ------------------------------------------------------------------ findings: Figures D and E (Chinese) */
  function drawFigD() {
    var fig = $("#figD");
    var f = B.zh.forced.filter(function (x) { return x.id !== "sentence_rarer_word"; });
    var labels = { word_alone_one_call: cp("lab_one_call"), word_alone_three_calls: cp("lab_three_calls"), sentence: cp("lab_sentence"),
                   sentence_rarer_word: "in a sentence, the rarer word is the answer" };
    var rows = f.map(function (x) {
      var v = x.pct;
      return { label: labels[x.id] || x.label, v: v, lo: x.ci && x.ci[0], hi: x.ci && x.ci[1], cls: x.id === "sentence" ? "m-outline-typed" : "m-typed",
               valueText: v.toFixed(1) + "% " + ival(x.ci, 1),
               tip: "<strong>" + esc(labels[x.id] || x.label) + "</strong><br>" + int(x.k) + " of " + int(x.n) + " calls correct: " + v.toFixed(1) + "% " + ival(x.ci, 1) +
                    "<br>" + esc(B.methods[x.ci_method] || "") + "<br>" + stChip("pilot") + " " + esc(I.run[x.run].label) };
    });
    Charts.figure(fig, function (inner) {
      Charts.bars(inner, { rows: rows, ref: { v: B.zh.bound_pct, label: cp("lab_bound") + " " + num("zh.bound") },
                           axisLabel: cp("lab_correct") || "forced choice, % correct", aria: "Figure D" });
    }, function () {
      return { caption: "Figure D as a table. The last row, the sentence items whose answer is the rarer word, is not drawn in the chart.",
               cols: [{ key: "l", label: "items" }, { key: "kn", label: "correct of calls", num: true }, { key: "ci", label: "95% interval over classes", num: true }],
               rows: B.zh.forced.map(function (x) { return { l: labels[x.id] || x.label, kn: share(x.k, x.n), ci: ival(x.ci, 1) }; }) };
    });
  }
  var FMT = [["open", "lab_fmt_open"], ["free", "lab_fmt_free"], ["ab", "lab_fmt_ab"]];
  var SENT = [["none", "lab_arm_none", "m-none"], ["control", "lab_arm_control", "m-ctrl"], ["note", "lab_arm_note", "m-told"]];
  function outcomeWords(o) { return o === "answers 0" ? "that answer 0" : "that say so"; }
  function drawFigE() {
    var fig = $("#figE");
    function row(f, s) { return B.zh.flag.filter(function (x) { return x.format === f && x.sentence === s; })[0]; }
    Charts.figure(fig, function (inner) {
      inner.appendChild(Charts.legend([{ k: "none", label: cp("lab_arm_none") }, { k: "ctrl", label: cp("lab_arm_control") }, { k: "told", label: cp("lab_arm_note") }]));
      var box = document.createElement("div");
      inner.appendChild(box);
      Charts.multiples(box, {
        axisLabel: "% of calls that say so or answer 0; " + int(row("open", "none").n) + " calls per bar; brackets: 95% interval over the classes",
        panels: FMT.map(function (fm) {
          return { title: cp(fm[1]), sub: fm[0] === "ab" ? "answers 0" : "says the text does not settle the answer",
            bars: SENT.map(function (sx) {
              var r = row(fm[0], sx[0]);
              return { label: cp(sx[1]), v: r.pct, lo: r.ci[0], hi: r.ci[1], cls: sx[2], valueText: r.pct.toFixed(1) + "%",
                       tip: "<strong>" + esc(cp(fm[1])) + ", " + esc(cp(sx[1])) + "</strong><br>" + int(r.k) + " of " + int(r.n) +
                            " calls " + outcomeWords(r.outcome) + ": " + r.pct.toFixed(1) + "% " + ival(r.ci, 1) +
                            (r.bare ? "<br>bare option numbers: " + r.bare.pct.toFixed(1) + "%" : "") +
                            "<br>on items the text does settle: " + int(r.determined.k) + " of " + int(r.determined.n) + "<br>" + stChip("pilot") + " Chinese follow-up" };
            }) };
        }) });
    }, function () {
      var rows = [];
      FMT.forEach(function (fm) { SENT.forEach(function (sx) {
        var r = row(fm[0], sx[0]);
        rows.push({ f: cp(fm[1]), s: cp(sx[1]), kn: share(r.k, r.n), ci: ival(r.ci, 1), d: share(r.determined.k, r.determined.n) });
      }); });
      return { caption: "Figure E as a table: the " + num("zh.u_items") + " word-alone items, " + num("zh.fc3.per_cell") + " calls per item, " + num("zh.settings") + " settings.",
               cols: [{ key: "f", label: "reply format" }, { key: "s", label: "sentence before the item" }, { key: "kn", label: "calls that say so or answer 0", num: true },
                      { key: "ci", label: "95% interval over classes", num: true }, { key: "d", label: "same, on items the text settles", num: true }],
               rows: rows };
    });
  }

  /* ------------------------------------------------------------------ explorer state and URL */
  var DEFAULTS = { view: "model", model: "gpt_6_1_terra", level: "off", lang: "pool_cross6", arm: "kb_layout_keys" };
  var S = { view: DEFAULTS.view, model: DEFAULTS.model, level: DEFAULTS.level, lang: DEFAULTS.lang, arm: DEFAULTS.arm,
            vendors: null, ow: false, reason: "all", sort: "typed" };
  var VIEWS = ["model", "compare", "languages", "chinese"];
  var KEYS = ["view", "model", "level", "lang", "arm"];
  var booted = false, notice = "";
  function firstLevel(model) {
    var lv = I.model[model].settings.map(function (x) { return I.set[x]; });
    return (lv.filter(function (s) { return s.has_cells; })[0] || lv[0]).level;
  }
  function describe() { var s = curSet(); return setLabel(s) + ", " + langName(I.lang[S.lang]) + ", " + armLabel(S.arm, S.lang, true); }
  // Read the state from the address; anything that has no entry is replaced, and a notice names it.
  function readURL() {
    var q = new URLSearchParams(location.search), bad = [];
    var v = q.get("view"), m = q.get("model"), lv = q.get("level"), lg = q.get("lang"), ar = q.get("arm");
    var q1 = function (x) { return "“" + x + "”"; };
    S.view = v && VIEWS.indexOf(v) >= 0 ? v : DEFAULTS.view; if (v && VIEWS.indexOf(v) < 0) bad.push("the view " + q1(v));
    var mOK = m && has(I.model, m);
    S.model = mOK ? m : DEFAULTS.model; if (m && !mOK) bad.push("the model " + q1(m));
    if (lv && (mOK || !m) && has(I.set, S.model + "=" + lv)) S.level = lv;
    else if (m && !mOK) { S.level = DEFAULTS.level; if (lv) bad.push("its level " + q1(lv)); }
    else {
      if (lv && (!m || mOK)) bad.push("the level " + q1(lv));
      S.level = mOK ? firstLevel(S.model) : (has(I.set, S.model + "=" + DEFAULTS.level) ? DEFAULTS.level : firstLevel(S.model));
    }
    S.lang = lg && has(I.lang, lg) ? lg : DEFAULTS.lang; if (lg && !has(I.lang, lg)) bad.push("the language " + q1(lg));
    S.arm = ar && has(I.arm, ar) ? ar : DEFAULTS.arm; if (ar && !has(I.arm, ar)) bad.push("the typed form " + q1(ar));
    notice = bad.length ? "The link asked for " + bad.join(", ") + ", which has no entry here; showing " : "";
    return !!(v || m);
  }
  function writeURL(push) {
    var q = new URLSearchParams(location.search);  // other parameters (for example theme) are kept
    KEYS.forEach(function (k) { q.set(k, S[k]); });
    var url = "?" + q.toString();
    if (url === location.search) return;
    try { history[push ? "pushState" : "replaceState"]({ ime: true }, "", url + (location.hash || "")); } catch (e) {}
  }
  function curSet() { return I.set[S.model + "=" + S.level]; }
  function goExplore(st) {
    for (var k in st) if (has(st, k)) S[k] = st[k];
    renderExplorer(true);
    var ex = $("#explore");
    if (ex) ex.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  /* ------------------------------------------------------------------ explorer controls */
  function buildControls() {
    var sm = $("#sel-model");
    var byVendor = dict();
    B.models.forEach(function (m) { (byVendor[m.vendor] = byVendor[m.vendor] || []).push(m); });
    Object.keys(byVendor).sort().forEach(function (v) {
      var og = document.createElement("optgroup");
      og.label = v;
      byVendor[v].sort(function (a, b) { return a.model_id.localeCompare(b.model_id); }).forEach(function (m) {
        var o = document.createElement("option");
        o.value = m.key;
        var sets = m.settings.map(function (x) { return I.set[x]; });
        var hasData = sets.some(function (x) { return x.has_cells; });
        var planned = sets.some(function (x) { return x.planned; });
        o.textContent = m.model_id + (hasData ? "" : planned ? " · not run yet" : " · not planned");
        og.appendChild(o);
      });
      sm.appendChild(og);
    });
    sm.addEventListener("change", function () {
      S.model = sm.value;
      var lv = I.model[S.model].settings.map(function (x) { return I.set[x]; });
      var keep = lv.filter(function (s) { return s.level === S.level; })[0];
      S.level = (keep || lv.filter(function (s) { return s.has_cells; })[0] || lv[0]).level;
      renderExplorer(true);
    });
    $("#sel-lang").addEventListener("change", function () { S.lang = this.value; renderExplorer(false); });
    $$('.tabs [role="tab"]').forEach(function (t, i, all) {
      t.addEventListener("click", function () { S.view = t.id.replace("tab-", ""); renderExplorer(true); });
      t.addEventListener("keydown", function (e) {
        var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = all[(i + d + all.length) % all.length];
        S.view = n.id.replace("tab-", ""); renderExplorer(true); n.focus();
      });
    });
    window.addEventListener("popstate", function () { readURL(); renderExplorer(null); });
  }
  function radioGroup(box, items, value, onPick) {
    box.innerHTML = "";
    items.forEach(function (it) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "seg" + (it.state ? " st-" + it.state : "");
      b.setAttribute("role", "radio");
      b.setAttribute("data-value", it.value);
      b.setAttribute("aria-checked", it.value === value ? "true" : "false");
      b.setAttribute("tabindex", it.value === value ? "0" : "-1");
      b.innerHTML = esc(it.label) + (it.stateText ? '<span class="sr-only"> (' + esc(it.stateText) + ")</span>" : "");
      if (it.title) b.title = it.title;
      b.addEventListener("click", function () { onPick(it.value); });
      b.addEventListener("keydown", function (e) {
        var d = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1 : (e.key === "ArrowLeft" || e.key === "ArrowUp") ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var k = items.map(function (x) { return x.value; }).indexOf(value);
        onPick(items[(k + d + items.length) % items.length].value);
      });
      box.appendChild(b);
    });
  }
  // Typed forms offered for a language: as written, then every form that has a result here for any
  // setting or that the main run builds for this language, in the order of the arm list.
  function armsFor(lang) {
    var built = has(B.design.built, lang) ? B.design.built[lang] : [];
    return B.arms.map(function (a) { return a.id; }).filter(function (a) {
      return a === "native" || I.langArm[lang + "|" + a] || built.indexOf(a) >= 0;
    });
  }
  // In the Languages view the language control is hidden: offer every form this setting has anywhere.
  function armsForSetting(s) {
    return B.arms.map(function (a) { return a.id; }).filter(function (a) { return a === "native" || I.settingArm[s.id + "|" + a]; });
  }
  function syncControls() {
    var s = curSet();
    $("#sel-model").value = S.model;
    var lv = I.model[S.model].settings.map(function (x) { return I.set[x]; }).sort(function (a, b) { return a.level_order - b.level_order; });
    radioGroup($("#sel-level"), lv.map(function (x) {
      var st = x.has_cells ? null : x.planned ? "notrun" : "notplanned";
      return { value: x.level, label: x.level_label, state: st, stateText: st ? (st === "notrun" ? "not run yet" : "not planned") : "" };
    }), S.level, function (v) { S.level = v; renderExplorer(true); });
    // languages: pooled, with a result for this setting, then every other variant
    var sl = $("#sel-lang");
    sl.innerHTML = "";
    var measured = dict();
    (I.bySetting[s.id] || []).forEach(function (c) { measured[c.lang] = true; });
    var langs = B.languages.slice().sort(function (a, b) { return langName(a).localeCompare(langName(b)); });
    [["Pooled", langs.filter(function (l) { return l.kind === "pool"; })],
     ["With a result for this setting", langs.filter(function (l) { return l.kind !== "pool" && measured[l.code]; })],
     ["No result yet for this setting", langs.filter(function (l) { return l.kind !== "pool" && !measured[l.code]; })]].forEach(function (g) {
      if (!g[1].length) return;
      var og = document.createElement("optgroup");
      og.label = g[0];
      g[1].forEach(function (l) {
        var o = document.createElement("option");
        o.value = l.code;
        o.textContent = langName(l, true) + (l.kind === "pool" ? "" : "  (" + l.code + ")");
        og.appendChild(o);
      });
      sl.appendChild(og);
    });
    sl.value = S.lang;
    var arms = S.view === "languages" ? armsForSetting(s) : armsFor(S.lang);
    if (arms.indexOf(S.arm) < 0) {
      if (S.view === "languages") arms.push(S.arm);  // a valid form from the link stays selected
      else S.arm = arms.indexOf("kb_layout_keys") >= 0 ? "kb_layout_keys" : arms[1] || "native";
    }
    var lang = S.view === "languages" ? null : S.lang;
    var seen = dict();
    radioGroup($("#sel-arm"), arms.map(function (a) {
      var st = lang ? (cellOf(s.id, lang, a) ? null : missing(s, lang, a)) : (I.settingArm[s.id + "|" + a] ? null : { kind: "notrun", short: "no result in any language" });
      if (st) seen[st.kind] = true;
      return { value: a, label: lang ? armLabel(a, lang, true) : I.arm[a].short, state: st ? st.kind : null, stateText: st ? st.short : "",
               title: I.arm[a].what };
    }), S.arm, function (v) { S.arm = v; renderExplorer(false); });
    lv.forEach(function (x) { if (!x.has_cells) seen[x.planned ? "notrun" : "notplanned"] = true; });
    var keys = [["notrun", "dashed: not run yet"], ["pooled", "dotted: reported pooled only"], ["notdesign", "grey: not part of the design"], ["notplanned", "struck through: not planned for this setting"]];
    var parts = keys.filter(function (k) { return seen[k[0]]; }).map(function (k) { return '<span class="chip-key st-' + k[0] + '" aria-hidden="true"></span>' + esc(k[1]); });
    $("#ctl-legend").innerHTML = parts.length ? "<span>Solid button: has a result.</span> " + parts.map(function (p) { return "<span>" + p + "</span>"; }).join(" ") : "";
    var show = { model: ["model", "level", "lang", "arm"], compare: ["lang", "arm"], languages: ["model", "level", "arm"], chinese: ["model", "level"] }[S.view];
    $$("#ctl [data-for]").forEach(function (f) { f.hidden = show.indexOf(f.getAttribute("data-for")) < 0; });
    $$('.tabs [role="tab"]').forEach(function (t) {
      var on = t.id === "tab-" + S.view;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.setAttribute("tabindex", on ? "0" : "-1");
    });
    VIEWS.forEach(function (v) { $("#view-" + v).hidden = v !== S.view; });
  }
  // Re-rendering replaces the controls; the control that had the focus gets it back.
  function focusKey() {
    var a = document.activeElement;
    if (!a || a === document.body || !$("#explore").contains(a)) return null;
    if (a.id) return "#" + a.id;
    var grp = a.parentNode && a.parentNode.id ? a.parentNode : null;
    if (a.getAttribute("data-value") != null && grp) return "#" + grp.id;
    if (a.getAttribute("data-vendor") != null) return '[data-vendor="' + a.getAttribute("data-vendor").replace(/"/g, "") + '"]';
    return null;
  }
  function restoreFocus(key) {
    if (!key) return;
    var el = null;
    try { el = $(key); } catch (e) { el = null; }
    if (el && el.getAttribute("role") === "radiogroup") el = $('[aria-checked="true"]', el) || el.firstElementChild;
    if (el && el.focus && el.offsetParent !== null) el.focus({ preventScroll: true });
  }
  // push: true = a new history entry (view, model or level changed); false = replace; null = from history
  function renderExplorer(push) {
    var fk = focusKey();
    Charts.hideTip();
    try {
      syncControls();
      ({ model: viewModel, compare: viewCompare, languages: viewLanguages, chinese: viewChinese })[S.view]();
    } catch (e) {
      console.error(e);
      notice = "This view could not be drawn; showing the default view instead.";
      for (var k in DEFAULTS) S[k] = DEFAULTS[k];
      syncControls();
      viewModel();
    }
    var nb = $("#explore-notice");
    if (notice) { nb.textContent = /showing $/.test(notice) ? notice + describe() + "." : notice; nb.hidden = false; }
    else nb.hidden = true;
    if (booted && push !== null) writeURL(push);  // the address changes only once the visitor uses the explorer
    else if (!booted && notice) writeURL(false);  // a link with a bad entry is rewritten to what is shown
    notice = "";
    restoreFocus(fk);
  }

  /* ------------------------------------------------------------------ view: one model */
  function accBox(c, title, cls, miss) {
    if (!c) return '<div class="acc-box"><p class="lbl"><i class="lg lg-' + cls + '" aria-hidden="true"></i>' + esc(title) + '</p><p class="bigacc">—</p><p class="meta">' + esc(miss ? miss.short : "not run yet") + "</p></div>";
    return '<div class="acc-box"><p class="lbl"><i class="lg lg-' + cls + '" aria-hidden="true"></i>' + esc(title) + "</p>" +
      '<p class="bigacc num">' + pct(c.acc) + '</p><p class="ci-txt">95% interval <span class="nw">' + ival(c.ci, 100) + "</span></p>" +
      '<p class="meta">' + int(c.items) + " items · " + int(c.calls) + " calls · " + stChip(c.status) + "</p></div>";
  }
  function titleHTML(s, sub) {
    return '<h3 class="d-title"><span class="mid">' + esc(s.model_id) + "</span> " + esc(s.level_label) + "</h3>" + (sub ? '<p class="d-sub">' + sub + "</p>" : "");
  }
  function settingSub(s) {
    var bits = [esc(s.vendor)];
    if (s.open_weights) bits.push("open weights" + (s.open_weights_repo ? ' (<span class="mid">' + esc(s.open_weights_repo) + "</span>)" : ""));
    return bits.join(" · ");
  }
  function viewModel() {
    var v = $("#view-model"), s = curSet(), l = I.lang[S.lang], arm = I.arm[S.arm];
    var c = cellOf(s.id, S.lang, S.arm), n = S.arm === "native" ? null : cellOf(s.id, S.lang, "native");
    var h = titleHTML(s, settingSub(s) + " · " + langHTML(l) + " · " + esc(armLabel(S.arm, S.lang, false)));
    if (!c) {
      var m = missing(s, S.lang, S.arm), have = (I.bySetting[s.id] || []);
      var i = m.text.indexOf(":"), rest = m.text.slice(i + 1).trim();
      h += '<div class="notrun notrun-' + m.kind + '"><strong>' + esc(m.text.slice(0, i)) + ".</strong> " + esc(rest.charAt(0).toUpperCase() + rest.slice(1));
      if (m.link && cellOf(s.id, m.link.lang, m.link.arm)) {
        var pc = cellOf(s.id, m.link.lang, m.link.arm);
        h += ' <button type="button" class="linkbtn" data-lang="' + esc(m.link.lang) + '" data-arm="' + esc(m.link.arm) + '">Show the pooled result (' + pct(pc.acc) + ", " + int(pc.items) + " items)</button>";
      }
      h += "</div>";
      if (have.length) {
        h += otherList(have.filter(function (x) { return x.arm === S.arm && x.lang !== S.lang; }), "lang", armLabel(S.arm, S.lang, false) + " in other languages for this setting") +
             otherList(have.filter(function (x) { return x.lang === S.lang; }), "arm", "Other forms of " + langName(l) + " for this setting");
        if (!have.some(function (x) { return x.arm === S.arm || x.lang === S.lang; })) h += otherList(have.filter(function (x) { return x.lang === "pool_cross6"; }), "both", "Results of this setting");
      } else if (s.planned) {
        h += '<p class="small">No result of this setting has been reported yet. It is one of the ' + esc(num("site.planned")) + " registered settings that passed the smoke check, which the main run plans to run on fewer items and forms (exploratory).</p>";
      }
      v.innerHTML = h;
      wireOthers(v);
      return;
    }
    var told = arm.told ? "told" : "typed";
    var nMiss = S.arm !== "native" && !n ? missing(s, S.lang, "native") : null;
    h += '<div class="acc-pair' + (S.arm === "native" ? " one" : "") + '">' + (S.arm !== "native" ? accBox(n, "As written", "native", nMiss) + accBox(c, armLabel(S.arm, S.lang, false), told) : accBox(c, "As written", "native")) + "</div>";
    if (n && c && n.items !== c.items) h += '<p class="small warn">The two numbers rest on different items: ' + int(n.items) + " as written, " + int(c.items) + " " + esc(armLabel(S.arm, S.lang, true)) + ". See the note under About this number.</p>";
    h += '<div id="m-legend"></div><div class="chart-body" id="m-chart"></div>';
    var cons = B.contrasts.filter(function (x) { return x.setting === s.id && x.lang === S.lang && (x.a === S.arm || x.b === S.arm); });
    h += '<div class="d-grid"><div>';
    if (cons.length) {
      h += "<h4>Differences</h4>";
      cons.forEach(function (x) {
        h += '<div class="kv"><span class="k-l">' + esc(x.label) + (x.note ? '<br><span class="small">' + esc(x.note) + "</span>" : "") +
             (x.subset ? '<br><span class="small">On ' + esc(x.subset) + ".</span>" : "") +
             '</span><span class="k-v"><strong class="num">' + signed(100 * x.est) + " points</strong><br><span class=\"ci-txt\">" + sival(x.ci, 100) + "</span></span></div>";
      });
      h += '<p class="small">' + esc(B.methods[cons[0].ci_method] || cons[0].ci_method || "") + "</p>";
    }
    h += "<h4>How the calls ended</h4>" + outcomes(c, s);
    var op = wide() ? " open" : "";
    h += '</div><div><details class="fold"' + op + "><summary>Tokens and time</summary>" + tokensTime(n, c) + "</details>";
    h += '<details class="fold"' + op + "><summary>About this number</summary>" + about(c) + "</details>";
    h += "</div></div>";
    var others = (I.bySetting[s.id] || []).filter(function (x) { return x.lang === S.lang && x.arm !== S.arm; });
    h += otherList(others, "arm", "Other forms of " + langName(l) + " for this setting");
    var langs = (I.bySetting[s.id] || []).filter(function (x) { return x.arm === S.arm && x.lang !== S.lang; });
    h += otherList(langs, "lang", armLabel(S.arm, S.lang, false) + " in other languages");
    v.innerHTML = h;
    $$(".outbar [data-w]", v).forEach(function (x) { x.style.width = x.getAttribute("data-w") + "%"; });
    wireOthers(v);
    var refs = [chanceRef()];
    if (c.floor) refs.unshift({ v: 100 * c.floor.value, cls: "ref-floor", label: "floor " + pctN(c.floor.value) + "%", side: "right" });
    var row = dumbRow(s, n, c, told, false, S.lang);
    row.label = ""; row.sub = ""; row.mark = "";
    var lgItems = S.arm === "native" ? [{ k: "native", label: "as written" }] : [{ k: "native", label: "as written" }, { k: told, label: armLabel(S.arm, S.lang, true) }];
    $("#m-legend").appendChild(Charts.legend(lgItems.concat(c.floor ? [{ k: "floor", label: "floor without reading " + pct(c.floor.value) }] : []).concat([{ k: "chance", label: chanceLabel() }])));
    Charts.dumbbell($("#m-chart"), { rows: [row], min: 0, max: 100, ticks: [0, 25, 50, 75, 100], axisLabel: "accuracy (%), 95% intervals", refs: refs, aria: "accuracy with intervals" });
  }
  function healthLine(s) {
    var h = s.pilot_run_health;
    if (!h) return "";
    return "Over all " + int(h.calls) + " pilot calls of this setting (run health): " + int(h.truncated) + " stopped at the output budget, " +
           int(h.unparseable) + " unparseable, " + int(h.refusal) + " refused, " + int(h.no_reply) + " without a reply.";
  }
  function outcomes(c, s) {
    var o = c.outcomes || {}, n = c.calls;
    var split = c.outcomes_from === "run_health" || c.outcomes_from === "summary";
    var corr = fin(o.correct) ? o.correct : c.correct;
    var parts = split ? [["correct", corr, "ob-correct"], ["wrong", o.wrong, "ob-wrong"], ["no valid answer", c.no_valid, "ob-novalid"]]
                      : [["correct", corr, "ob-correct"], ["not correct; not split in the summary", fin(corr) ? n - corr : null, "ob-unsplit"]];
    var bar = '<div class="outbar" role="img" aria-label="' + esc(parts.filter(function (p) { return fin(p[1]); }).map(function (p) { return p[0] + " " + p[1] + " of " + n; }).join(", ")) + '">';
    parts.forEach(function (p) { if (fin(p[1]) && p[1] > 0 && n) bar += '<span class="' + p[2] + '" data-w="' + (100 * p[1] / n).toFixed(3) + '"></span>'; });
    bar += "</div>";
    var lgd = '<div class="legend">' + parts.map(function (p) { return '<span><i class="lg lg-' + p[2].replace("ob-", "") + '" aria-hidden="true"></i>' + esc(p[0]) + "</span>"; }).join("") + "</div>";
    var t = '<table class="dtable"><tbody>';
    function r(lbl, v, ind) { t += "<tr><td>" + (ind ? '<span class="ind">' + esc(lbl) + "</span>" : esc(lbl)) + '</td><td class="n">' + (fin(v) ? int(v) + " of " + int(n) : "not split in the summary") + "</td></tr>"; }
    r("correct", corr);
    if (split) {
      r("wrong", o.wrong); r("no valid answer", c.no_valid);
      r("refused", o.refused, true);
      if (fin(o.declined)) r("declined (a provider's stock message)", o.declined, true);
      r("stopped at the output budget", o.truncated, true); r("unparseable", o.unparseable, true);
      if (fin(o.no_reply)) r("no reply", o.no_reply, true);
    } else {
      if (fin(o.refused)) r("refused", o.refused, true);
      if (fin(o.truncated)) r("stopped at the output budget", o.truncated, true);
    }
    t += "</tbody></table>";
    var note = "";
    if (c.outcomes_from === "run_health") note = "None of this setting's " + int((s.pilot_run_health || {}).calls) + " pilot calls was stopped at the output budget, unparseable or without a reply (run health), so every call that is neither correct nor refused is wrong.";
    else if (!split) note = "This summary does not split these calls by outcome. " + healthLine(s);
    return bar + lgd + t + (note ? '<p class="small">' + esc(note) + "</p>" : "");
  }
  function tokensTime(n, c) {
    var h = "";
    function line(lbl, v) { h += '<div class="kv"><span class="k-l">' + lbl + '</span><span class="k-v">' + v + "</span></div>"; }
    function rt(cell) { var r = cell && cell.reasoning_tokens; return r ? '<span class="nw">' + tok(r.mean) + " mean</span>" + (fin(r.median) ? ', <span class="nw">' + tok(r.median) + " median</span>" : "") : "not in this summary"; }
    h += '<p class="small">Reasoning tokens per call over the calls of the numbers above, as each API reports them; the summaries give no interval.</p>';
    if (c.arm !== "native") line("Reasoning tokens, as written", rt(n));
    line("Reasoning tokens, " + esc(armLabel(c.arm, c.lang, true)), rt(c));
    var lat = c.latency_s;
    if (lat && (fin(lat.median) || fin(lat.mean))) line("Latency", fin(lat.median) ? lat.median + " s median" : lat.mean + " s mean");
    else h += '<p class="small">No latency is recorded in the summaries for this setting and form.</p>';
    return h;
  }
  function about(c) {
    var r = I.run[c.run] || {};
    var h = '<p class="small">' + stChip(c.status) + " " + esc(r.label || c.run) + ", " + esc(r.date || c.date) + ": " + int(c.items) + " items, " + int(c.calls) + " calls" +
            (c.subset ? " (" + esc(c.subset) + ")" : "") + ". " + esc(has(B.status_legend, c.status) ? B.status_legend[c.status] : "") + "</p>";
    h += '<p class="small">Interval: ' + esc(B.methods[c.ci_method] || c.ci_method || "") + "</p>";
    if (c.floor) h += '<p class="small">Floor without reading for these items: ' + pct(c.floor.value) + ", what always picking the option whose letter triples best match the passage scores, without reading the question.</p>";
    if (c.operator) h += '<p class="small">' + esc(B.operators[c.operator] || c.operator) + "</p>";
    var fn = familyNote(c.lang);
    if (c.note) h += '<p class="small">' + esc(c.note) + "</p>";
    else if (fn && c.arm !== "native") h += '<p class="small">' + esc(fn) + "</p>";
    if (c.per_map) h += '<p class="small">Per map: ' + c.per_map.map(function (v) { return pct(v); }).join(", ") + ".</p>";
    if (c.lang === "pool_cross6") h += '<p class="small">' + esc(I.lang.pool_cross6.note) + "</p>";
    return h;
  }
  function otherList(cells, by, head) {
    if (!cells.length) return "";
    var seen = dict();
    var h = "<h4>" + esc(head) + '</h4><ul class="others">';
    cells.forEach(function (x) {
      var k = x.lang + "|" + x.arm;
      if (seen[k]) return;
      seen[k] = 1;
      var own = armLabel(x.arm, x.lang, true), plain = armLabel(x.arm, null, true);
      var lbl = by === "lang" ? langHTML(I.lang[x.lang]) + (own !== plain ? ' <span class="small">(' + esc(own) + ")</span>" : "")
              : by === "arm" ? esc(armLabel(x.arm, x.lang, false)) : langHTML(I.lang[x.lang]) + ", " + esc(armLabel(x.arm, x.lang, false));
      h += '<li><button type="button" data-lang="' + esc(x.lang) + '" data-arm="' + esc(x.arm) + '"><span class="o-l">' + lbl +
           '</span><span class="o-v num">' + pct(x.acc) + " · " + int(x.items) + " items</span></button></li>";
    });
    return h + "</ul>";
  }
  function wireOthers(root) {
    $$(".others button, .linkbtn", root).forEach(function (b) {
      b.addEventListener("click", function () { S.lang = b.getAttribute("data-lang"); S.arm = b.getAttribute("data-arm"); renderExplorer(true); });
    });
  }

  /* ------------------------------------------------------------------ view: compare every setting */
  function viewCompare() {
    var v = $("#view-compare"), l = I.lang[S.lang], arm = I.arm[S.arm], single = S.arm === "native";
    var vendors = Object.keys(B.models.reduce(function (o, m) { o[m.vendor] = 1; return o; }, {})).sort();
    if (!S.vendors) S.vendors = vendors.slice();
    if (single && S.sort === "change") S.sort = "typed";
    var aShort = armLabel(S.arm, S.lang, true);
    var h = '<div class="filters">' +
      '<fieldset><legend>Vendor</legend><div class="chks">' + vendors.map(function (x) {
        return '<label class="chk"><input type="checkbox" data-vendor="' + esc(x) + '"' + (S.vendors.indexOf(x) >= 0 ? " checked" : "") + "> " + esc(x) + "</label>";
      }).join("") + "</div></fieldset>" +
      '<fieldset><legend>Weights</legend><label class="chk"><input type="checkbox" id="f-ow"' + (S.ow ? " checked" : "") + "> open weights only</label></fieldset>" +
      '<fieldset><legend>Reasoning</legend><div class="seggroup" id="f-reason" role="radiogroup" aria-label="Reasoning"></div></fieldset>' +
      '<label class="field"><span class="field-lbl">Sort by</span><select id="f-sort">' +
      [["typed", "accuracy, " + aShort + " (highest first)"], ["change", "change from as written (largest drop first)"], ["tokens", "reasoning tokens (most first)"], ["name", "model id (A to Z)"]]
        .filter(function (o) { return !(single && o[0] === "change"); }).map(function (o) {
          return '<option value="' + o[0] + '"' + (S.sort === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>";
        }).join("") + "</select></label></div>";
    h += '<p class="d-sub">Every setting on ' + langHTML(l) + ": " + (single ? "the text as written." : "as written against " + esc(aShort) + ".") + " Select a row to open it in the Model view.</p>";
    h += '<figure class="chart" id="cmp-fig"><div class="chart-tools"><button type="button" class="seg tbl-btn" aria-pressed="false">Table</button></div><div class="chart-body"></div></figure>';
    h += '<div id="cmp-notrun"></div>';
    v.innerHTML = h;
    radioGroup($("#f-reason"), [{ value: "all", label: "all" }, { value: "off", label: "off" }, { value: "on", label: "on" }], S.reason, function (x) { S.reason = x; renderExplorer(false); });
    $$("[data-vendor]", v).forEach(function (cb) {
      cb.addEventListener("change", function () {
        S.vendors = $$("[data-vendor]", v).filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute("data-vendor"); });
        renderExplorer(false);
      });
    });
    $("#f-ow").addEventListener("change", function () { S.ow = this.checked; renderExplorer(false); });
    $("#f-sort").addEventListener("change", function () { S.sort = this.value; renderExplorer(false); });
    var pass = B.settings.filter(function (s) {
      if (S.vendors.indexOf(s.vendor) < 0) return false;
      if (S.ow && !s.open_weights) return false;
      if (S.reason === "off" && s.reasoning !== "off") return false;
      if (S.reason === "on" && s.reasoning === "off") return false;
      return true;
    });
    var withData = [], without = [];
    pass.forEach(function (s) { if (cellOf(s.id, S.lang, S.arm)) withData.push(s); else without.push(s); });
    var told = arm.told ? "told" : "typed";
    var rows = withData.map(function (s) {
      var n = single ? null : cellOf(s.id, S.lang, "native"), c = cellOf(s.id, S.lang, S.arm);
      var r = dumbRow(s, n, c, told, false, S.lang);
      if (c.subset) { r.sub += " \u00b7 " + int(c.items) + " items"; r.tip += "<br>" + esc(c.note || ""); }
      r.sel = s.id === curSet().id;
      r.n = n; r.c = c;
      return r;
    });
    var key = {
      typed: function (r) { return -(r.c.acc); },
      change: function (r) { return r.n ? r.c.acc - r.n.acc : 0; },
      tokens: function (r) { return -((r.c.reasoning_tokens && r.c.reasoning_tokens.mean) || 0); },
      name: function () { return 0; },
    }[S.sort] || function (r) { return -(r.c.acc); };
    rows.sort(function (a, b) { return key(a) - key(b) || a.s.model_id.localeCompare(b.s.model_id) || a.s.level_order - b.s.level_order; });
    var fig = $("#cmp-fig");
    if (!rows.length) {
      $(".chart-body", fig).innerHTML = '<div class="notrun"><strong>No result.</strong> No setting that passes the filters has a result on ' + langHTML(l) + ", " + esc(aShort) + ". The settings are listed below with the reason.</div>";
      $(".chart-tools", fig).hidden = true;
    } else {
      var anyTok = rows.some(function (r) { return r.c.reasoning_tokens || (r.n && r.n.reasoning_tokens); });
      Charts.figure(fig, function (inner) {
        inner.appendChild(Charts.legend((single ? [{ k: "native", label: "as written" }] : [{ k: "native", label: "as written" }, { k: told, label: aShort }]).concat([{ k: "chance", label: chanceLabel() }])));
        var pair = document.createElement("div");
        pair.className = anyTok ? "chart-pair" : "";
        inner.appendChild(pair);
        var left = document.createElement("div"); pair.appendChild(left);
        var c0 = rows[0].c;
        var floorV = c0.floor && rows.every(function (r) { return r.c.floor && r.c.floor.value === c0.floor.value; }) ? c0.floor.value : null;
        var refs = [chanceRef()];
        if (floorV != null) refs.unshift({ v: 100 * floorV, cls: "ref-floor", label: "floor " + pctN(floorV) + "%", side: "right" });
        Charts.dumbbell(left, { rows: rows, min: 0, max: 100, ticks: [0, 25, 50, 75, 100], axisLabel: "accuracy (%), 95% intervals", refs: refs,
          aria: "accuracy per setting", pick: function (r) { S.view = "model"; S.model = r.s.model_key; S.level = r.s.level; renderExplorer(true); } });
        if (anyTok) {
          var right = document.createElement("div"); pair.appendChild(right);
          var rbox = document.createElement("div"); fold(right, "Reasoning tokens per call").appendChild(rbox);
          Charts.tokens(rbox, { dropZero: true, title: "reasoning tokens per call, mean", rows: rows.map(function (r) { return tokenRow(r, r.n, r.c, S.lang, told); }),
            axisLabel: "reasoning tokens per call (log). " + TOKEN_NOTE, side: function () { return window.matchMedia("(min-width: 900px)").matches; },
            aria: "reasoning tokens per setting" });
        }
      }, function () {
        var cols = [{ key: "set", label: "setting", html: true }, { key: "v", label: "vendor" }];
        if (!single) cols.push({ key: "n", label: "as written", num: true });
        cols = cols.concat([{ key: "c", label: single ? "as written" : aShort, num: true }, { key: "d", label: "items / calls", num: true },
                            { key: "nv", label: "no valid answer", num: true }, { key: "rt", label: "reasoning tokens per call (mean)", num: true }, { key: "st", label: "status", html: true }]);
        return { caption: "Every setting with a result on " + langName(l) + ", " + aShort + ".", cols: cols,
          rows: rows.map(function (r) {
            return { set: '<span class="mid">' + esc(r.s.model_id) + "</span> " + esc(r.s.level_label), v: r.s.vendor,
                     n: r.n ? pct(r.n.acc) + " " + ival(r.n.ci, 100) : missing(r.s, S.lang, "native").short, c: pct(r.c.acc) + " " + ival(r.c.ci, 100),
                     d: int(r.c.items) + " / " + int(r.c.calls), nv: fin(r.c.no_valid) ? int(r.c.no_valid) : "not split",
                     rt: r.c.reasoning_tokens ? tok(r.c.reasoning_tokens.mean) : "", st: stChip(r.c.status), sel: r.sel };
          }) };
      });
    }
    // settings without a result here: listed by reason, never hidden
    var groups = dict();
    without.forEach(function (s) {
      var m = missing(s, S.lang, S.arm);
      var g = groups[m.kind] = groups[m.kind] || { byModel: dict(), n: 0 };
      (g.byModel[s.model_id] = g.byModel[s.model_id] || []).push(s.level_label);
      g.n++;
    });
    var heads = { notrun: "Not run yet here", pooled: "Reported pooled only here", notdesign: "Not part of the design here", notplanned: "Not planned" };
    var out = "";
    ["notrun", "pooled", "notdesign", "notplanned"].forEach(function (k) {
      if (!groups[k]) return;
      var names = Object.keys(groups[k].byModel).sort();
      out += '<details class="notrun-box"><summary>' + esc(heads[k]) + ": " + int(groups[k].n) + " " + (groups[k].n === 1 ? "setting" : "settings") + " of " + int(names.length) + " " + (names.length === 1 ? "model" : "models") + "</summary>" +
             '<div class="notrun-list">' + names.map(function (m) { return '<p><span class="mid">' + esc(m) + "</span>: " + esc(groups[k].byModel[m].join(", ")) + "</p>"; }).join("") + "</div></details>";
    });
    $("#cmp-notrun").innerHTML = out;
  }

  /* ------------------------------------------------------------------ view: languages */
  function viewLanguages() {
    var v = $("#view-languages"), s = curSet(), arm = I.arm[S.arm], single = S.arm === "native";
    var told = arm.told ? "told" : "typed";
    var cells = (I.bySetting[s.id] || []).filter(function (c) { return c.arm === S.arm; });
    var h = titleHTML(s, settingSub(s) + " · " + (single ? "the text as written" : "as written against " + esc(arm.short)) + ", by language.");
    h += '<figure class="chart" id="lang-fig"><div class="chart-tools"><button type="button" class="seg tbl-btn" aria-pressed="false">Table</button></div><div class="chart-body"></div></figure>';
    h += '<h4 class="lgrid-head">' + esc(num("site.variants")) + " Belebele variants: romanised or without diacritics</h4>" +
         '<p class="d-sub">Each tile is one language variant: accuracy as written and in the lossy typed form (romanised for other scripts, diacritics removed for Latin), for this setting.</p><div id="lgrid"></div>';
    v.innerHTML = h;
    var fig = $("#lang-fig");
    var byFamily = S.arm === "kb_layout_keys" || S.arm === "kb_layout_keys_named";  // the families are families of keyboard layouts
    var famOf = function (code) { var l = I.lang[code]; return code === "pool_cross6" ? "pool" : byFamily && l && l.layout_family ? l.layout_family : "other"; };
    var groups = [{ id: "pool", label: "Pooled" }].concat(["cross-script", "greek", "near-identity", "shift"].map(function (f) {
      return { id: f, label: B.layout_families[f].label };
    })).concat([{ id: "other", label: byFamily ? "Other languages" : "By language" }]);
    var rows = cells.map(function (c) {
      var n = single ? null : cellOf(s.id, c.lang, "native");
      var r = dumbRow(s, n, c, told, false, c.lang);
      r.label = langName(I.lang[c.lang]);
      r.mono = false;
      r.sub = c.lang === "pool_cross6" ? "" : c.lang;
      r.lang = c.lang;
      r.group = famOf(c.lang);
      if (c.floor) r.floor = 100 * c.floor.value;
      r.tip = "<strong>" + langHTML(I.lang[c.lang]) + "</strong>" + cellTip(s, single ? null : n, c, c.lang).replace(/^<strong[^>]*>[^<]*<\/strong>[^<]*/, "") +
              (c.floor ? "<br>floor without reading on these items: " + pct(c.floor.value) : "");
      r.aria = langName(I.lang[c.lang]) + ": " + (single ? "as written " + pct(c.acc) : "as written " + (n ? pct(n.acc) : "not run") + ", " + armLabel(S.arm, c.lang, true) + " " + pct(c.acc));
      return r;
    }).sort(function (a, b) { return a.label.localeCompare(b.label); });
    if (!rows.length) {
      $(".chart-body", fig).innerHTML = '<div class="notrun"><strong>Not run yet.</strong> This setting has no result in any language for ' + esc(arm.short) + ".</div>";
      $(".chart-tools", fig).hidden = true;
    } else {
      Charts.figure(fig, function (inner) {
        var anyFloor = rows.some(function (r) { return r.floor != null; });
        inner.appendChild(Charts.legend((single ? [{ k: "native", label: "as written" }] : [{ k: "native", label: "as written" }, { k: told, label: arm.short }])
          .concat(anyFloor ? [{ k: "floor-row", label: "floor without reading, per language" }] : []).concat([{ k: "chance", label: chanceLabel() }])));
        var d = document.createElement("div"); inner.appendChild(d);
        Charts.dumbbell(d, { rows: rows, groups: groups, min: 0, max: 100, ticks: [0, 25, 50, 75, 100], axisLabel: "accuracy (%), 95% intervals",
          refs: [chanceRef()], aria: "accuracy by language",
          pick: function (r) { S.view = "model"; S.lang = r.lang; renderExplorer(true); } });
      }, function () {
        var cols = [{ key: "l", label: "language", html: true }];
        if (!single) cols.push({ key: "n", label: "as written", num: true });
        cols = cols.concat([{ key: "c", label: single ? "as written" : arm.short, num: true }, { key: "f", label: "floor without reading", num: true }, { key: "d", label: "items", num: true }]);
        return { caption: "By language.", cols: cols,
          rows: rows.map(function (r) { var c = cellOf(s.id, r.lang, S.arm), n = single ? null : cellOf(s.id, r.lang, "native");
            return { l: langHTML(I.lang[r.lang]), n: n ? pct(n.acc) + " " + ival(n.ci, 100) + " (" + int(n.items) + ")" : "", c: pct(c.acc) + " " + ival(c.ci, 100), f: c.floor ? pct(c.floor.value) : "", d: int(c.items) }; }) };
      });
    }
    // the 122-variant grid
    var byScript = dict(), variants = B.languages.filter(function (x) { return x.kind === "variant"; });
    var count = dict();
    variants.forEach(function (x) { var k = x.script_name || x.script; count[k] = (count[k] || 0) + 1; });
    variants.forEach(function (x) {
      var k = x.script_name || x.script;
      if (count[k] < 3) k = "Other scripts";
      (byScript[k] = byScript[k] || []).push(x);
    });
    var scripts = Object.keys(byScript).sort(function (a, b) {
      return (a === "Other scripts") - (b === "Other scripts") || byScript[b].length - byScript[a].length || a.localeCompare(b);
    });
    var g = "", nHas = 0;
    var inMap = !!s.in_map;
    var mapNames = B.design.map_settings.map(function (id) { return setLabel(I.set[id]); });
    scripts.forEach(function (sc) {
      g += '<p class="script-h">' + esc(sc) + " · " + byScript[sc].length + '</p><div class="lgrid">';
      byScript[sc].sort(function (a, b) { return sc === "Other scripts" ? (a.script_name || "").localeCompare(b.script_name || "") || langName(a).localeCompare(langName(b)) : langName(a).localeCompare(langName(b)); }).forEach(function (x) {
        var c = cellOf(s.id, x.code, "kb_clean"), n = cellOf(s.id, x.code, "native");
        if (c) nHas++;
        var val;
        if (!c) val = inMap ? "not run yet" : "not in the map plan";
        else if (n && n.items === c.items) val = pctN(n.acc, 0) + " → " + pctN(c.acc, 0);
        else val = (n ? pctN(n.acc, 0) + " · " : "") + pctN(c.acc, 0) + " (" + int(c.items) + ")";
        g += '<div class="lt tipable ' + (c ? "has" : inMap ? "none" : "none off") + '" tabindex="-1" role="img" data-code="' + esc(x.code) + '" aria-label="' +
             esc(langName(x) + " (" + x.code + "): " + (c ? "as written " + (n ? pct(n.acc) + " of " + n.items + " items" : "") + ", romanised or without diacritics " + pct(c.acc) + " of " + c.items + " items" : val)) + '">' +
             '<span class="lt-c">' + esc(x.code) + (sc === "Other scripts" ? " · " + esc(x.script_name || x.script) : "") + '</span><span class="lt-n">' + esc(langName(x)) + '</span><span class="lt-v num">' + esc(val) + "</span>" +
             (c ? '<span class="lt-track" aria-hidden="true">' + (n ? '<i class="lt-m lt-nat" data-x="' + (100 * n.acc).toFixed(1) + '"></i>' : "") + '<i class="lt-m lt-lossy" data-x="' + (100 * c.acc).toFixed(1) + '"></i></span>' : "") + "</div>";
      });
      g += "</div>";
    });
    var lead = inMap
      ? "The main run's map is planned to cover all " + esc(num("site.variants")) + " variants for this setting (exploratory). With a result now: " + nHas + "."
      : "The " + esc(num("site.variants")) + "-variant map is planned for five settings only (" + esc(mapNames.join("; ")) + "). With a result for this setting: " + nHas + "; the other tiles say not in the map plan.";
    $("#lgrid").innerHTML = '<p class="small">' + lead + " Where the two forms rest on different items, a tile shows both shares and the lossy form's item count in brackets. Arrow keys move between tiles.</p>" + g;
    $$(".lt-m", $("#lgrid")).forEach(function (m) { m.style.left = m.getAttribute("data-x") + "%"; });  // CSSOM, allowed by the CSP
    var tiles = $$(".lt", $("#lgrid"));
    if (tiles.length) tiles[0].setAttribute("tabindex", "0");
    tiles.forEach(function (t, i) {
      var code = t.getAttribute("data-code"), x = I.lang[code];
      var c = cellOf(s.id, code, "kb_clean"), n = cellOf(s.id, code, "native");
      var html = "<strong>" + langHTML(x) + "</strong> <span class=\"mid\">" + esc(code) + "</span>" +
        (x.kb_clean ? "<br>Lossy form: " + (x.kb_clean.operator === "D2" ? "diacritics removed" : "romanised") + " (" + esc(x.kb_clean.scheme || "") + ")" : "") +
        (c ? "<br>as written " + (n ? pct(n.acc) + " " + ival(n.ci, 100) + ", " + int(n.items) + " items" : "not run") + "<br>lossy " + pct(c.acc) + " " + ival(c.ci, 100) + ", " + int(c.items) + " items" +
             (c.note ? "<br>" + esc(c.note) : "") + "<br>" + stChip(c.status) : "<br>" + esc(inMap ? "not run yet" : "not in the map plan for this setting"));
      t.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") Charts.showTip(t, html, t); });
      t.addEventListener("pointerleave", function () { Charts.hideTip(t); });
      t.addEventListener("focus", function () { Charts.showTip(t, html, t); });
      t.addEventListener("blur", function () { Charts.hideTip(t); });
      t.addEventListener("click", function () { Charts.showTip(t, html, t); });
      t.addEventListener("keydown", function (e) {
        var cols = Math.max(1, Math.round(t.parentNode.clientWidth / t.offsetWidth));
        var d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: tiles.length - 1 - i }[e.key];
        if (d == null) return;
        e.preventDefault();
        var j = Math.max(0, Math.min(tiles.length - 1, i + d));
        t.setAttribute("tabindex", "-1");
        tiles[j].setAttribute("tabindex", "0");
        tiles[j].focus();
      });
    });
  }

  /* ------------------------------------------------------------------ view: Chinese ambiguity */
  function armName(code) {
    var m = /^(open|free|ab|fc)(_[np])?$/.exec(code);
    if (!m) return code;
    var f = { open: cp("lab_fmt_open"), free: cp("lab_fmt_free"), ab: cp("lab_fmt_ab"), fc: "forced choice" }[m[1]];
    return f + " \u00b7 " + (m[2] === "_n" ? cp("lab_arm_note") : m[2] === "_p" ? cp("lab_arm_control") : cp("lab_arm_none"));
  }
  function viewChinese() {
    var v = $("#view-chinese"), s = curSet(), z = B.zh;
    var mine = I.zh[s.id];
    var h = '<p class="d-sub">Chinese pilot and follow-up (' + esc(num("date.zh")) + ", exploratory): " + esc(num("zh.classes")) +
      " classes of same-spelling words. On the word-alone items two questions send the same text and need different answers, so no reader can expect more than 1/m = 1/" +
      z.m + " = " + esc(num("zh.bound")) + "; a single setting can land above it by chance (" + esc(num("site.zh.above_bound")) + " of " + esc(num("zh.settings")) +
      " do). The items have not yet been checked by an independent native speaker.</p>";
    h += mine ? '<p class="small">Highlighted: <span class="mid">' + esc(s.model_id) + "</span> " + esc(s.level_label) + ".</p>"
              : '<div class="notrun"><strong>Not in the Chinese pilot:</strong> <span class="mid">' + esc(s.model_id) + "</span> " + esc(s.level_label) + ". The pilot ran " + esc(num("zh.settings")) + " settings; they are listed below.</div>";
    h += '<h4>Forced choice on the word-alone items, per setting</h4><figure class="chart" id="zh-fc"><div class="chart-tools"><button type="button" class="seg tbl-btn" aria-pressed="false">Table</button></div><div class="chart-body"></div></figure>';
    h += "<h4>How often a reply says the text does not settle the answer</h4>";
    if (mine) h += '<figure class="chart" id="zh-mine"><div class="chart-tools"><button type="button" class="seg tbl-btn" aria-pressed="false">Table</button></div><div class="chart-body"></div></figure>';
    h += '<div id="zh-table"></div>';
    h += '<h4>Contrasts fixed in advance (follow-up)</h4><div id="zh-cons"></div>';
    v.innerHTML = h;
    var rows = z.per_setting.map(function (p) {
      var st = I.set[p.setting];
      var zero = p.forced.ci && p.forced.ci[0] === p.forced.ci[1];
      return { key: st.id, s: st, label: st.model_id, mono: true, sub: st.level_label, sel: st.id === s.id,
               b: { v: p.forced.pct, lo: p.forced.ci[0], hi: p.forced.ci[1], cls: "typed", text: p.forced.pct.toFixed(1) },
               tip: '<strong class="mid">' + esc(st.model_id) + "</strong> " + esc(st.level_label) + "<br>" + int(p.forced.k) + " of " + int(p.forced.n) + " calls correct: " + p.forced.pct.toFixed(1) + "% " + ival(p.forced.ci, 1) +
                    "<br>" + esc(B.methods.boot_class) + (zero ? "<br>Here every class gives the same share, so the interval has zero width." : ""),
               aria: setLabel(st) + ": " + p.forced.pct.toFixed(1) + "% correct in forced choice" };
    }).sort(function (a, b) { return b.b.v - a.b.v; });
    Charts.figure($("#zh-fc"), function (inner) {
      var d = document.createElement("div"); inner.appendChild(d);
      Charts.dumbbell(d, { rows: rows, min: 0, max: 100, ticks: [0, 25, 50, 75, 100], axisLabel: "forced choice, % correct (" + num("zh.fc3.per_cell") + " calls per item, " + int(z.per_setting[0].forced.n) + " calls per setting); brackets: 95% interval over the classes",
        refs: [{ v: z.bound_pct, cls: "ref-bound", label: "bound " + num("zh.bound"), side: "right" }], aria: "forced choice per setting",
        pick: function (r) { S.model = r.s.model_key; S.level = r.s.level; renderExplorer(true); } });
    }, function () {
      return { caption: "Forced choice per setting.", cols: [{ key: "s", label: "setting", html: true }, { key: "kn", label: "correct of calls", num: true }, { key: "ci", label: "95% interval over classes", num: true }],
        rows: rows.map(function (r) { var p = I.zh[r.s.id]; return { s: '<span class="mid">' + esc(r.s.model_id) + "</span> " + esc(r.s.level_label), kn: share(p.forced.k, p.forced.n), ci: ival(p.forced.ci, 1), sel: r.sel }; }) };
    });
    var ARM = { open: "open", free: "free", ab: "ab" }, SUF = { none: "", control: "_p", note: "_n" };
    if (mine) {
      Charts.figure($("#zh-mine"), function (inner) {
        inner.appendChild(Charts.legend([{ k: "none", label: cp("lab_arm_none") }, { k: "ctrl", label: cp("lab_arm_control") }, { k: "told", label: cp("lab_arm_note") }]));
        var box = document.createElement("div"); inner.appendChild(box);
        Charts.multiples(box, { axisLabel: "% of this setting's calls on the word-alone items (" + int(mine.arms.open.n) + " per bar). " + B.methods.wilson_calls.replace(", computed by make_bundle.py", ""),
          panels: FMT.map(function (fm) {
            return { title: cp(fm[1]), sub: fm[0] === "ab" ? "answers 0" : "says the text does not settle the answer",
              bars: SENT.map(function (sx) {
                var a = mine.arms[ARM[fm[0]] + SUF[sx[0]]];
                var p = 100 * a.k / a.n;
                return { label: cp(sx[1]), v: p, lo: 100 * a.ci[0], hi: 100 * a.ci[1], cls: sx[2], valueText: p.toFixed(1) + "%",
                         tip: "<strong>" + esc(cp(fm[1])) + ", " + esc(cp(sx[1])) + "</strong><br>" + share(a.k, a.n) + " " + ival(a.ci, 100) +
                              (fin(a.bare) && fm[0] !== "ab" ? "<br>bare option numbers: " + int(a.bare) : "") + (a.declines ? "<br>stock declines: " + int(a.declines) : "") +
                              "<br>Wilson interval over the calls: narrower than one over classes." };
              }) };
          }) });
      }, function () {
        return { caption: "This setting. Intervals: Wilson over the calls, which treats repeated calls on an item as independent.", cols: [{ key: "f", label: "format" }, { key: "s", label: "sentence" }, { key: "kn", label: "calls with the outcome", num: true }, { key: "ci", label: "95% interval (Wilson)", num: true }],
          rows: [].concat.apply([], FMT.map(function (fm) { return SENT.map(function (sx) { var a = mine.arms[ARM[fm[0]] + SUF[sx[0]]];
            return { f: cp(fm[1]), s: cp(sx[1]), kn: share(a.k, a.n), ci: ival(a.ci, 100) }; }); })) };
      });
    }
    // table over all settings: one column per reply format and sentence, each "k of n (%)"
    var cols = [{ key: "s", label: "setting", html: true }, { key: "fc", label: "forced choice, correct", num: true }];
    FMT.forEach(function (fm) { SENT.forEach(function (sx) { cols.push({ key: fm[0] + sx[0], label: cp(fm[1]) + ", " + cp(sx[1]) + (fm[0] === "ab" ? " (answers 0)" : " (says so)"), num: true }); }); });
    var trows = z.per_setting.map(function (p) {
      var st = I.set[p.setting], r = { s: '<span class="mid">' + esc(st.model_id) + "</span> " + esc(st.level_label), sel: st.id === s.id, fc: share(p.forced.k, p.forced.n) };
      FMT.forEach(function (fm) { SENT.forEach(function (sx) { var a = p.arms[ARM[fm[0]] + SUF[sx[0]]]; r[fm[0] + sx[0]] = share(a.k, a.n); }); });
      return r;
    });
    var tb = $("#zh-table");
    tb.innerHTML = '<details class="wide-table"><summary>All ' + esc(num("zh.settings")) + " settings of the follow-up as a table</summary>" +
      '<p class="small">Calls of each setting and arm on the ' + esc(num("zh.u_items")) + " word-alone items (" + esc(num("zh.fc3.per_cell")) + " calls each). Free text was read by model judges that are also models under test; no person has checked a label.</p><div class=\"tscroll\"></div></details>";
    Charts.table($(".tscroll", tb), { caption: "Each cell: calls with the outcome, of all calls (%).", cols: cols, rows: trows });
    var cb = $("#zh-cons");
    cb.innerHTML = '<p class="small">Pilot follow-up, exploratory: a plan fixed before the first call, not a public pre-registration. H1: ' +
      "+" + esc(num("site.zh.h1.form")) + " of its +" + esc(num("site.zh.h1.est")) + " points go with the change to bare option numbers, which cannot flag; it gives no cause.</p>";
    Charts.table(cb, { caption: "Points; first interval over the classes with the settings held fixed, second with settings and classes resampled.",
      cols: [{ key: "id", label: "contrast" }, { key: "w", label: "arms" }, { key: "e", label: "difference, points", num: true }, { key: "c1", label: "interval, classes", num: true },
             { key: "c2", label: "interval, settings and classes", num: true }],
      rows: (z.contrasts || []).map(function (x) {
        return { id: /^H\d/.test(x.id) ? x.id : "secondary", w: armName(x.a) + " against " + armName(x.b) + " (" + (x.outcome === "zero" ? "answers 0" : "says so") + ")", e: signed(x.est), c1: sival(x.ci, 1), c2: sival(x.ci_settings, 1) };
      }) });
  }

  /* ------------------------------------------------------------------ boot */
  // Version 4: the explorer is the pilot archive, closed by default. Its data (the bundle) is loaded only when the
  // archive is opened, or when the address links a view of it (then the archive opens by itself).
  function boot() {
    initTheme();
    if (!wide()) $$("details.fold-narrow").forEach(function (d) { d.open = false; });  // open without JavaScript and on wide screens
    var arch = $("#arch");
    var q = new URLSearchParams(location.search);
    var asked = !!(q.get("view") || q.get("model")) || /^#(explore|archive)$/.test(location.hash);
    if (arch && !arch.open && !asked) {
      arch.addEventListener("toggle", function once() { if (arch.open) { arch.removeEventListener("toggle", once); start(); } });
      return;
    }
    if (arch) arch.open = true;
    start();
  }
  function start() {
    loadJSON("bundle")
      .then(function (b) {
        B = b;
        index();
        if ($("#figA")) drawFigA();
        if ($("#figD")) drawFigD();
        if ($("#figE")) drawFigE();
        buildControls();
        var linked = readURL();
        renderExplorer(null);
        booted = true;
        if (linked && !location.hash) { var ex = $("#explore"); if (ex) ex.scrollIntoView(); }
      })
      .catch(function (e) {
        console.error(e);
        $$("#explore .js-only, .chart-tools").forEach(function (x) { x.hidden = true; });
        var p = document.createElement("p");
        p.className = "nojs";
        p.textContent = "The results data could not be loaded, so the interactive charts and the explorer are not drawn. The text of the page, the tables below each figure and the converter work without it.";
        var ex = $("#explore .wrap");
        if (ex) ex.appendChild(p);
      });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
