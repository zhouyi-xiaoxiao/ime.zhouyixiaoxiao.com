/*!
 * keyconv.js - browser port of the D3x wrong-layout operator
 * (src/utils/layout_keys.py of the ime-eval repository, layout_keys v5).
 *
 * What it does: text a user means to type on one keyboard layout (the "intended" layout, e.g.
 * Russian ЙЦУКЕН) is turned into the keystrokes that produce it there, and those same physical
 * keys are read back on the layout the computer actually had active (e.g. US QWERTY):
 * "привет" -> "ghbdtn". decode() is the repository's inverse.
 *
 * Exactness: type() and decode() are byte-identical to Python layout_keys_shift(...)[0] and
 * layout_keys_unshift(...) for every pair in keymaps.json; site/tools/test_converter.py checks this
 * string by string with node. Every Unicode-dependent table (dead-key compositions, canonical
 * decompositions, the stroke chosen for a character on several keys) is materialised in keymaps.json
 * by site/tools/export_keymaps.py, so this file never calls String.prototype.normalize and does not
 * depend on the browser's Unicode version. All string logic works on code points (Array.from), like
 * Python's str.
 *
 * Usage (browser): <script src="keyconv.js"></script>, fetch data/keymaps.json, KeyConv.init(obj).
 * Usage (node):    const KeyConv = require('./keyconv.js'); KeyConv.init(JSON.parse(...)).
 * Plain ES2015 (Map, Set, Array.from, RegExp flag u), no dependencies, no build step. The fold
 * patterns come from the data as Python regexes; the one with a lookbehind (the Armenian full stop,
 * "(?<![0-9]):|:(?![0-9])") is applied by a callback that checks the neighbouring characters, so no
 * RegExp lookbehind is compiled (Safari before 16.4 has none).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KeyConv = api; } else if (root && typeof module === 'undefined') { root.KeyConv = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATA = null;          // the keymaps.json object
  var KEY_INDEX = null;     // key code -> index into DATA.keys / layout cells
  var LAYOUTS = new Map();  // layout id -> built layout (lazy)
  var PAIRS = new Map();    // pair id -> built pair (lazy)
  var PAIR_INFO = new Map();// pair id -> the pair's entry in DATA.pairs
  var SPACING = null;       // hex combining mark -> spacing form written by "dead key + space"
  var KO = null;            // Hangul tables (keyboard_ops._KO_*)

  function has(obj, k) { return obj != null && Object.prototype.hasOwnProperty.call(obj, k); }
  function cps(s) { return Array.from(s); }                       // code points, like Python str
  function strokeKey(code, level) { return code + ':' + level; }  // a keystroke: physical key + shift level
  function parseStroke(s) { var i = s.indexOf(':'); return { code: s.slice(0, i), level: +s.slice(i + 1) }; }
  function markChar(hex) { return String.fromCodePoint(parseInt(hex, 16)); }
  function spacingOf(marks) { return marks.map(function (m) { return has(SPACING, m) ? SPACING[m] : ''; }).join(''); }

  // ---------------------------------------------------------------------------------- init
  function init(data) {
    if (!data || !data.layouts || !data.pairs) { throw new Error('KeyConv.init: not a keymaps.json object'); }
    DATA = data;
    KEY_INDEX = new Map();
    data.keys.forEach(function (k, i) { KEY_INDEX.set(k, i); });
    SPACING = data.spacing;
    var h = data.hangul;
    KO = {
      L: h.L, V: h.V, T: h.T,
      cons: new Set(h.L),                 // _KO_CONS: the 19 initial consonants
      vowels: new Set(h.V),               // _KO_V: the 21 medial vowels
      finalOk: new Set(h.T.slice(1)),     // _KO_FINAL_OK: every jamo that may close a syllable
      clusterT: h.clusterT,               // two finals -> cluster final (ㄱ+ㅅ -> ㄳ)
      clusterSplit: {},                   // cluster final -> [first, moved] (when a vowel follows)
      compoundV: h.compoundV,             // two vowels -> compound vowel (ㅗ+ㅏ -> ㅘ)
      split: new Map(Object.keys(h.split).map(function (k) { return [k, h.split[k]]; }))
    };
    Object.keys(h.clusterT).forEach(function (k) { var a = cps(k); KO.clusterSplit[h.clusterT[k]] = [a[0], a[1]]; });
    LAYOUTS = new Map();
    PAIRS = new Map();
    PAIR_INFO = new Map();
    data.pairs.forEach(function (p) { PAIR_INFO.set(p.id, p); });
    return api;
  }

  function need() { if (!DATA) { throw new Error('KeyConv: call KeyConv.init(keymaps) first'); } }

  // ---------------------------------------------------------------------------------- layouts
  // A built layout mirrors layout_keys.KeyLayout / HangulLayout:
  //   out      stroke -> string | {dead: hex}        (KeyLayout.out)
  //   strokes  character -> [stroke, ...]           (KeyLayout.strokes: single keys + dead-key compositions)
  //   dead     hex mark -> stroke of its dead key    (KeyLayout.dead)
  //   derived  character -> strokes of its NFD parts (KeyLayout._derived, materialised)
  //   compose  base + marks -> composed character   (NFC(base + marks) when it is one character)
  function layout(lid) {
    need();
    var L = LAYOUTS.get(lid);
    if (L) { return L; }
    var d = DATA.layouts[lid];
    if (!d) { throw new Error('KeyConv: unknown layout ' + lid); }
    L = { id: lid, data: d, hangul: !!d.hangul, out: new Map(), strokes: new Map(), dead: new Map(),
          derived: new Map(), compose: new Map(), jamoKeys: new Map(), deadOf: new Map() };
    var dup = d.dup || {};
    DATA.keys.forEach(function (code, i) {
      for (var lvl = 1; lvl <= 2; lvl++) {
        var v = d.cells[i][lvl - 1];
        if (v === null || v === undefined) { continue; }
        var s = strokeKey(code, lvl);
        L.out.set(s, v);
        // single-stroke character: first cell in key order, or Python's rank-order choice (dup)
        if (typeof v === 'string' && cps(v).length === 1 && !L.strokes.has(v)) {
          L.strokes.set(v, [has(dup, v) ? strokeKey(dup[v][0], dup[v][1]) : s]);
        }
      }
    });
    var toS = function (st) { return st.map(function (x) { return strokeKey(x[0], x[1]); }); };
    Object.keys(d.comp || {}).forEach(function (c) { L.strokes.set(c, toS(d.comp[c])); });
    Object.keys(d.dead || {}).forEach(function (m) { L.dead.set(m, strokeKey(d.dead[m][0], d.dead[m][1])); });
    Object.keys(d.derived || {}).forEach(function (c) { L.derived.set(c, toS(d.derived[c])); });
    Object.keys(d.compose || {}).forEach(function (k) { L.compose.set(k, d.compose[k]); });
    Object.keys(d.jamoKeys || {}).forEach(function (j) { L.jamoKeys.set(j, strokeKey(d.jamoKeys[j][0], d.jamoKeys[j][1])); });
    // spacing accent -> its dead key (KeyLayout.to_keys_rendered: dead_of)
    L.dead.forEach(function (s, m) { if (has(SPACING, m)) { L.deadOf.set(SPACING[m], s); } });
    LAYOUTS.set(lid, L);
    return L;
  }

  // Hangul: syllable -> compatibility jamo (keyboard_ops.hangul_decompose), compounds -> two jamo.
  function hangulDecompose(ch) {
    var o = ch.codePointAt(0) - 0xAC00;
    if (o >= 0 && o < 11172) {
      var li = Math.floor(o / 588), rem = o % 588;
      return KO.L[li] + KO.V[Math.floor(rem / 28)] + KO.T[rem % 28];
    }
    return ch;
  }
  function splitCompounds(s) {
    return cps(s).map(function (c) { return KO.split.has(c) ? KO.split.get(c) : c; }).join('');
  }
  function jamoStrokes(L, ch) {   // HangulLayout._jamo_strokes
    var seq = cps(splitCompounds(hangulDecompose(ch)));
    var out = [];
    for (var i = 0; i < seq.length; i++) {
      if (!L.jamoKeys.has(seq[i])) { return null; }
      out.push(L.jamoKeys.get(seq[i]));
    }
    return out;
  }

  function canType(L, ch) {   // KeyLayout.can_type / HangulLayout.can_type
    if (L.strokes.has(ch)) { return true; }
    if (L.hangul) {
      var o = ch.codePointAt(0);
      return ((o >= 0xAC00 && o <= 0xD7A3) || KO.split.has(ch)) && jamoStrokes(L, ch) !== null;
    }
    return L.derived.has(ch);
  }
  function allTypeable(L, s) {
    var a = cps(s);
    for (var i = 0; i < a.length; i++) { if (!canType(L, a[i])) { return false; } }
    return true;
  }

  function strokesOf(L, ch) {
    var st = L.strokes.get(ch);
    if (!st) { st = L.hangul ? jamoStrokes(L, ch) : L.derived.get(ch); }
    if (!st) { throw new Error('KeyConv: ' + JSON.stringify(ch) + ' is not typeable on ' + L.id); }
    return st;
  }

  // Intended side: characters -> keystrokes (KeyLayout.to_keys).
  function toKeys(L, chars) {
    var keys = [];
    chars.forEach(function (ch) { Array.prototype.push.apply(keys, strokesOf(L, ch)); });
    return keys;
  }

  // Inverse side: the keystrokes that render() turns into these characters (KeyLayout.to_keys_rendered).
  // A spacing accent that render() wrote for an uncombined dead key (end of text, or before a key it
  // cannot combine with) is read back as the bare dead key, not dead key + space.
  function toKeysRendered(L, chars) {
    if (L.hangul) { return toKeys(L, chars); }
    var keys = [];
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i], st = L.strokes.get(ch);
      if (st && st.length === 2 && L.deadOf.has(ch) && st[0] === L.deadOf.get(ch) && L.out.get(st[1]) === ' ') {
        var nxt = i + 1 < chars.length ? chars[i + 1] : '';
        if (!nxt || (nxt !== ' ' && L.strokes.has(nxt) && L.strokes.get(nxt).length === 1 &&
                     !L.compose.has(nxt + markChar(L.out.get(st[0]).dead)))) {
          keys.push(st[0]);
          continue;
        }
      }
      Array.prototype.push.apply(keys, st || L.derived.get(ch));
    }
    return keys;
  }

  // Active side: keystrokes -> text (KeyLayout.render with dead keys; HangulLayout.render = the 2-set
  // automaton layout_keys.compose_jamo). Written as a streaming renderer: push() one keystroke at a
  // time; `out` only ever grows (settled text never changes), tail() is what render() would append
  // if the keys ended now (spacing forms of pending dead keys, or the open Hangul syllable).
  // render(L, keys) = out + tail after every key; trace() uses the settled length after each character.
  function Renderer(L) {
    this.L = L;
    this.out = [];       // settled pieces
    this.n = 0;          // code points in out
    this.pending = [];   // dead marks waiting for a base (KeyLayout.render)
    this.l = ''; this.v = ''; this.t = '';   // open syllable (compose_jamo): initial, medial, final
  }
  Renderer.prototype.emit = function (piece) {
    if (piece) { this.out.push(piece); this.n += cps(piece).length; }
  };
  Renderer.prototype.push = function (s) {
    var L = this.L;
    if (!L.out.has(s)) { return; }
    var v = L.out.get(s);
    if (L.hangul) { this.jamo(v); return; }
    if (typeof v !== 'string') { this.pending.push(v.dead); return; }
    if (this.pending.length) {
      if (v === ' ') {
        this.emit(spacingOf(this.pending));
      } else {
        var comp = L.compose.get(v + this.pending.map(markChar).join(''));
        this.emit(comp !== undefined ? comp : spacingOf(this.pending) + v);
      }
      this.pending = [];
    } else {
      this.emit(v);
    }
  };
  Renderer.prototype.tail = function () {
    if (this.L.hangul) { return this.l && this.v ? koCompose(this.l, this.v, this.t) : (this.l || this.v); }
    return this.pending.length ? spacingOf(this.pending) : '';
  };
  Renderer.prototype.flush = function () {   // compose_jamo.flush
    this.emit(this.tail());
    this.l = this.v = this.t = '';
  };
  Renderer.prototype.jamo = function (j) {   // one step of compose_jamo
    if (KO.cons.has(j)) {
      if (this.l && this.v) {
        if (!this.t) {
          if (KO.finalOk.has(j)) { this.t = j; } else { this.flush(); this.l = j; }
        } else {
          var cl = has(KO.clusterT, this.t + j) ? KO.clusterT[this.t + j] : null;
          if (cl) { this.t = cl; } else { this.flush(); this.l = j; }
        }
      } else {
        this.flush(); this.l = j;
      }
    } else if (KO.vowels.has(j)) {
      if (this.t) {   // a vowel after a final: the final (or a cluster's second half) opens the next syllable
        var sp = has(KO.clusterSplit, this.t) ? KO.clusterSplit[this.t] : ['', this.t];
        this.t = sp[0];
        this.flush();
        this.l = sp[1]; this.v = j;
      } else if (this.v) {
        var cv = has(KO.compoundV, this.v + j) ? KO.compoundV[this.v + j] : null;
        if (cv) { this.v = cv; } else { this.flush(); this.v = j; }
      } else {
        this.v = j;
      }
    } else {
      this.flush(); this.emit(j);
    }
  };
  function koCompose(l, v, t) {   // keyboard_ops._ko_compose
    return String.fromCharCode(0xAC00 + (KO.L.indexOf(l) * 21 + KO.V.indexOf(v)) * 28 + KO.T.indexOf(t));
  }
  function render(L, keys) {
    var r = new Renderer(L);
    for (var i = 0; i < keys.length; i++) { r.push(keys[i]); }
    return r.out.join('') + r.tail();
  }

  // ---------------------------------------------------------------------------------- pairs
  function pairObj(pid) {
    need();
    var P = PAIRS.get(pid);
    if (P) { return P; }
    var info = PAIR_INFO.get(pid);
    if (!info) { throw new Error('KeyConv: unknown or unexported pair ' + pid); }
    P = { id: pid, info: info, A: [layout(info.intended), layout(info.active)], subs: null };
    PAIRS.set(pid, P);
    return P;
  }

  // One fold substitution (Python re.sub(pattern, rep, text); rep has no group references) as a function.
  // A pattern "(?<![X])c|c(?![X])" (c, unless it stands between two characters of class X) is applied with
  // a callback that looks at the neighbouring code points of the original string, as Python's lookarounds
  // do, so that no RegExp lookbehind has to be compiled. Any other lookbehind is refused.
  var NOT_BETWEEN = /^\(\?<!(\[[^\]]+\])\)([^\\()\[\]|?*+.{}^$])\|\2\(\?!\1\)$/u;
  function cpBefore(s, i) {   // the code point that ends at UTF-16 index i ('' at the start)
    if (i <= 0) { return ''; }
    var lo = s.charCodeAt(i - 1);
    return (lo >= 0xDC00 && lo <= 0xDFFF && i >= 2) ? s.slice(i - 2, i) : s.charAt(i - 1);
  }
  function cpAt(s, i) { return i < s.length ? String.fromCodePoint(s.codePointAt(i)) : ''; }
  function compileSub(pat, rep) {
    var m = NOT_BETWEEN.exec(pat);
    if (m) {
      var cls = new RegExp('^' + m[1] + '$', 'u'), re = new RegExp(m[2], 'gu');
      return function (text) {
        return text.replace(re, function (c, off, str) {
          var a = cpBefore(str, off), b = cpAt(str, off + c.length);
          return a && b && cls.test(a) && cls.test(b) ? c : rep;
        });
      };
    }
    if (pat.indexOf('(?<') >= 0) { throw new Error('KeyConv: unsupported fold pattern ' + pat); }
    var re2 = new RegExp(pat, 'gu');
    return function (text) { return text.replace(re2, function () { return rep; }); };
  }

  // LayoutPair.reference: the pair's pre-typing folds (regex substitutions, data in keymaps.folds).
  function reference(P, text) {
    if (!P.subs) {
      var subs = [];
      P.info.folds.forEach(function (name) {
        DATA.folds[name].subs.forEach(function (sr) { subs.push(compileSub(sr[0], sr[1])); });
      });
      P.subs = subs;
    }
    P.subs.forEach(function (f) { text = f(text); });
    return text;
  }

  // LayoutPair._segments: the "opposite-layout segments" user model. State 0 = the user believes the
  // intended layout is active, 1 = they switched to the other one, null = pass-through (pasted).
  function segments(P, chars) {
    var segs = [], s = 0;
    chars.forEach(function (ch) {
      var st;
      if (canType(P.A[s], ch)) { st = s; } else if (canType(P.A[1 - s], ch)) { s = st = 1 - s; } else { st = null; }
      if (segs.length && segs[segs.length - 1].st === st) { segs[segs.length - 1].chars.push(ch); } else { segs.push({ st: st, chars: [ch] }); }
    });
    return segs;
  }

  // LayoutPair.apply. With `info` ({lost: [], lastKeys: []}) it also records, without changing the text,
  // the characters that show nothing (silentChars) and the keys of the last character typed.
  function applyPair(P, text, info) {
    var out = [], passthrough = [], switched = 0;
    segments(P, cps(reference(P, text))).forEach(function (seg) {
      if (seg.st === null) {
        out.push(seg.chars.join(''));
        Array.prototype.push.apply(passthrough, seg.chars);
        if (info) { info.lastKeys = []; }
        return;
      }
      if (seg.st === 1) { switched += 1; }
      var typing = P.A[seg.st], shown = P.A[1 - seg.st];
      if (!info) { out.push(render(shown, toKeys(typing, seg.chars))); return; }
      var per = seg.chars.map(function (c) { return strokesOf(typing, c); }), keys = [];
      per.forEach(function (k) { Array.prototype.push.apply(keys, k); });   // = toKeys(typing, seg.chars)
      out.push(render(shown, keys));
      silentChars(shown, seg.chars, per, info.lost);
      info.lastKeys = per[per.length - 1];
    });
    return { text: out.join(''), passthrough: passthrough.join(''), switches: switched };
  }

  // The characters of one run that show nothing of their own on the layout L that shows the run, read off
  // render(): a key with no output on L is skipped ('empty'), and a space pressed while a dead key is
  // pending only completes the dead key, whose accent is then written alone ('dead'). Same rule as
  // site/tools/test_converter.py python_lost, which the test compares string by string.
  function silentChars(L, chars, per, lost) {
    var pending = false;
    chars.forEach(function (ch, i) {
      var shown = false, absorbed = false;
      per[i].forEach(function (s) {
        if (!L.out.has(s)) { return; }
        var v = L.out.get(s);
        if (typeof v !== 'string') { pending = shown = true; } else if (pending && v === ' ') { pending = false; absorbed = true; } else { pending = false; shown = true; }
      });
      if (!shown) { lost.push({ ch: ch, on: L.id, kind: absorbed ? 'dead' : 'empty' }); }
    });
  }

  function renderSegments(P, segs) {   // LayoutPair._render_segments
    return segs.map(function (seg) {
      if (seg.st === null) { return seg.chars.join(''); }
      return render(P.A[seg.st], toKeysRendered(P.A[1 - seg.st], seg.chars));
    }).join('');
  }

  function invertGreedy(P, chars) {   // LayoutPair._invert_greedy
    var segs = [], s = 0;
    chars.forEach(function (ch) {
      var st;
      if (canType(P.A[1 - s], ch)) { st = s; } else if (canType(P.A[s], ch)) { s = st = 1 - s; } else { st = null; }
      if (segs.length && segs[segs.length - 1].st === st) { segs[segs.length - 1].chars.push(ch); } else { segs.push({ st: st, chars: [ch] }); }
    });
    return renderSegments(P, segs);
  }

  // LayoutPair._invert_search: minimum-switch reading (dynamic program over 2 states per character).
  function invertSearch(P, chars, early) {
    var A = P.A, n = chars.length, INF = Infinity, i, s;
    var cost = [], back = [];
    for (i = 0; i <= n; i++) { cost.push([INF, INF]); back.push([null, null]); }
    cost[0][0] = 0;
    function piece(c, st) {
      var act = A[1 - st];
      if (!canType(act, c)) { return null; }
      return render(A[st], toKeysRendered(act, [c]));
    }
    for (i = 0; i < n; i++) {
      var c = chars[i];
      for (s = 0; s < 2; s++) {
        if (cost[i][s] === INF) { continue; }
        var opts = [];
        var p = piece(c, s);   // keep the believed state
        if (p !== null && allTypeable(A[s], p)) { opts.push([0, s, s]); }
        p = piece(c, 1 - s);   // switch
        if (p !== null && (p === '' || (!canType(A[s], cps(p)[0]) && allTypeable(A[1 - s], p)))) { opts.push([1, 1 - s, 1 - s]); }
        if (!canType(A[0], c) && !canType(A[1], c)) { opts.push([0, s, null]); }   // pass-through
        for (var k = 0; k < opts.length; k++) {
          var ns = opts[k][1], cNew = cost[i][s] + opts[k][0];
          if (cNew < cost[i + 1][ns] || (early && cNew === cost[i + 1][ns])) {
            cost[i + 1][ns] = cNew;
            back[i + 1][ns] = [s, opts[k][2]];
          }
        }
      }
    }
    var end = cost[n][1] < cost[n][0] ? 1 : 0;
    if (cost[n][end] === INF) { return null; }
    var sts = [];
    s = end;
    for (i = n; i > 0; i--) { sts.push(back[i][s][1]); s = back[i][s][0]; }
    sts.reverse();
    var segs = [];
    chars.forEach(function (ch, j) {
      if (segs.length && segs[segs.length - 1].st === sts[j]) { segs[segs.length - 1].chars.push(ch); } else { segs.push({ st: sts[j], chars: [ch] }); }
    });
    return segs;
  }

  function invertChecked(P, text) {   // LayoutPair.invert_checked
    var chars = cps(text);
    var x = invertGreedy(P, chars);
    if (applyPair(P, x).text === text) { return { text: x, preimage: true }; }
    for (var e = 0; e < 2; e++) {
      var segs = invertSearch(P, chars, e === 1);
      if (segs === null) { break; }
      var perChar = segs.map(function (seg) {
        return seg.chars.map(function (c) { return renderSegments(P, [{ st: seg.st, chars: [c] }]); }).join('');
      }).join('');
      var cands = [renderSegments(P, segs), perChar];
      for (var k = 0; k < cands.length; k++) {
        if (applyPair(P, cands[k]).text === text) { return { text: cands[k], preimage: true }; }
      }
    }
    return { text: x, preimage: false };
  }

  // ---------------------------------------------------------------------------------- public API
  // length of the common prefix of a and b.slice(off) (arrays of code points)
  function lcpAt(a, b, off) { var i = 0; while (i < a.length && off + i < b.length && a[i] === b[off + i]) { i++; } return i; }

  // Display form of one cell for a keycap: '' for no character, the spacing accent for a dead key,
  // a dotted circle under combining marks and short names for invisible characters (keymaps.caps).
  function capOf(v) {
    if (v === null || v === undefined) { return ''; }
    if (typeof v !== 'string') { return has(SPACING, v.dead) ? SPACING[v.dead] : '\u25CC' + markChar(v.dead); }
    return has(DATA.caps, v) ? DATA.caps[v] : v;
  }

  var api = {
    /** Load keymaps.json (the parsed object). Returns KeyConv. */
    init: init,

    /** Every exported pair: {id, intended, active, intendedName, activeName, label, registry, condition,
     *  conditionAliases, role, attested, note, variants, alsoFor, folds, lossChars, deadChars, exact, test}.
     *  label: a menu label where "<intended> typed on <active>" would misdescribe the pair, else null.
     *  lossChars / deadChars: {layout id: characters} or null (export_keymaps.pair_losses): characters
     *  whose keys type nothing on that layout / characters typed with a key that is a dead key there. */
    pairs: function () {
      need();
      return DATA.pairs.map(function (p) {
        return { id: p.id, intended: p.intended, active: p.active,
                 intendedName: DATA.layouts[p.intended].name, activeName: DATA.layouts[p.active].name,
                 label: p.label || null,
                 registry: p.registry, condition: p.condition, conditionAliases: p.conditionAliases,
                 role: p.role, attested: p.attested, note: p.note, variants: p.variants, alsoFor: p.alsoFor,
                 folds: p.folds, lossChars: p.lossChars || null, deadChars: p.deadChars || null,
                 exact: !!(p.test && p.test.pass), test: p.test || null };
      });
    },

    /** Forward operator: {text, passthrough, switches}. text === Python layout_keys_shift(text, pair)[0];
     *  passthrough === meta.passthrough (the characters neither layout can type, pasted verbatim, as one
     *  string); switches === meta.other_layout_segments (runs typed after switching to the other layout). */
    type: function (text, pairId) { return applyPair(pairObj(pairId), String(text)); },

    /** type() plus a report, in one pass and with the same text: {text, passthrough, switches, lost,
     *  lastKeys}. lost: [{ch, on, kind}] in text order, the characters (after the pair's folds) that show
     *  nothing of their own; on: the id of the layout that showed (did not show) them; kind 'empty' (every
     *  key of the character types nothing there) or 'dead' (a space that only completed a dead key there).
     *  lastKeys: [{code, level}] of the last character, [] if it passed through. */
    typeInfo: function (text, pairId) {
      var info = { lost: [], lastKeys: [] };
      var r = applyPair(pairObj(pairId), String(text), info);
      r.lost = info.lost;
      r.lastKeys = info.lastKeys.map(parseStroke);
      return r;
    },

    /** Inverse: === Python layout_keys_unshift(text, pair). */
    decode: function (text, pairId) { return invertChecked(pairObj(pairId), String(text)).text; },

    /** Inverse with LayoutPair.invert_checked's flag: {text, preimage} (preimage: type(text') reproduces the input). */
    decodeChecked: function (text, pairId) { return invertChecked(pairObj(pairId), String(text)); },

    /** The pair's folds applied (LayoutPair.reference): what decode() aims to give back. */
    reference: function (text, pairId) { return reference(pairObj(pairId), String(text)); },

    /** Visual keyboard: rows (number row, top, home, bottom, space) of
     *  {code, intended:[l1,l2], active:[l1,l2], deadIntended:[b,b], deadActive:[b,b]}. */
    keyboard: function (pairId) {
      var P = pairObj(pairId);
      var ci = P.A[0].data.cells, ca = P.A[1].data.cells;
      var isDead = function (v) { return v !== null && v !== undefined && typeof v !== 'string'; };
      return DATA.rows.map(function (row) {
        return row.map(function (code) {
          var i = KEY_INDEX.get(code);
          return { code: code,
                   intended: [capOf(ci[i][0]), capOf(ci[i][1])], active: [capOf(ca[i][0]), capOf(ca[i][1])],
                   deadIntended: [isDead(ci[i][0]), isDead(ci[i][1])], deadActive: [isDead(ca[i][0]), isDead(ca[i][1])] };
        });
      });
    },

    /** Per input character (after the pair's folds): {ch, state, layout, keys:[{code, level, dead}], out}.
     *  state: 'intended' (typed on the intended layout's keys), 'other' (the user switched and typed it on
     *  the other layout's keys) or 'passthrough' (no keys; copied as is). keys: the physical keys pressed
     *  for this character (a Hangul syllable: its 2-3 jamo keys; a dead-key letter: dead key + base).
     *  out: the output attributed to it. Within a run typed on one layout the output is the rendering of
     *  all its keys; each character gets the part of that rendering that is settled once its keys are
     *  pressed (output text the next keys still change - a pending dead key, a Korean syllable still open
     *  to a final consonant - goes to the character whose keys settle it). The outs concatenate to
     *  type(text).text exactly. */
    trace: function (text, pairId) {
      var P = pairObj(pairId);
      var res = [];
      segments(P, cps(reference(P, String(text)))).forEach(function (seg) {
        if (seg.st === null) {
          seg.chars.forEach(function (c) { res.push({ ch: c, state: 'passthrough', layout: null, keys: [], out: c }); });
          return;
        }
        var typing = P.A[seg.st], act = P.A[1 - seg.st];
        var per = seg.chars.map(function (c) { return toKeys(typing, [c]); });
        var all = [];
        per.forEach(function (k) { Array.prototype.push.apply(all, k); });
        var F = cps(render(act, all));
        var r = new Renderer(act), b = 0;
        per.forEach(function (k, i) {
          k.forEach(function (s) { r.push(s); });
          // settled output (a prefix of F) plus whatever of the tail already agrees with F
          var nb = F.length;
          if (i < per.length - 1) { nb = Math.max(b, r.n + lcpAt(cps(r.tail()), F, r.n)); }
          res.push({ ch: seg.chars[i], state: seg.st === 0 ? 'intended' : 'other', layout: typing.id,
                     keys: k.map(function (s) { var o = parseStroke(s); o.dead = typeof typing.out.get(s) !== 'string'; return o; }),
                     out: F.slice(b, nb).join('') });
          b = nb;
        });
      });
      return res;
    },

    /** Short English display name of a layout id ("Russian (ЙЦУКЕН)"). */
    layoutName: function (lid) { need(); return has(DATA.layouts, lid) ? DATA.layouts[lid].name : lid; },

    /** {id, name, xkb, description, lang, dir, script, randomMap} of a layout (script: ISO 15924). */
    layoutInfo: function (lid) {
      need();
      var d = DATA.layouts[lid];
      if (!d) { return null; }
      return { id: lid, name: d.name, xkb: d.xkb, description: d.description, lang: d.lang, dir: d.dir,
               script: d.script || null, randomMap: d.randomMap || null };
    },

    /** Name of a physical key by its US QWERTY legend ("G", "1", "["; "space"), else its XKB code. */
    keyName: function (code) {
      need();
      if (code === 'SPCE') { return 'space'; }
      var us = DATA.layouts.us, i = KEY_INDEX.get(code);
      var v = us && i !== undefined ? us.cells[i][0] : null;
      return typeof v === 'string' ? v.toUpperCase() : code;
    },

    /** Whether a character is typeable on a layout at shift levels 1-2 (KeyLayout.can_type). */
    canType: function (ch, lid) { return canType(layout(lid), ch); },

    /** {name, note} of a fold (keymaps.folds), or null. */
    fold: function (name) { need(); return has(DATA.folds, name) ? { name: name, note: DATA.folds[name].note } : null; },

    /** keymaps.about (versions, sources, test summary, dropped pairs). */
    about: function () { need(); return DATA.about; }
  };
  return api;
});
