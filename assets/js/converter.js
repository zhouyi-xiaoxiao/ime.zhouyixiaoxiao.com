/* Keyboard-state input: the converter and the headline flip. Needs only data/keymaps.json and
   data/presets.json (or their .js copies when the page is opened from a file), not the results
   bundle, so it works even if the bundle cannot be loaded. Runs entirely in the page.

   Markup it uses: the hero flip (.flip .seg[data-state], .hero-grid .hl, #headline, #hl-note) and the
   converter box #conv (#pair, #dir-type, #dir-decode, #conv-pairnote, #in-lbl, #conv-in, #out-lbl,
   #conv-out, #conv-meta, #conv-status, #presets, #kbd-legend, #kbd-shift, #kbd, #conv-source). */
(function () {
  "use strict";
  var KM = null, PRE = null;
  var MAX_CHARS = 5000;     // the text box holds at most this many characters; a longer text is cut (and the page says so)
  var DEBOUNCE_MS = 120;    // conversion runs this long after the last keystroke
  var SHOW_CHARS = 8;       // distinct lost characters listed by name
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  function int(n) { return n == null ? "" : Number(n).toLocaleString("en-GB"); }
  function plural(n, one, many) { return int(n) + " " + (n === 1 ? one : many); }
  function showTip(owner, html, anchor) { if (window.Charts && Charts.showTip) Charts.showTip(owner, html, anchor); }
  function cpCount(s) { var m = s.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g); return s.length - (m ? m.length : 0); }
  function firstCps(s, n) {   // the first n code points of s
    var i = 0, k = 0;
    while (i < s.length && k < n) { var c = s.charCodeAt(i); i += (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) ? 2 : 1; k++; }
    return s.slice(0, i);
  }
  function nfc(s) { try { return s.normalize ? s.normalize("NFC") : s; } catch (e) { return s; } }

  function loadJSON(name) {
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
    return fetch("data/" + name + ".json").then(function (r) { if (!r.ok) throw new Error(name); return r.json(); }).catch(viaScript);
  }

  /* ------------------------------------------------------------------ hero: the headline as meant / as typed */
  // The English headline, typed with the computer set to Russian (pair us>ru). The text as meant is read
  // from the page each time the typed form is shown, so a later change of the headline text is kept.
  function initFlip() {
    var flip = $(".flip"), h = $("#headline"), note = $("#hl-note");
    var spans = $$(".hero-grid .hl"), btns = $$(".flip .seg[data-state]");
    var pair = "us>ru";
    if (!flip) return;
    if (!KM || !spans.length || !btns.length || !KeyConv.pairs().some(function (p) { return p.id === pair; })) { flip.hidden = true; return; }
    var lang = (KeyConv.layoutInfo("ru") || {}).lang || "ru";
    var state = "meant", meant = null;
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var st = b.getAttribute("data-state");
        if (st === state) return;                       // the pressed button does nothing
        if (state === "meant") meant = spans.map(function (s) { return s.textContent; });
        state = st;
        btns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        spans.forEach(function (s, i) {
          s.textContent = st === "typed" ? KeyConv.type(meant[i], pair).text : meant[i];
          if (st === "typed") { s.setAttribute("aria-hidden", "true"); s.setAttribute("lang", lang); }
          else { s.removeAttribute("aria-hidden"); s.removeAttribute("lang"); }
        });
        // while the typed form is shown, the heading keeps its meaning for assistive technology
        if (h) { if (st === "typed") h.setAttribute("aria-label", meant.join(" ")); else h.removeAttribute("aria-label"); }
        $$(".hero-grid .headline").forEach(function (x) { x.classList.toggle("is-typed", st === "typed"); });
        if (note) note.hidden = st !== "typed";
      });
    });
  }

  /* ------------------------------------------------------------------ converter: state */
  var conv = {
    pair: "ru>us", dir: "type", shift: false,
    timer: 0,            // pending debounced update
    last: null,          // the last conversion: {pair, dir, input, conv, output, ok, lost}
    origin: null,        // the text a direction change started from: {dir, pair, text, conv, carried, lost}
    fromPreset: false,   // the text box holds an example (a layout change may replace it)
    cut: 0,              // length of the text last cut to MAX_CHARS (0: none since the last edit)
    touched: false,      // the visitor has done something (only then is the live status written)
    kbdFor: ""           // pair and shift level the keyboard was drawn for
  };
  var PAIRS = [];
  function pairInfo(pid) { return PAIRS.filter(function (p) { return p.id === pid; })[0]; }
  function langOf(lid) {   // lang= and dir= of the text of a layout
    var info = KeyConv.layoutInfo(lid);
    return info && info.lang ? { bcp47: info.lang, dir: info.dir || "ltr" } : { bcp47: "", dir: "auto" };
  }
  function langAttrs(l) { return ' lang="' + esc(l.bcp47) + '" dir="' + esc(l.dir) + '"'; }
  function presetsFor(pid) {
    if (!PRE) return [];
    var ids = PRE.byPair && PRE.byPair[pid];
    return (ids ? ids.map(function (id) { return PRE.presets.filter(function (x) { return x.id === id; })[0]; }) :
      PRE.presets.filter(function (x) { return (x.pairs || []).indexOf(pid) >= 0; })).filter(Boolean);
  }

  /* ------------------------------------------------------------------ the layout menu */
  // Groups by the script of the layout meant (from the key maps), then English typed on other layouts,
  // then the random key maps. Within a group: language order below, the pair a language uses first.
  var GROUPS = [
    { id: "cyrl", label: "Cyrillic" },
    { id: "gak", label: "Greek, Armenian and Georgian" },
    { id: "rtl", label: "Hebrew, Arabic and Persian" },
    { id: "kt", label: "Korean and Thai" },
    { id: "ind", label: "Indic scripts" },
    { id: "latn", label: "Latin-script layouts (German, French, English shifted)" },
    { id: "rev", label: "English typed on another layout" },
    { id: "rand", label: "Random key maps: control seeds 1–3 (the pilot used the Russian and English maps)" },
    { id: "other", label: "Other pairs" }
  ];
  var SCRIPT_GROUP = { Cyrl: "cyrl", Grek: "gak", Armn: "gak", Geor: "gak", Hebr: "rtl", Arab: "rtl", Hang: "kt", Thai: "kt",
                       Deva: "ind", Beng: "ind", Taml: "ind", Gujr: "ind", Guru: "ind", Mlym: "ind", Knda: "ind", Orya: "ind",
                       Telu: "ind", Latn: "latn" };
  var LANG_ORDER = ["ru", "uk", "bg", "kk", "sr", "mk", "el", "hy", "ka", "he", "ar", "fa", "ko", "th",
                    "hi", "bn", "ta", "gu", "pa", "ml", "kn", "or", "te", "de", "fr", "en"];
  var ROLE_ORDER = { primary: 0, reverse: 0, alternative: 1, registered: 2, unregistered_reverse: 3, random_map: 0 };
  function groupOf(p) {
    if (p.role === "random_map") return "rand";
    if (p.role === "reverse" || p.role === "unregistered_reverse") return "rev";
    var info = KeyConv.layoutInfo(p.intended);
    return SCRIPT_GROUP[info && info.script] || "other";
  }
  function langRank(lid, first) {
    var l = (KeyConv.layoutInfo(lid) || {}).lang, i = (first || []).indexOf(l);
    if (i >= 0) return i - 100;
    i = LANG_ORDER.indexOf(l);
    return i < 0 ? 99 : i;
  }
  function pairLabel(p) {
    var s = p.label || ((p.intended === "us" ? "English" : p.intendedName) + " typed on " + (p.active === "us" ? "US English" : p.activeName));
    return p.lossChars ? s + " · some keys type nothing" : s;
  }
  function fillMenu(sel) {
    GROUPS.forEach(function (g) {
      var list = PAIRS.filter(function (p) { return groupOf(p) === g.id || (g.id === "other" && !GROUPS.some(function (x) { return x.id === groupOf(p); })); });
      if (!list.length) return;
      var side = g.id === "rev" ? "active" : "intended", first = g.id === "rand" ? ["ru", "en"] : null;
      list.sort(function (a, b) {
        return langRank(a[side], first) - langRank(b[side], first) || (ROLE_ORDER[a.role] || 0) - (ROLE_ORDER[b.role] || 0) ||
          pairLabel(a).localeCompare(pairLabel(b), "en");
      });
      var og = document.createElement("optgroup");
      og.label = g.label;
      list.forEach(function (p) {
        var o = document.createElement("option");
        o.value = p.id;
        o.textContent = pairLabel(p);
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  }

  /* ------------------------------------------------------------------ what a pair does (under the menu) */
  var FOLD_WORDS = {
    hy_fullstop: "with ':' read as the Armenian full stop '։' (not between digits)",
    ml_chillu: "with each one-character chillu letter read as consonant + virama + ZWJ, the sequence InScript types"
  };
  function chars(str, l) {   // characters in the mono face, one box each ("space" for a space)
    return Array.from(str).map(function (c) {
      return '<code class="conv-ch"' + langAttrs(l) + ">" + esc(c === " " ? "space" : c) + "</code>";
    }).join(" ");
  }
  function otherSide(p, lid) { return lid === p.active ? p.intended : p.active; }
  function pairNote(p) {
    var out = [], t = p.test;
    if (t && t.roundTripNatural) {
      var k = t.roundTripNatural[0], n = t.roundTripNatural[1], nEx = PRE ? presetsFor(p.id).length : 0;
      var what = PRE ? " (the " + plural(nEx, "example", "examples") + " below and " +
        plural(n - nEx, "Belebele passage", "Belebele passages") + ")" : " (the examples and Belebele passages)";
      var folds = (p.folds || []).map(function (f) { var x = KeyConv.fold ? KeyConv.fold(f) : null; return FOLD_WORDS[f] || (x && x.note) || f; });
      out.push("Typing and then decoding gives back " + int(k) + " of " + int(n) + " sample texts exactly" + what +
        (folds.length ? ", " + esc(folds.join("; ")) : "") + ".");
    }
    Object.keys(p.lossChars || {}).forEach(function (on) {
      out.push("Keys that type nothing on " + esc(KeyConv.layoutName(on)) + ": " + chars(p.lossChars[on], langOf(otherSide(p, on))) +
        ". Typed with them, these characters vanish, and decoding cannot bring them back.");
    });
    Object.keys(p.deadChars || {}).forEach(function (on) {
      out.push("Typed right after " + chars(p.deadChars[on], langOf(otherSide(p, on))) + ", a space gives no space on " +
        esc(KeyConv.layoutName(on)) + ": those keys are dead keys there, and a dead key followed by a space writes its accent alone.");
    });
    return out.join(" ");
  }

  /* ------------------------------------------------------------------ setup */
  function initConverter() {
    var sel = $("#pair");
    if (!KM || !sel) return;
    PAIRS = KeyConv.pairs().filter(function (p) { return p.exact !== false; });
    fillMenu(sel);
    if (!pairInfo(conv.pair) && PAIRS.length) conv.pair = PAIRS[0].id;
    sel.value = conv.pair;
    sel.addEventListener("change", function () {
      flush();
      var keep = !conv.fromPreset && $("#conv-in").value !== "";   // the visitor's own text stays
      conv.pair = sel.value;
      conv.origin = null;
      conv.touched = true;
      setPresets(!keep);
      schedule(true);
    });
    $("#dir-type").addEventListener("click", function () { setDir("type"); });
    $("#dir-decode").addEventListener("click", function () { setDir("decode"); });
    $("#conv-in").addEventListener("input", function () { capBox(); conv.fromPreset = false; conv.touched = true; schedule(false); });
    $("#kbd-shift").addEventListener("click", function () {
      conv.shift = !conv.shift;
      this.setAttribute("aria-pressed", conv.shift ? "true" : "false");
      drawKeyboard();
      markHits(conv.last && conv.last.keys || []);
    });
    $("#kbd").addEventListener("keydown", kbdNav);
    $("#conv-source").innerHTML = "Key maps: " + esc(int(PAIRS.length)) + " layout pairs exported from the project's operator D3x (xkeyboard-config tables). " +
      "A browser port of it, checked against the Python operator on test strings in every pair (" +
      '<a href="data/converter_test.json">test results</a>). Characters that neither layout can type pass through unchanged. ' +
      "The text box takes up to " + esc(int(MAX_CHARS)) + " characters.";
    setPresets(true);
    schedule(true);
  }

  /* ------------------------------------------------------------------ direction */
  // A direction change carries the output over as the new input. Changing back with that text untouched
  // restores the text the visitor started from (not a re-conversion of it), and while it is untouched the
  // page says when converting it back does not give that text again.
  function setDir(d) {
    if (d === conv.dir) return;                  // the pressed button does nothing
    flush();                                     // the output must belong to the current input
    var inp = $("#conv-in"), o = conv.origin, last = conv.last;
    if (o && o.dir === d && o.pair === conv.pair && inp.value === o.carried) {
      inp.value = o.text;
      conv.origin = null;
    } else if (last && last.ok && last.pair === conv.pair && last.input === inp.value) {
      conv.origin = { dir: conv.dir, pair: conv.pair, text: inp.value, conv: last.conv, carried: last.output, lost: last.lost };
      inp.value = last.output;
    }
    conv.dir = d;
    conv.touched = true;
    conv.cut = 0;
    $("#dir-type").setAttribute("aria-pressed", d === "type" ? "true" : "false");
    $("#dir-decode").setAttribute("aria-pressed", d === "decode" ? "true" : "false");
    setPresets(false);
    schedule(true);
  }

  /* ------------------------------------------------------------------ examples */
  function presetSource(x) {
    var s = x.source || {}, lang = x.langName || "";
    var src = s.kind === "poster" ? "the poster's example" : s.kind === "belebele" ? "Belebele" : "";
    return [lang, src].filter(Boolean).join(" · ");
  }
  function setPresets(fillFirst) {
    var box = $("#presets");
    box.innerHTML = "";
    var p = pairInfo(conv.pair), typeMode = conv.dir === "type";
    presetsFor(conv.pair).slice(0, 4).forEach(function (x, i) {
      var shown;
      try { shown = typeMode ? x.text : KeyConv.type(x.text, conv.pair).text; } catch (e) { return; }
      var l = typeMode ? { bcp47: x.lang, dir: x.dir } : langOf(p.active);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "seg pre";
      b.innerHTML = '<span class="pre-txt' + (typeMode ? "" : " as-typed") + '"' + langAttrs(l) + ">" + esc(shown) + "</span>" +
        '<span class="pre-src">' + esc(presetSource(x)) + "</span>";
      var s = x.source || {};
      b.title = s.kind === "belebele" ? "Belebele, " + (s.flores || "") + ", question " + (s.question_number || "") + " (CC BY-SA 4.0); " + (s.excerpt || "") :
        s.kind === "poster" ? "The poster's wrong-layout example" + (s.gloss ? " (" + s.gloss + ")" : "") : "";
      b.addEventListener("click", function () {
        $("#conv-in").value = shown;
        conv.origin = null; conv.fromPreset = true; conv.touched = true; conv.cut = 0;
        schedule(true);
      });
      box.appendChild(b);
      if (fillFirst && i === 0) { $("#conv-in").value = shown; conv.fromPreset = true; }
    });
  }

  /* ------------------------------------------------------------------ conversion */
  // Keep the text box at MAX_CHARS: a longer paste is cut at once (before the browser lays out the whole
  // of it), and the next status line says so.
  function capBox() {
    var t = $("#conv-in"), n = t.value.length > MAX_CHARS ? cpCount(t.value) : 0;
    if (n > MAX_CHARS) {
      t.value = firstCps(t.value, MAX_CHARS);
      try { t.setSelectionRange(t.value.length, t.value.length); } catch (e) { /* not focused */ }
      conv.cut = n;
    } else {
      conv.cut = 0;
    }
  }
  function setAttr(el, name, v) { if (el.getAttribute(name) !== v) el.setAttribute(name, v); }   // no needless relayout
  function setHTML(el, html) { if (el.innerHTML !== html) el.innerHTML = html; }
  function schedule(now) {
    clearTimeout(conv.timer);
    conv.timer = 0;
    if (now) update(); else conv.timer = setTimeout(function () { conv.timer = 0; update(); }, DEBOUNCE_MS);
  }
  function flush() { if (conv.timer) { clearTimeout(conv.timer); conv.timer = 0; update(); } }

  function lostNotes(lost, p) {   // "N characters gave nothing on <layout>: …", per layout and kind
    var groups = {}, order = [];
    lost.forEach(function (e) {
      var k = e.kind + "|" + e.on;
      if (!groups[k]) { groups[k] = { kind: e.kind, on: e.on, n: 0, seen: {}, list: [] }; order.push(k); }
      var g = groups[k];
      g.n++;
      if (!g.seen[e.ch]) { g.seen[e.ch] = true; g.list.push(e.ch); }
    });
    return order.map(function (k) {
      var g = groups[k], name = esc(KeyConv.layoutName(g.on));
      if (g.kind === "dead") {
        return g.list.join("") === " " ?
          plural(g.n, "space", "spaces") + " gave nothing on " + name + ": each came right after a dead key, which then writes its accent alone" :
          plural(g.n, "character", "characters") + " gave nothing on " + name + ": each was typed with a space right after a dead key, which then writes its accent alone";
      }
      var shown = g.list.slice(0, SHOW_CHARS).join(""), more = g.list.length - SHOW_CHARS;
      return plural(g.n, "character", "characters") + " gave nothing on " + name + ": " + chars(shown, langOf(otherSide(p, g.on))) +
        (more > 0 ? " and " + int(more) + " more" : "") + " (their keys type nothing there)";
    });
  }
  function differs(lead, a, b, la, lb, why) {   // the first stretch where b differs from a
    var A = Array.from(a), B = Array.from(b), i = 0, j = 0;
    while (i < A.length && i < B.length && A[i] === B[i]) i++;
    while (j < A.length - i && j < B.length - i && A[A.length - 1 - j] === B[B.length - 1 - j]) j++;
    function q(arr, l) {
      if (!arr.length) return "nothing";
      var s = arr.length > 30 ? arr.slice(0, 30).join("") + "…" : arr.join("");
      return "“<span class=\"conv-q\"" + langAttrs(l) + ">" + esc(s) + "</span>”";
    }
    return lead + ": at character " + int(i + 1) + ", " + q(A.slice(i, A.length - j), la) + " became " + q(B.slice(i, B.length - j), lb) +
      " (" + why + ")";
  }

  function update() {
    var p = pairInfo(conv.pair);
    if (!p) return;
    var inp = $("#conv-in"), out = $("#conv-out"), meta = $("#conv-meta");
    var raw = inp.value, total = cpCount(raw), capped = total > MAX_CHARS;
    var cut = capped ? firstCps(raw, MAX_CHARS) : raw, text = nfc(cut);
    var li = langOf(p.intended), la = langOf(p.active);
    var typeMode = conv.dir === "type";
    setHTML($("#in-lbl"), typeMode ? '<span class="lab-meant">As meant</span> · on ' + esc(p.intendedName)
                                   : '<span class="lab-typed">As typed</span> · the computer on ' + esc(p.activeName));
    setHTML($("#out-lbl"), typeMode ? '<span class="lab-typed">As typed</span> · the same keys on ' + esc(p.activeName)
                                    : '<span class="lab-meant">As meant</span> · decoded to ' + esc(p.intendedName));
    setAttr(inp, "lang", typeMode ? li.bcp47 : la.bcp47);
    setAttr(inp, "dir", typeMode ? li.dir : la.dir);
    if (inp.classList.contains("as-typed") === typeMode) inp.classList.toggle("as-typed", !typeMode);
    setAttr(out, "lang", typeMode ? la.bcp47 : li.bcp47);
    setAttr(out, "dir", typeMode ? la.dir : li.dir);
    if (out.classList.contains("as-typed") !== typeMode) out.classList.toggle("as-typed", typeMode);
    if ($("#pair").value !== conv.pair) $("#pair").value = conv.pair;
    setHTML($("#conv-pairnote"), pairNote(p));
    drawKeyboard();

    var bits = [], status, lastKeys = [], nLost = 0, lostAll = [], ok = true;
    if (conv.cut) bits.push("The text box takes up to " + int(MAX_CHARS) + " characters: the text (" + int(conv.cut) + ") was cut to its first " + int(MAX_CHARS));
    else if (capped) bits.push("Only the first " + int(MAX_CHARS) + " of " + int(total) + " characters are converted");
    if (text !== cut) bits.push("converted in composed form (Unicode NFC)");
    try {
      var o = conv.origin, same = o && o.pair === conv.pair && raw === o.carried;
      if (typeMode) {
        var r = KeyConv.typeInfo(text, conv.pair);
        if (out.textContent !== r.text) out.textContent = r.text;
        lastKeys = r.lastKeys;
        lostAll = r.lost;
        nLost = r.lost.length;
        var n = cpCount(text), pass = cpCount(r.passthrough || "");
        bits.push(plural(n, "character", "characters"));
        if (r.switches) bits.push(plural(r.switches, "stretch", "stretches") + " typed after switching layouts (the computer then goes the other way)");
        if (pass) bits.push(int(pass) + " passed through unchanged (neither layout has a key for " + (pass === 1 ? "it" : "them") + ")");
        if (nLost) bits = bits.concat(lostNotes(r.lost, p));
        if (!pass && !nLost && n) bits.push("every character typed with a key");
        if (same && o.dir === "decode" && r.text !== o.conv) {
          bits.push(differs("Typing this gives a different text from the one you started from", o.conv, r.text, la, la,
            "the typed text could not have been typed on this pair exactly"));
        }
        status = "Converted " + plural(n, "character", "characters") + (nLost ? "; " + int(nLost) + " gave nothing" : "");
      } else {
        var d = KeyConv.decodeChecked(text, conv.pair);
        if (out.textContent !== d.text) out.textContent = d.text;
        var nd = cpCount(text);
        bits.push(plural(nd, "character", "characters") + " decoded with the inverse of the same key map");
        if (d.preimage === false) bits.push("this text could not have been typed on this pair exactly; the reading shown is the closest one");
        if (same && o.dir === "type") {
          var want = KeyConv.reference(o.conv, conv.pair);
          if (d.text !== want) {
            bits.push(differs("Decoding gives a different text from the one you started from", want, d.text, li, li,
              o.lost ? "characters whose keys type nothing leave no trace" : "text that mixes layouts can have more than one reading"));
          }
        }
        status = "Decoded " + plural(nd, "character", "characters");
      }
    } catch (e) {
      ok = false;
      out.textContent = "";
      bits = ["This text could not be converted (" + esc(e && e.message || e) + ")"];
      status = "This text could not be converted";
    }
    meta.innerHTML = bits.join(" · ");
    if (conv.cut || capped) status += "; the text was cut to " + int(MAX_CHARS) + " characters";
    conv.last = { pair: conv.pair, dir: conv.dir, input: raw, conv: text, output: out.textContent, ok: ok,
                  lost: lostAll.some(function (e) { return e.kind === "empty"; }), keys: typeMode ? lastKeys : [] };
    markHits(conv.last.keys);
    if (conv.touched) $("#conv-status").textContent = status + ".";
  }

  /* ------------------------------------------------------------------ keyboard */
  // Each key is a button (one tab stop for the whole keyboard; arrow keys move between keys). Its
  // accessible name says what the key gives on both layouts; tapping it adds its character to the text box.
  function keyLabel(k, p, lvl, a, m, dA, dI) {
    if (k.code === "SPCE") return "Space bar: a space on both layouts";
    var name = "Key " + KeyConv.keyName(k.code) + (lvl ? " with Shift" : "");
    function one(c, dead) { return c ? (dead ? "dead key " + c : c) : "nothing"; }
    if (a === m && dA === dI) return name + ": " + one(a, dA) + " on both layouts";
    return name + ": " + one(m, dI) + " on " + p.intendedName + ", " + one(a, dA) + " on " + p.activeName;
  }
  function drawKeyboard() {
    var kb = $("#kbd"), p = pairInfo(conv.pair);
    if (!kb || !p) return;
    var lvl = conv.shift ? 1 : 0, sig = conv.pair + "|" + lvl;
    if (conv.kbdFor === sig) return;
    conv.kbdFor = sig;
    var focused = document.activeElement && kb.contains(document.activeElement) ? document.activeElement.getAttribute("data-code") : null;
    var li = langOf(p.intended), la = langOf(p.active), anyDead = false;
    kb.innerHTML = "";
    KeyConv.keyboard(conv.pair).forEach(function (row, ri) {
      var r = document.createElement("div");
      r.className = "kbd-row";
      function gap(cls) { var g = document.createElement("span"); g.className = cls; g.setAttribute("aria-hidden", "true"); r.appendChild(g); }
      if (ri === 2) gap("k-gap");
      if (ri === 3) gap("k-gap2");
      if (ri === 4) gap("k-gap3");
      row.forEach(function (k) {
        var b = document.createElement("button");
        var isSpace = k.code === "SPCE";
        var a = k.active[lvl] || "", m = k.intended[lvl] || "";
        var dA = !!(k.deadActive && k.deadActive[lvl]), dI = !!(k.deadIntended && k.deadIntended[lvl]);
        if (dA || dI) anyDead = true;
        b.type = "button";
        b.tabIndex = -1;
        b.className = "k" + (isSpace ? " k-space" : "") + (a === m ? " same" : "");
        b.innerHTML = isSpace ? '<span class="ks">space</span>' :
          '<span class="ka' + (dA ? " dead" : "") + '"' + langAttrs(la) + ">" + esc(a) + "</span>" +
          '<span class="ki' + (dI ? " dead" : "") + '"' + langAttrs(li) + ">" + esc(m) + "</span>";
        b.setAttribute("data-code", k.code);
        b.setAttribute("aria-label", keyLabel(k, p, lvl, a, m, dA, dI));
        b.addEventListener("click", function () {
          rove(b);
          if (isSpace) { insertAtCursor(" "); return; }
          showTip(b, "<strong>" + esc(p.intendedName) + ":</strong> " + (m ? '<span' + langAttrs(li) + ">" + esc(m) + "</span>" + (dI ? " (dead key)" : "") : "nothing") +
            "<br><strong>" + esc(p.activeName) + ":</strong> " + (a ? '<span' + langAttrs(la) + ">" + esc(a) + "</span>" + (dA ? " (dead key)" : "") : "nothing"), b);
          var typeMode = conv.dir === "type", ch = typeMode ? m : a, dead = typeMode ? dI : dA;
          if (ch && !dead) insertAtCursor(ch);
        });
        r.appendChild(b);
      });
      if (ri === 4) gap("k-gap3");
      kb.appendChild(r);
    });
    fitCaps(kb);
    var keys = $$(".k", kb), start = (focused && $('.k[data-code="' + focused + '"]', kb)) || keys[0];
    if (start) start.tabIndex = 0;
    if (focused && start) start.focus();
    $("#kbd-legend").innerHTML = 'On each key: <span class="lab-typed">top</span>, what it gives on ' + esc(p.activeName) +
      '; <span class="lab-meant">bottom</span>, on ' + esc(p.intendedName) + ". Tap a key to add it to the text box." +
      (anyDead ? ' <span class="kbd-dead">Dotted underline</span>: a dead key, which adds an accent to the next letter and types nothing by itself.' : "");
    kb.setAttribute("aria-label", "Keyboard: each key gives what it types on " + p.activeName + " and on " + p.intendedName +
      ". Arrow keys move between keys. The text box above is the main way to type.");
  }
  // On a phone (where each glyph span is as wide as its key) a glyph wider than its key (a two-part vowel
  // sign on a dotted circle, "ZWNJ") is set smaller so that it fits: all widths are read first, then the
  // sizes written. Redone when the window width changes.
  function fitCaps(kb) {
    if (!window.matchMedia || !window.matchMedia("(max-width: 560px)").matches) return;
    var fix = [];
    $$(".ka, .ki", kb).forEach(function (sp) {
      var w = sp.clientWidth, sw = sp.scrollWidth;
      if (w > 4 && sw > w + 1) fix.push([sp, parseFloat(getComputedStyle(sp).fontSize) * (w - 2) / sw]);
    });
    fix.forEach(function (f) { f[0].style.fontSize = Math.max(7, Math.floor(f[1] * 10) / 10) + "px"; });
  }
  var lastW = window.innerWidth, resizeT = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (window.innerWidth === lastW || !PAIRS.length) return;
      lastW = window.innerWidth;
      conv.kbdFor = "";
      drawKeyboard();
      markHits(conv.last && conv.last.keys || []);
    }, 150);
  });
  function markHits(keys) {
    var want = {};
    (keys || []).forEach(function (k) { want[k.code] = true; });
    $$("#kbd .k").forEach(function (b) { b.classList.toggle("hit", !!want[b.getAttribute("data-code")]); });
  }
  function rove(b) { $$("#kbd .k").forEach(function (x) { x.tabIndex = x === b ? 0 : -1; }); }
  function kbdNav(e) {
    var b = e.target && e.target.closest ? e.target.closest(".k") : null;
    if (!b) return;
    var rows = $$("#kbd .kbd-row").map(function (r) { return $$(".k", r); });
    var ri = -1, ki = -1;
    rows.forEach(function (r, i) { var j = r.indexOf(b); if (j >= 0) { ri = i; ki = j; } });
    if (ri < 0) return;
    var to = null;
    if (e.key === "ArrowLeft") to = rows[ri][ki - 1];
    else if (e.key === "ArrowRight") to = rows[ri][ki + 1];
    else if (e.key === "Home") to = rows[ri][0];
    else if (e.key === "End") to = rows[ri][rows[ri].length - 1];
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      var r2 = rows[ri + (e.key === "ArrowUp" ? -1 : 1)];
      if (r2) {   // the key of the next row nearest to this one horizontally
        var x = b.getBoundingClientRect(), cx = x.left + x.width / 2, best = Infinity;
        r2.forEach(function (c) { var y = c.getBoundingClientRect(), dd = Math.abs(y.left + y.width / 2 - cx); if (dd < best) { best = dd; to = c; } });
      }
    } else return;
    e.preventDefault();
    if (to) { rove(to); to.focus(); }
  }
  function insertAtCursor(ch) {
    var t = $("#conv-in");
    var s = t.selectionStart != null ? t.selectionStart : t.value.length, e = t.selectionEnd != null ? t.selectionEnd : s;
    t.value = t.value.slice(0, s) + ch + t.value.slice(e);
    var pos = s + ch.length;
    try { t.setSelectionRange(pos, pos); } catch (er) { /* not focused: the caret stays where it was */ }
    capBox();
    conv.fromPreset = false;
    conv.touched = true;
    schedule(true);
  }

  function boot() {
    Promise.all([loadJSON("keymaps"), loadJSON("presets").catch(function () { return null; })]).then(function (r) {
      KM = r[0]; PRE = r[1];
      KeyConv.init(KM);
      try { initFlip(); } catch (e) { console.warn(e); $$(".flip").forEach(function (x) { x.hidden = true; }); }
      initConverter();
    }).catch(function (e) {
      console.warn(e);
      $$("#conv, .flip").forEach(function (x) { x.hidden = true; });
      var p = document.createElement("p");
      p.className = "nojs";
      p.textContent = "The key maps could not be loaded, so the converter is not shown.";
      var w = $("#try .lede");
      if (w) w.parentNode.insertBefore(p, w.nextSibling);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
