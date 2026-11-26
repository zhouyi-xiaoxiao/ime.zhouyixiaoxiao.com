/* AsTyped pitch deck: slide engine, the keyboard of slide 1, the numbers of slide 2, the prototype of slide 3.
   Wide screens: a stage, one slide at a time, steps on the arrow keys, space, a click or a clicker.
   Phones: a scrolling page; each slide plays its steps when it comes into view.
   Keys: arrows / space / PageUp / PageDown, 1 to 4, T = three-minute timer, F = full screen. */
(function () {
  'use strict';
  var d = document;
  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) { e.className = cls; } if (text != null) { e.textContent = text; } return e; }

  var Q = new URLSearchParams(location.search);
  var PRINT = Q.has('print');
  var reduce = PRINT || Q.get('motion') === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var slides = $$('.slide'), N = slides.length;
  var steps = slides.map(function () { return 0; });
  var played = slides.map(function () { return false; });
  var timers = slides.map(function () { return []; });
  var cur = 0, mode = null, io = null, paused1 = false;

  function later(i, fn, ms) { var t = setTimeout(fn, reduce ? Math.min(ms, 20) : ms); timers[i].push(t); return t; }
  var ptimers = [], took = false;   // prototype typing; "took" = the visitor typed or tapped in it
  function plater(fn, ms) { var t = setTimeout(fn, reduce ? Math.min(ms, 20) : ms); ptimers.push(t); return t; }
  function pclear() { ptimers.forEach(clearTimeout); ptimers = []; }
  function clearTimers(i) { timers[i].forEach(clearTimeout); timers[i] = []; if (i === 2) { pclear(); } }
  function maxStep(i) { return +slides[i].dataset.steps || 0; }

  /* ---------- data ---------- */
  var kcOK = false, engineOK = false;
  try { window.KeyConv.init(window.__IME_DATA__.keymaps); kcOK = true; } catch (e) { /* the deck still pages without it */ }
  try { window.AsTyped.init({ keyconv: window.KeyConv, data: window.ASTYPED_DATA }); engineOK = true; } catch (e) { /* see render() */ }

  /* ---------- slide 1: the keyboard and the word ---------- */
  var hw = $('#hword'), hcap = $('#hcap'), hline = $('#hline'), kbd = $('#kbd'), kbdPair = null, cycleAt = 0;
  var WORDS = [
    { pair: 'ru>us', native: 'привет', lang: 'Russian', gloss: 'hello' },
    { pair: 'il>us', native: 'שלום', lang: 'Hebrew', gloss: 'hello' },
    { pair: 'ko>us', native: '안녕하세요', lang: 'Korean', gloss: 'hello' },
    { pair: 'ara>us', native: 'مرحبا', lang: 'Arabic', gloss: 'hello' },
    { pair: 'in_deva>us', native: 'नमस्ते', lang: 'Hindi', gloss: 'hello' },
    { pair: 'gr>us', native: 'καλημέρα', lang: 'Greek', gloss: 'good morning' },
    { pair: 'ua>us', native: 'привіт', lang: 'Ukrainian', gloss: 'hello' },
    { pair: 'th>us', native: 'สวัสดี', lang: 'Thai', gloss: 'hello' }
  ];

  function buildKbd(pair) {
    if (!kcOK || kbdPair === pair) { $$('.key', kbd).forEach(function (k) { k.classList.remove('used', 'hit'); }); return; }
    kbdPair = pair;
    var rows = window.KeyConv.keyboard(pair);
    kbd.textContent = '';
    [1, 2, 3].forEach(function (ri) {
      var row = el('div', 'krow');
      rows[ri].slice(0, ri === 1 ? 12 : 99).forEach(function (k) {
        var key = el('span', 'key'); key.dataset.code = k.code;
        key.appendChild(el('b', null, (k.active && k.active[0]) || ''));
        key.appendChild(el('i', null, (k.intended && k.intended[0]) || ''));
        row.appendChild(key);
      });
      kbd.appendChild(row);
    });
    var sp = el('div', 'krow'), bar = el('span', 'key space');
    bar.dataset.code = (rows[4] && rows[4][0] && rows[4][0].code) || 'SPCE';
    sp.appendChild(bar); kbd.appendChild(sp);
  }
  function hit(code) {
    var k = code && kbd.querySelector('.key[data-code="' + code + '"]');
    if (!k) { return; }
    k.classList.add('hit', 'used');
    setTimeout(function () { k.classList.remove('hit'); }, 150);
  }
  function strokes(item) {
    var seq = [];
    if (!kcOK) { return seq; }
    window.KeyConv.trace(item.native, item.pair).forEach(function (e) {
      var out = Array.from(e.out || ''), keys = e.keys || [], n = Math.max(keys.length, out.length);
      for (var j = 0; j < n; j++) { seq.push({ code: keys[j] ? keys[j].code : null, ch: out[j] || '' }); }
    });
    return seq;
  }
  function fit(sample) {   // keep the word on one line: shrink the font to the line's width
    hw.style.fontSize = '';
    var keep = hw.innerHTML;
    if (sample != null) { hw.textContent = sample; }
    var max = hline.clientWidth * 0.92, w = hw.scrollWidth;
    if (w > max && w > 0) { hw.style.fontSize = (max / w * 100).toFixed(1) + '%'; }
    if (sample != null) { hw.innerHTML = keep; }
  }
  function addChar(c) { var s = el('span', 'ch in'); s.appendChild(el('span', 'f', c)); hw.appendChild(s); }
  function typeWord(item, speed, instant, done) {
    var seq = strokes(item), typed = seq.map(function (s) { return s.ch; }).join('');
    hw.className = 'hword'; hw.removeAttribute('dir'); hw.textContent = '';
    fit(typed);
    if (instant) { seq.forEach(function (s) { if (s.ch) { addChar(s.ch); } hit(s.code); }); if (done) { done(typed); } return; }
    var k = 0;
    (function tick() {
      if (k >= seq.length) { if (done) { done(typed); } return; }
      var s = seq[k++]; hit(s.code); if (s.ch) { addChar(s.ch); }
      later(0, tick, speed);
    })();
  }
  function caption(typed, item) {
    hcap.textContent = '';
    hcap.appendChild(el('span', 't', typed)); hcap.appendChild(d.createTextNode(' was '));
    var b = el('b', null, item.native); b.setAttribute('dir', 'auto'); hcap.appendChild(b);
    hcap.appendChild(d.createTextNode(': “' + item.gloss + '” in ' + item.lang + ', typed with the keyboard still set to US English.'));
  }
  function showMeant(item) { hw.className = 'hword meant'; hw.setAttribute('dir', 'auto'); hw.textContent = item.native; fit(); }
  function cycle() {   // after the reveal: the same story in other scripts
    cycleAt = (cycleAt + 1) % WORDS.length;
    var item = WORDS[cycleAt];
    hw.classList.add('fade');
    later(0, function () {
      buildKbd(item.pair);
      slides[0].classList.add('cyc');
      hw.classList.remove('fade');
      typeWord(item, 62, false, function (typed) {
        later(0, function () {
          hw.classList.add('fade');
          later(0, function () { showMeant(item); caption(typed, item); slides[0].classList.remove('cyc'); hw.classList.remove('fade'); later(0, cycle, 1900); }, 240);
        }, 620);
      });
    }, 260);
  }
  var hook1 = [null,
    function (instant) { buildKbd(WORDS[0].pair); typeWord(WORDS[0], 170, instant); },
    function (instant) {
      var item = WORDS[0], chars = Array.from(item.native), typed = typedOf(item);
      clearTimers(0);
      if ($$('.ch', hw).length !== Array.from(typed).length) { typeWord(item, 0, true); }
      var cells = $$('.ch', hw);
      caption(typed, item);
      if (cells.length !== chars.length) { showMeant(item); return; }
      cells.forEach(function (c, i) {
        c.classList.remove('in'); c.appendChild(el('span', 'b', chars[i]));
        if (instant) { c.classList.add('flip'); } else { later(0, function () { c.classList.add('flip'); }, 420 + i * 95); }
      });
    },
    function (instant) { cycleAt = 0; if (!instant && !reduce) { later(0, cycle, 2600); } }
  ];
  function typedOf(item) { return strokes(item).map(function (s) { return s.ch; }).join(''); }
  function settle1() {   // coming back to slide 1: show its current step complete, then carry on
    var s = steps[0], item;
    slides[0].classList.remove('cyc'); hw.classList.remove('fade');
    if (s === 1) { typeWord(WORDS[0], 0, true); }
    if (s >= 2) { item = WORDS[s === 3 ? cycleAt : 0]; if (kbdPair !== item.pair) { buildKbd(item.pair); } showMeant(item); caption(typedOf(item), item); }
    if (s === 3 && !reduce) { later(0, cycle, 1900); }
  }
  function reset1() { slides[0].classList.remove('cyc'); hw.className = 'hword'; hw.textContent = ''; hw.style.fontSize = ''; hcap.innerHTML = '&nbsp;'; kbdPair = null; buildKbd(WORDS[0].pair); }

  /* ---------- slide 2: numbers count up ---------- */
  function countUp(i, node, delay) {
    var to = +node.dataset.to, sign = node.dataset.sign || '', unit = node.dataset.unit || '';
    function show(v) { node.textContent = sign + v.toFixed(1) + unit; }
    if (reduce) { show(to); return; }
    show(0);
    later(i, function () {
      var t0 = performance.now(), dur = 1250;
      (function frame(now) {
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        if (mode === 'stage' && cur !== i) { show(to); return; }
        show(to * e);
        if (p < 1) { requestAnimationFrame(frame); } else { show(to); }
      })(t0);
    }, delay);
  }
  function hook2(k, instant) {
    if (k > 2 || instant) { return; }
    $$('.at' + k + ' .num', slides[1]).forEach(function (n, j) { countUp(1, n, 250 + j * 450); });
  }
  function reset2() { $$('.num', slides[1]).forEach(function (n) { n.textContent = (n.dataset.sign || '') + (+n.dataset.to).toFixed(1) + (n.dataset.unit || ''); }); }

  /* ---------- slide 3: the prototype ---------- */
  var pin = $('#pin'), pout = $('#pout'), phyp = $('#phyp'), flow = $('#flow'), chips = $('#pchips');
  var DEMO_RU = 'напиши письмо клиенту';   // "write a letter to the client"
  function analyze(text) { if (!engineOK) { return null; } try { return window.AsTyped.analyze(text); } catch (e) { return null; } }
  function sendbox(lead, note, tail) {
    var b = el('p', 'sendbox'); b.appendChild(el('b', null, 'Would be sent: '));
    b.appendChild(d.createTextNode(lead));
    if (note) { b.appendChild(d.createTextNode(' and a note: “' + note + '”')); }
    if (tail) { b.appendChild(d.createTextNode(' ' + tail)); }
    return b;
  }
  function tag(cls, text, small) { var p = el('p', 'tagline'); p.appendChild(el('span', 'tag ' + cls, text)); if (small) { p.appendChild(el('span', 'tagnote', small)); } return p; }
  function render(r, lite) {
    phyp.textContent = '';
    if (r && r.hypotheses && r.verdict !== 'empty') {
      r.hypotheses.slice(0, 3).forEach(function (h, i) {
        var row = el('div', 'hrow' + (i === 0 ? ' top' : '')), bar = el('i');
        bar.style.setProperty('--w', Math.round(Math.max(0.02, Math.min(1, +h.score || 0)) * 100) + '%');
        row.appendChild(el('span', null, String(h.label).replace(' typed on a US layout', ', wrong layout'))); row.appendChild(bar); phyp.appendChild(row);
      });
    }
    if (lite) { return; }
    flow.className = 'flow'; pout.textContent = '';
    if (!engineOK) { pout.appendChild(el('p', 'fine', 'The prototype did not load on this device. Reload the page to try again.')); return; }
    if (!r || r.verdict === 'empty') { pout.appendChild(el('p', 'fine', 'Try a word typed on the wrong layout, such as ghbdtn, or a pinyin word, such as beizi.')); return; }
    void flow.offsetWidth;   // restart the dot
    var box;
    if (r.verdict === 'ask') {
      flow.className = 'flow go back';
      pout.appendChild(tag('t-ask', 'Asks the user', 'several readings'));
      pout.appendChild(el('p', 'q', r.question || 'Which word did you mean?'));
      var ti = -1; (r.tokens || []).forEach(function (t, i) { if (ti < 0 && t.ambiguous && t.chosen == null) { ti = i; } });
      if (r.partial) { var sofar = el('p', 'restored plain', r.partial); sofar.lang = 'zh'; pout.appendChild(sofar); }
      var cands = el('div', 'cands');
      ((r.tokens[ti] && r.tokens[ti].candidates) || []).forEach(function (c, ci) {
        var b = el('button'); b.type = 'button'; b.dataset.word = c.word;
        var w = el('b', null, c.word); w.lang = 'zh'; b.appendChild(w);
        if (c.gloss) { b.appendChild(el('span', null, c.gloss)); }
        b.addEventListener('click', function (ev) {
          ev.stopPropagation(); pclear();
          try { render(window.AsTyped.resolve(r, ti, ci)); } catch (e) { /* keep the question on screen */ }
        });
        cands.appendChild(b);
      });
      pout.appendChild(cands);
      return;
    }
    flow.className = 'flow go sent';
    if (r.verdict === 'repaired' && r.kind === 'layout') {
      pout.appendChild(tag('t-repaired', 'Restored', 'likely ' + r.language + ', typed on a US layout'));
      box = el('p', 'restored', r.restored); box.setAttribute('dir', r.dir || 'auto'); pout.appendChild(box);
      pout.appendChild(sendbox('the restored text', r.note));
    } else if (r.verdict === 'repaired') {
      pout.appendChild(tag('t-repaired', 'Confirmed by the user'));
      box = el('p', 'restored', r.send); box.lang = 'zh'; pout.appendChild(box);
      pout.appendChild(sendbox('the confirmed word', r.note));
    } else if (r.kind === 'pinyin') {
      pout.appendChild(tag('t-context', 'Passed with a note'));
      box = el('p', 'restored plain');
      (r.tokens || []).forEach(function (t, i) {
        if (i) { box.appendChild(d.createTextNode(' ')); }
        box.appendChild(t.ambiguous ? el('u', null, t.t) : d.createTextNode(t.t));
      });
      pout.appendChild(box);
      pout.appendChild(sendbox('the text as typed', r.note, r.verdict === 'context' ? 'The underlined spelling has several readings; the words around it may settle it.' : ''));
    } else {
      pout.appendChild(tag('', 'Passed untouched'));
      box = el('p', 'restored plain', r.input); box.setAttribute('dir', 'auto'); pout.appendChild(box);
      pout.appendChild(sendbox('the text exactly as typed.', ''));
    }
  }
  function run(text) { pin.value = text; render(analyze(text)); }
  function demoType(text, done) {
    var chars = Array.from(text), k = 0;
    pin.value = ''; render(analyze(''));
    (function tick() {
      if (k >= chars.length) { render(analyze(pin.value)); if (done) { done(); } return; }
      pin.value += chars[k++];
      if (k % 2 === 0) { render(analyze(pin.value), true); }
      plater(tick, 58);
    })();
  }
  function typedRu() { try { return window.KeyConv.type(DEMO_RU, 'ru>us').text; } catch (e) { return 'yfgbib gbcmvj rkbtyne'; } }
  function hook3(k, instant) {
    if (took && mode === 'scroll') { return; }   // never type over a visitor
    if (k === 1) { if (instant) { run(typedRu()); } else { plater(function () { demoType(typedRu()); }, 650); } }
    if (k === 2) {
      pclear();
      if (instant) { run('beizi'); return; }
      demoType('beizi');   // the question stays open: the choice is the user's
    }
  }
  function reset3() { pin.value = ''; render(analyze('')); }
  function userTakesOver() { took = true; pclear(); }
  if (pin) {
    pin.addEventListener('input', function () { userTakesOver(); render(analyze(pin.value)); });
    pin.addEventListener('focus', userTakesOver);
    if (engineOK) {
      try {
        window.AsTyped.examples().forEach(function (x) {
          var b = el('button', null, x.label); b.type = 'button';
          b.addEventListener('click', function (ev) { ev.stopPropagation(); userTakesOver(); run(x.text); });
          chips.appendChild(b);
        });
      } catch (e) { /* no chips */ }
    }
    render(analyze(''));
  }

  /* ---------- slide 4: the closing line is typed ---------- */
  var closeEl = $('#closetype'), closeText = closeEl ? closeEl.textContent : '';
  function hook4(k, instant) {
    if (k !== 3 || !closeEl) { return; }
    if (instant || reduce) { closeEl.textContent = closeText; return; }
    closeEl.textContent = '';
    Array.from(closeText).forEach(function (c, i) { later(3, function () { closeEl.textContent += c; }, 700 + i * 85); });
  }

  /* ---------- steps ---------- */
  function hook(i, k, instant) {
    try {
      if (i === 0 && hook1[k]) { hook1[k](instant); }
      if (i === 1) { hook2(k, instant); }
      if (i === 2) { hook3(k, instant); }
      if (i === 3) { hook4(k, instant); }
    } catch (e) { /* a broken animation must not stop the deck */ }
  }
  function resetSlide(i) {
    clearTimers(i);
    try { if (i === 0) { reset1(); } if (i === 1) { reset2(); } if (i === 2) { reset3(); } if (i === 3 && closeEl) { closeEl.textContent = closeText; } } catch (e) { /* as above */ }
  }
  function paint(i) { for (var j = 1; j <= maxStep(i); j++) { slides[i].classList.toggle('on' + j, j <= steps[i]); } }
  function setStep(i, k, instant) {
    k = Math.max(0, Math.min(maxStep(i), k));
    var prev = steps[i], j;
    if (k === prev) { return; }
    if (k > prev) { steps[i] = k; paint(i); for (j = prev + 1; j <= k; j++) { hook(i, j, instant || j < k); } }
    else { resetSlide(i); steps[i] = k; paint(i); for (j = 1; j <= k; j++) { hook(i, j, true); } }
    hud();
  }

  /* ---------- navigation ---------- */
  var count = $('#count'), dots = $('#dots');
  slides.forEach(function () { dots.appendChild(el('i')); });
  function hud() {
    count.textContent = (cur + 1) + ' / ' + N;
    $$('i', dots).forEach(function (x, i) { x.className = i < cur ? 'part' : (i === cur ? 'on' : ''); });
  }
  function go(i, entering) {
    i = Math.max(0, Math.min(N - 1, i));
    if (mode === 'scroll') { slides[i].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); return; }
    var from = cur;
    if (i !== cur) { clearTimers(cur); }
    cur = i;
    slides.forEach(function (s, j) { s.classList.toggle('active', j === i); s.classList.toggle('before', j < i); });
    if (i === 0 && from !== 0 && steps[0] > 0) { try { settle1(); } catch (e) { /* keep paging */ } }
    if (entering !== false && i > 0 && steps[i] === 0) { setStep(i, 1); }
    hud();
    if (history.replaceState) { history.replaceState(null, '', location.pathname + location.search + '#' + (i + 1)); }
  }
  function next() {
    if (mode === 'scroll') { go(Math.min(N - 1, cur + 1)); return; }
    if (steps[cur] < maxStep(cur)) { setStep(cur, steps[cur] + 1); } else if (cur < N - 1) { go(cur + 1); }
  }
  function prev() {
    if (mode === 'scroll') { go(Math.max(0, cur - 1)); return; }
    var floor = cur > 0 ? 1 : 0;
    if (steps[cur] > floor) { setStep(cur, steps[cur] - 1); } else if (cur > 0) { go(cur - 1, false); }
  }
  function autoplay(i) {
    if (played[i]) { return; }
    played[i] = true;
    var gaps = (slides[i].dataset.auto || '').split(',').map(Number), t = 0;
    for (var k = 1; k <= maxStep(i); k++) {
      t += gaps[k - 1] || 2500;
      (function (kk) { later(i, function () { if (steps[i] < kk) { setStep(i, kk); } }, t); })(k);
    }
  }
  function pickMode() {
    var m = Q.get('mode');
    if (PRINT) { return 'scroll'; }
    if (m === 'stage' || m === 'scroll') { return m; }
    return (window.innerWidth >= 900 && window.innerHeight >= 560 && window.innerWidth > window.innerHeight) ? 'stage' : 'scroll';
  }
  function applyMode() {
    var m = pickMode();
    if (m === mode) { if (m === 'stage' && steps[0] > 0) { fit(); } return; }
    mode = m;
    d.body.classList.toggle('stage', m === 'stage');
    d.body.classList.toggle('scroll', m === 'scroll');
    if (io) { io.disconnect(); io = null; }
    if (m === 'stage') { go(cur, true); return; }
    slides.forEach(function (s) { s.classList.remove('active', 'before'); });
    if (PRINT) { return; }
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var i = slides.indexOf(e.target);
        if (e.isIntersecting && e.intersectionRatio >= 0.35) {
          cur = i; hud(); autoplay(i);
          if (i === 0 && paused1) { paused1 = false; try { settle1(); } catch (x) { /* keep scrolling */ } }
        } else if (i === 0 && steps[0] === 3 && !paused1) { paused1 = true; clearTimers(0); }   // no typing off screen
      });
    }, { threshold: [0, 0.35, 0.6] });
    slides.forEach(function (s) { io.observe(s); });
  }

  /* ---------- timer: T starts three minutes ---------- */
  var timerEl = $('#timer'), tStart = 0, tInt = null;
  function timer() {
    if (tInt) { clearInterval(tInt); tInt = null; timerEl.hidden = true; return; }
    tStart = Date.now(); timerEl.hidden = false;
    function tick() {
      var left = 180 - Math.floor((Date.now() - tStart) / 1000), a = Math.abs(left);
      timerEl.textContent = (left < 0 ? '+' : '') + Math.floor(a / 60) + ':' + ('0' + (a % 60)).slice(-2);
      timerEl.classList.toggle('over', left <= 20);
    }
    tick(); tInt = setInterval(tick, 500);
  }

  /* ---------- input ---------- */
  function inField(t) { return t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable); }
  d.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) { return; }
    if (inField(e.target)) { if (e.key === 'Escape') { e.target.blur(); } return; }
    var k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') {
      if (mode === 'scroll' && (k === ' ' || k === 'ArrowDown' || k === 'PageDown')) { return; }
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') && (k === ' ' || k === 'Enter')) { return; }
      e.preventDefault(); next();
    } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') {
      if (mode === 'scroll' && (k === 'ArrowUp' || k === 'PageUp')) { return; }
      e.preventDefault(); prev();
    } else if (k === 'Home') { go(0, false); } else if (k === 'End') { go(N - 1); }
    else if (k >= '1' && k <= String(N)) { go(+k - 1); }
    else if (k === 't' || k === 'T') { timer(); }
    else if (k === 'f' || k === 'F') { if (d.fullscreenElement) { d.exitFullscreen(); } else if (d.documentElement.requestFullscreen) { d.documentElement.requestFullscreen(); } }
  });
  $('#next').addEventListener('click', function (e) { e.stopPropagation(); next(); });
  $('#prev').addEventListener('click', function (e) { e.stopPropagation(); prev(); });
  $('#deck').addEventListener('click', function (e) {
    if (mode !== 'stage') { return; }
    if (e.target.closest && e.target.closest('a, button, textarea, .proto')) { return; }
    next();
  });
  var tx = null;
  d.addEventListener('touchstart', function (e) { tx = (mode === 'stage' && !inField(e.target)) ? e.touches[0].clientX : null; }, { passive: true });
  d.addEventListener('touchend', function (e) {
    if (tx == null) { return; }
    var dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 60) { if (dx < 0) { next(); } else { prev(); } }
  }, { passive: true });
  window.addEventListener('hashchange', function () {
    var h = parseInt((location.hash || '').slice(1), 10);
    if (h >= 1 && h <= N && h - 1 !== cur) { go(h - 1); }
  });
  var rz = null;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(applyMode, 150); });

  /* ---------- start ---------- */
  buildKbd(WORDS[0].pair);
  if (PRINT) { d.body.classList.add('print'); }
  if (reduce) { d.body.classList.add('still'); }
  var first = parseInt((location.hash || '').slice(1), 10);
  if (Q.has('demo')) { first = 3; }
  if (first >= 1 && first <= N) { cur = first - 1; }
  var want = cur;
  applyMode();
  if (PRINT) { slides.forEach(function (s, i) { setStep(i, maxStep(i), true); }); }
  else if (Q.has('final')) { setStep(cur, maxStep(cur), true); }
  else if (mode === 'scroll' && want > 0) { setTimeout(function () { slides[want].scrollIntoView(); }, 60); }
  hud();
})();
