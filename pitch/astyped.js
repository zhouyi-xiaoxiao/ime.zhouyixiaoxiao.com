(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.AsTyped = api; }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var data, keyconv, syllables, englishWords;
  var alphabets = new Map();
  var layoutWords;
  var latinPairs, latinFloors, latinWords;

  function init(options) {
    data = options.data;
    keyconv = options.keyconv;
    syllables = new Set(data.pinyin.syllables);
    englishWords = new Set(data.english.words.split(' '));
    // Everyday interjections are uncommon in written passages.
    'hi hey hello hiya howdy bye goodbye thanks please ok okay yep nope uh oh wow oops'
      .split(' ').forEach(function (word) { englishWords.add(word); });
    alphabets = new Map();
    layoutWords = new Map(data.langs.map(function (lang) {
      return [lang.pair, new Set(lang.bigrams.words.split(' '))];
    }));
    [data.english].concat(data.langs.map(function (lang) { return lang.bigrams; }))
      .forEach(function (model) { alphabets.set(model, new Set(Array.from(model.alphabet))); });
    latinPairs = new Map();
    latinWords = new Map();
    latinFloors = Int16Array.from(data.latinModels, function (model) { return model.floor; });
    data.latinModels.forEach(function (model, index) {
      var letters = Array.from(model.pairs);
      for (var i = 0; i < letters.length; i += 2) {
        var pair = letters[i] + letters[i + 1];
        if (!latinPairs.has(pair)) { latinPairs.set(pair, latinFloors.slice()); }
        latinPairs.get(pair)[index] = parseInt(model.scores.slice(i, i + 2), 16) - 128;
      }
      model.words.split(' ').forEach(function (word) {
        if (!latinWords.has(word)) { latinWords.set(word, []); }
        latinWords.get(word).push(index);
      });
    });
    return api;
  }

  function inRanges(point, ranges) {
    var lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >>> 1;
      if (point < ranges[mid][0]) { hi = mid - 1; }
      else if (point > ranges[mid][1]) { lo = mid + 1; }
      else { return true; }
    }
    return false;
  }

  function letterCounts(text) {
    var total = 0, latin = 0, ascii = 0;
    for (var ch of text) {
      var point = ch.codePointAt(0);
      if (!inRanges(point, data.letterRanges)) { continue; }
      total++;
      if (inRanges(point, data.latinRanges)) { latin++; }
      if (point < 128) { ascii++; }
    }
    return {total: total, latin: latin, ascii: ascii};
  }

  // Center the mean log likelihood on the training mean for each writing system.
  function fit(text, model, normalization) {
    var alphabet = alphabets.get(model);
    var last = ' ', sum = 0, size = 0;
    function add(ch) {
      var value = model.log[last + ch];
      sum += value === undefined ? model.floor : value;
      size++;
      last = ch;
    }
    for (var ch of text.toLowerCase().normalize(normalization)) {
      if (alphabet.has(ch) || inRanges(ch.codePointAt(0), data.letterRanges) ||
          inRanges(ch.codePointAt(0), data.markRanges)) {
        add(ch);
      } else if (last !== ' ') {
        add(' ');
      }
    }
    if (last !== ' ') { add(' '); }
    return size ? sum / size - model.mean : model.floor - model.mean;
  }

  function probability(value) { return 1 / (1 + Math.exp(-value)); }

  function bestLatin(text, prior, best) {
    var sums = new Float64Array(latinFloors.length);
    var recognized = new Uint32Array(latinFloors.length);
    var last = ' ', size = 0, word = '', words = 0;
    function add(ch) {
      var scores = latinPairs.get(last + ch) || latinFloors;
      for (var i = 0; i < sums.length; i++) { sums[i] += scores[i]; }
      last = ch;
      size++;
      if (ch === ' ') {
        (latinWords.get(word) || []).forEach(function (i) { recognized[i]++; });
        word = '';
        words++;
      } else { word += ch; }
    }
    for (var ch of text.toLowerCase().normalize('NFD')) {
      var point = ch.codePointAt(0);
      if (inRanges(point, data.markRanges)) { continue; }
      if (inRanges(point, data.letterRanges)) {
        for (var letter of (data.latinFolds[ch] || ch)) { add(letter); }
      } else if (last !== ' ') { add(' '); }
    }
    if (last !== ' ') { add(' '); }
    for (var i = 0; i < sums.length; i++) {
      var coverage = recognized[i] / words;
      var score = sums[i] / (10 * size) + prior + 1.7 * coverage * coverage;
      if (score > best.fit) {
        best = {id: 'asis', label: data.latinModels[i].lang + ', as typed', fit: score};
      }
    }
    return best;
  }

  function nativeWordCoverage(reading) {
    var known = 0, words = 0, word = '';
    var normalization = reading.lang.code === 'kor_Hang' ? 'NFD' : 'NFC';
    for (var ch of reading.decoded.text.toLowerCase().normalize(normalization) + ' ') {
      var point = ch.codePointAt(0);
      if (inRanges(point, data.letterRanges) || inRanges(point, data.markRanges)) {
        word += ch;
      } else if (word) {
        words++;
        if (layoutWords.get(reading.id).has(word)) { known++; }
        word = '';
      }
    }
    return known / Math.max(1, words);
  }

  function finish(result, readings) {
    var shown = readings.slice(0, 5);
    var asis = readings.find(function (reading) { return reading.id === 'asis'; });
    if (asis && !shown.includes(asis)) { shown[shown.length - 1] = asis; }
    result.hypotheses = shown.map(function (entry) {
      return {id: entry.id, label: entry.label, score: probability(entry.fit)};
    });
    result.confidence = readings.length > 1 ?
      probability(2 * (readings[0].fit - readings[1].fit)) : result.hypotheses[0].score;
    return result;
  }

  function literal(result, kind, score) {
    result.kind = kind;
    return finish(result, [{id: 'asis', label: 'As typed', fit: score}]);
  }

  function punctuationCount(text) {
    return (text.match(/[!-\/:-@\[-`{-~]/g) || []).length;
  }

  function looksLikeCode(text, asisFit) {
    if (/(?:[a-z]+:\/\/|www\.)\S+|\S@\S|(?:^|\s)(?:\.\.?\/|~\/|[A-Za-z]:\\)\w|\w_\w/i.test(text)) { return true; }
    if (/\+\+|--\w|=>|->|[=!<>+*/-]=|&&|\|\||::|\$\{\w+\}|\s[=+*/<>|]\s/.test(text)) { return true; }
    if (/<\/?[a-z][\w.-]*\s*\/?>|\b[a-z]\w*(?:\.[a-z]\w*){2,}|\)\s*[;:]|\b\w+\(\s*\w+\(|\d+;\d+;\d+/i.test(text)) { return true; }
    // A single path or identifier can be enough. Inside prose the same shifted
    // keys occur on several layouts, so also check whether the letters fit as typed.
    var snippet = text.trim();
    if (/^[a-z]+(?:[A-Z][a-z\d]*)+$|^(?:\.?[\w-]+)?(?:[\\/.][\w.-]+)+$/.test(snippet)) { return true; }
    if (/^\w*\[[^\n]*\]$|^\{[^\n]*\}$|^\w+\([^()]*\)$|^\(?\w+\s*[=+*<>]\s*\w+\)?$/.test(snippet)) { return true; }
    if (/^\w+\s+(?:AND|OR|XOR)\s+\w+$|^\w[\w.-]*\s+-[a-zA-Z]\w*(?:\s|$)/.test(snippet)) { return true; }
    if (asisFit > -0.65) {
      var names = text.match(/\b[a-z]+(?:[A-Z][a-z]+)+\d*\b/g) || [];
      if (names.some(function (name) {
        return name.split(/(?=[A-Z])/).some(function (part) {
          return part.length > 1 && englishWords.has(part.toLowerCase());
        });
      })) { return true; }
      if (/\w[\\/]\w|\b\w+\.[a-z]{2,}\b|(?:^|\s)\/\w/.test(text)) { return true; }
      if (/\[[^\]\n]*\]|\{[^}\n]*\}|\b\w+\([^()\n]*\)|\w[=+*<>]\w/.test(text)) { return true; }
    }
    return /^\s*(?:\$\s+\S|(?:cd|ls|pwd|cat|echo|mkdir|rm|cp|mv|grep|git|npm|python3?|curl|sudo|import|from)\s+\S)/.test(text);
  }

  function analyze(input) {
    if (!data) { throw new Error('Call AsTyped.init first.'); }
    var result = {input: input, verdict: 'pass', kind: 'unknown', hypotheses: [],
      confidence: 0, note: '', send: input};
    if (!input.trim()) {
      result.verdict = 'empty';
      return result;
    }
    var counts = letterCounts(input);
    if (counts.total - counts.latin > counts.latin) { return literal(result, 'native', 4); }
    if (!counts.total) {
      return literal(result, 'unknown', 2);
    }

    var tokens = input.trim().split(/\s+/);
    var punctuation = punctuationCount(input);
    var englishFit = fit(input, data.english, 'NFC');
    // Mid-word punctuation and capitals carry information on shifted layouts.
    var oddKeys = (input.match(/[a-z][^a-z0-9\s'’-]+(?=[a-z])/gi) || []).length;
    var oddCaps = (input.match(/[a-z][A-Z]/g) || []).length;
    var oddShare = (oddKeys + oddCaps) / tokens.length;
    englishFit -= Math.min(2, oddShare);
    var englishPrior = counts.total < 4 ? 2.4 : (tokens.length === 1 ? 1.65 : 0.65);
    var words = input.toLowerCase().match(/[a-z]+/g) || [];
    var recognized = words.filter(function (word) { return englishWords.has(word); }).length;
    var coverage = recognized / Math.max(1, words.length);
    var englishScore = englishFit + englishPrior + 1.7 * coverage * coverage;
    if (oddShare === 0 && coverage === 1) { englishScore = Math.max(englishScore, 2.0); }
    var english = {id: 'asis', label: 'English, as typed', fit: englishScore};
    // A best-of-many bigram match alone is weak evidence, especially on one word.
    // Frequent whole words add evidence only for the language in which they occur.
    var asis = bestLatin(input, 0.35 - Math.min(2, oddShare), english);
    if (looksLikeCode(input, asis.fit)) { return finish(result, [asis]); }
    var readings = [english];
    var pinyin = pinyinReading(input, data, syllables, englishFit);
    if (pinyin) { readings.push({id: 'pinyin', label: 'Toneless pinyin', fit: pinyin.strength}); }

    data.langs.forEach(function (lang) {
      var decoded = keyconv.decodeChecked(input, lang.pair);
      var chars = letterCounts(decoded.text);
      var score = fit(decoded.text, lang.bigrams, lang.code === 'kor_Hang' ? 'NFD' : 'NFC');
      score -= 3 * chars.ascii / Math.max(1, chars.total);
      var addedPunctuation = Math.max(0, punctuationCount(decoded.text) - punctuation);
      score -= Math.min(2, 1.2 * addedPunctuation / tokens.length);
      // A Hangul reading should compose into syllables rather than isolated keys.
      if (lang.code === 'kor_Hang') {
        score -= 4 * (decoded.text.match(/[ㄱ-ㅣ]/g) || []).length / Math.max(1, chars.total);
      }
      // A failed round trip or an all-Latin reading cannot justify replacement.
      if (!decoded.preimage || chars.total === chars.latin) { score = Math.min(-12, score - 6); }
      readings.push({id: lang.pair, label: lang.lang + ' typed on a US layout',
        fit: score, lang: lang, decoded: decoded});
    });
    readings.sort(function (a, b) { return b.fit - a.fit; });
    var best = readings[0];
    // A short, weak lead between scripts rarely warrants changing the text.
    var requiredLead = counts.total < 4 ? 1.25 : (tokens.length === 1 ? 0.4 : 0);
    // Closely related layouts sometimes restore the same word.
    var alternative = best.lang && readings.find(function (reading) {
      return !reading.decoded || reading.decoded.text !== best.decoded.text;
    });
    var abstain = best.lang && (!best.decoded.preimage || best.fit < -2.6 ||
      best.fit - alternative.fit < requiredLead);
    if (!abstain && best.lang && asis !== english) {
      // A plausible layout can claim the same whole-word evidence as a Latin reading.
      // Apply this only after the original layout, English and pinyin comparisons.
      best.fit += 1.7 * Math.pow(nativeWordCoverage(best), 2);
      abstain = best.fit - asis.fit < requiredLead;
    }
    readings[readings.indexOf(english)] = asis;
    if (abstain) { asis.fit = Math.max(best.fit, asis.fit); }
    readings.sort(function (a, b) { return b.fit - a.fit || (a === asis ? -1 : b === asis ? 1 : 0); });
    best = readings[0];
    finish(result, readings);
    if (best.id === 'pinyin') {
      result.kind = 'pinyin';
      result.tokens = pinyin.tokens;
      result.note = 'The user typed this as toneless pinyin.';
      var ambiguous = pinyin.tokens.find(function (token) { return token.ambiguous; });
      if (ambiguous && pinyin.count < 3) {
        result.verdict = 'ask';
        result.send = null;
        result.question = '"' + pinyinSpan(ambiguous.t).key + '" can be several words. Which one did you mean?';
      } else if (ambiguous) {
        result.verdict = 'context';
      }
    } else if (best.lang) {
      result.verdict = 'repaired';
      result.kind = 'layout';
      result.pair = best.id;
      result.language = best.lang.lang;
      result.layoutName = best.lang.layoutName;
      result.dir = best.lang.dir;
      result.send = result.restored = best.decoded.text;
      result.note = 'The keystrokes typed on a US English layout decode to ' + best.lang.lang +
        ' on the ' + best.lang.layoutName + ' layout.';
    } else {
      result.kind = !abstain && asis.label === 'English, as typed' && counts.total >= 4 &&
        (englishFit > -1.6 || coverage === 1) ? 'english' : 'unknown';
    }
    return result;
  }

  // Common English words which also admit a syllable-by-syllable reading.
  var sharedEnglish = new Set(('a an as at am and are be bee bin ban bang can con ' +
    'dang do fan fang gang gone hang he hen hey hi hum hung i in la long lung man ' +
    'may me mean men my no nun on one pan pang pay pen pin ping sang sane she shin ' +
    'shun sine sing song son sun sung tan tang ten ting ton to tune we win won you young').split(' '));

  // Frequent Mandarin function words and forms of address support short phrases.
  var mandarinWords = new Set(('ni nin wo ta hao ma ai bu de le guo ne ba shi zai dou cai ' +
    'ge lai qu yao you mei zhe na shenme zenme hen shang xia jin wan zao ' +
    'xie jian qing wen chi shuo').split(' '));

  // Find the spelling inside surrounding punctuation, retaining its original span.
  function pinyinSpan(raw) {
    var match = /[a-züê](?:u:|[a-züê]|['’-](?=[a-züê]))*/i.exec(raw);
    if (!match) { return null; }
    var outside = raw.slice(0, match.index) + raw.slice(match.index + match[0].length);
    if (outside && !/^[.,!?:;"'“”‘’«»()[\]{}…。，、？！（）【】《》—–-]+$/.test(outside)) { return null; }
    return {start: match.index, end: match.index + match[0].length,
      key: match[0].toLowerCase().replace(/u:|ü/g, 'v')};
  }

  function pinyinSegments(part, syllables) {
    var reachable = new Uint8Array(part.length + 1);
    reachable[0] = 1;
    for (var i = 0; i < part.length; i++) {
      if (!reachable[i]) { continue; }
      // The longest Mandarin spelling has six letters.
      for (var j = i + 1; j <= Math.min(i + 6, part.length); j++) {
        if (syllables.has(part.slice(i, j))) { reachable[j] = 1; }
      }
    }
    return reachable[part.length] === 1;
  }

  function pinyinReading(text, data, syllables, englishFit) {
    var lines = text.split(/\r\n?|\n|\u2028|\u2029/);
    var numbered = lines.map(function (line) { return /^\s*\d+[.)]\s+\S/.test(line); });
    var reading = pinyinProse(lines, [], data, syllables, englishFit);
    if (reading || !numbered.some(function (item, i) { return item && numbered[i - 1]; })) {
      return reading;
    }
    return pinyinProse(lines, numbered, data, syllables, englishFit);
  }

  function pinyinProse(lines, numbered, data, syllables, englishFit) {
    var tokens = [];
    var count = 0, known = 0, cues = 0, shared = 0, markers = 0, umlaut = false;
    for (var i = 0; i < lines.length; i++) {
      // Numbered answer choices may be in another language.
      var option = numbered[i] && (numbered[i - 1] || numbered[i + 1]);
      var words = lines[i].match(/\S+/g) || [];
      for (var j = 0; j < words.length; j++) {
        var raw = words[j];
        var token = {t: raw, pinyin: false, ambiguous: false, candidates: null, chosen: null};
        tokens.push(token);
        if (option || /^[\d.,!?:;"'“”‘’«»()[\]{}…。，、？！（）【】《》—–-]+$/.test(raw)) { continue; }
        var span = pinyinSpan(raw);
        if (!span) { return null; }
        var parts = span.key.split(/['’-]/);
        if (!parts.every(function (part) { return pinyinSegments(part, syllables); })) { return null; }
        var key = parts.join('');
        token.pinyin = true;
        count++;
        if (Object.prototype.hasOwnProperty.call(data.pinyin.words, key)) {
          token.candidates = data.pinyin.words[key];
          token.ambiguous = token.candidates.length > 1;
          known++;
        }
        if (sharedEnglish.has(key)) { shared++; }
        if (/[ln]v/.test(key)) { umlaut = true; }
        if (/zh|[xqv]|iao|iou|uai|iong|uang/.test(key)) { cues++; }
        if (mandarinWords.has(key)) {
          markers++;
        } else if (pinyinSegments(key, mandarinWords)) {
          markers += 2;
        }
      }
    }
    if (!count || shared === count && !known) { return null; }
    var strength;
    if (known) {
      strength = 3.5;
    } else {
      // Weak spellings need either distinctive syllables or an unlikely English reading.
      strength = -0.95 + Math.min(0.55, (count - 1) * 0.20) +
        1.6 * cues / count - 0.65 * shared / count;
      if (count > 1 && shared === 0 && englishFit < -0.35) { strength += 0.5; }
      if (markers >= 2 && shared * 2 < count && (count > 1 || englishFit < -0.7)) {
        strength = Math.max(strength, 1.6 + 0.5 * Math.min(1, markers / count));
      }
      if (umlaut) { strength = Math.max(strength, 3.2); }
    }
    return {tokens: tokens, strength: strength, count: count};
  }

  function resolve(result, tokenIndex, candidateIndex) {
    var token = result && result.kind === 'pinyin' && result.tokens && result.tokens[tokenIndex];
    if (!Number.isInteger(tokenIndex) || !token || !token.ambiguous ||
        !Number.isInteger(candidateIndex) || candidateIndex < 0 || candidateIndex >= token.candidates.length) {
      throw new RangeError('Choose a candidate of an ambiguous pinyin token.');
    }
    var tokens = result.tokens.slice();
    tokens[tokenIndex] = Object.assign({}, token, {chosen: candidateIndex});
    var index = 0;
    var send = result.input.replace(/\S+/g, function (raw) {
      var entry = tokens[index++];
      if (entry.chosen === null) { return raw; }
      var span = pinyinSpan(raw);
      return raw.slice(0, span.start) + entry.candidates[entry.chosen].word + raw.slice(span.end);
    });
    var open = tokens.filter(function (entry) { return entry.ambiguous && entry.candidates && entry.chosen == null; });
    if (open.length && result.verdict === 'ask') {   // other words still wait for the user
      return Object.assign({}, result, {tokens: tokens, partial: send, send: null,
        question: '"' + pinyinSpan(open[0].t).key + '" can be several words. Which one did you mean?'});
    }
    var confirmed = Object.assign({}, result, {verdict: 'repaired', tokens: tokens, send: send,
      note: 'The user confirmed the Chinese reading of the toneless pinyin.'});
    delete confirmed.question;
    return confirmed;
  }

  function examples() {
    if (!data) { throw new Error('Call AsTyped.init first.'); }
    var phrases = [
      ['Russian', 'ru>us', 'привет'],
      ['Hebrew', 'il>us', 'שלום לכולם'],
      ['Arabic', 'ara>us', 'صباح الخير'],
      ['Korean', 'ko>us', '안녕하세요'],
      ['Greek', 'gr>us', 'καλημέρα σας'],
      ['Hindi', 'in_deva>us', 'आप कैसे हैं']
    ];
    return phrases.map(function (example) {
      return {label: example[0], text: keyconv.type(example[2], example[1]).text};
    }).concat([
      {label: 'Pinyin word', text: 'beizi'},
      {label: 'Pinyin in context', text: 'wo yong beizi he shui'}
    ]);
  }

  var api = {init: init, analyze: analyze, resolve: resolve, examples: examples};
  return api;
});
