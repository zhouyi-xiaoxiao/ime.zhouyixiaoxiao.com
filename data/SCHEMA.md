# bundle.json — schema `ime-site-bundle/1`

The site reads one file, `data/bundle.json`, plus `data/keymaps.json` (the converter's key maps,
schema in `tools/CONVERTER_NOTES.md`). `tools/make_bundle.py` writes the bundle and
`data/trace.tsv`, which lists every value with the summary file and key it came from and the rule
applied (k/n, a Wilson interval, a difference). A field that is absent means "not available";
nothing is interpolated, and a (setting, language, arm) with no data has no cell.

Shares are fractions (0.57 = 57%) in `cells`, layout `contrasts` and `costs`; the Chinese tables
(`zh`) keep the source's percent and points. Intervals are 95%.

## Top level

| key | type | what |
|---|---|---|
| `schema` | string | `ime-site-bundle/1` |
| `built` | date | build date |
| `status_legend` | {pilot, interim, final: string} | what each status means |
| `sources` | [{id, path, sha256_16}] | the files read (first 16 hex of their sha256); a path that would name the target venue is given as a neutral label, the hash still identifies the file |
| `methods` | {id: string} | interval methods, cited by `ci_method` |
| `operators` | {id: string} | typing operators, cited by `operator` |
| `runs` | [Run] | the runs the data come from |
| `numbers` | {key: Number} | numbers the page prints in sentences, under the poster's keys |
| `copy` | {block id: {text, big?, emphasis?, short?}} | the poster's checked sentences, with `{{key}}` placeholders filled from `numbers` |
| `arms` | [Arm] | the typed forms ("arms") |
| `kind_text` | {kind: string} | how each arm kind is described |
| `plan` | Plan | what the main run tests, from the run plan (no results) |
| `design` | Design | which forms the main run builds per language, the map's settings, what is not planned, and what the pilot reported pooled only |
| `layout_families` | {family: {label, note, langs}} | the layout pilot's families: cross-script, Greek (phonetic), near-identity (German, French), shift (English, a cipher) |
| `settings` | [Setting] | every registered setting (147) plus the pilot's `glm_5_3_flash=off-requested` |
| `models` | [Model] | settings grouped by model |
| `languages` | [Language] | the 122 Belebele variants and one pool |
| `cells` | [Cell] | setting × language × arm × run |
| `contrasts` | [Contrast] | named differences with intervals |
| `costs` | [Cost] | list-price cost per call, tokens and latency per setting and arm |
| `zh` | Zh | the Chinese ambiguity tables |

## Run

`id` (e.g. `pilot_layout_20261115`), `label`, `date`, `status` (`pilot` / `interim` / `final`),
`what`, `calls` (all calls of the run), `items_per_language?`, `calls_per_cell`, `source`.

## Number

`value` (number, list or null for text), `text` (as printed), `source` (file), `key` (key path in
that file), `rule` (how the value follows from the key, or null). Keys are the poster pack's
(`poster/v2/content/data.json`); make_bundle.py recomputes each from the summaries and stops if
the result differs from the poster's checked text. Four values that no summary file holds (the
round-trip count 280/300, m = 2, the answer "0", the earlier study's 48 calls) are taken from the
poster pack with its own source note.

## Arm

| key | what |
|---|---|
| `id` | the main run's condition name: `native`, the ladder `kb_layout_keys` (a), `kb_layout_keys_ctrl` (b'), `kb_layout_keys_recog` (b''), `kb_layout_keys_named` (b), `kb_lk_phonetic` (c), `kb_lk_rand` (d), `kb_lk_rand_note` (e), `kb_lk_rand_table` (f), `kb_lk_rand_shamtable` (f0), `kb_lk_rand_xtable` (f x); `native_ctrl`, `native_nopassage`; the lossy and other input forms `kb_clean`, `kb_pinyin_tone`, `kb_pinyin_word`, `kb_pinyin_unspaced`, `kb_pinyin_initials`, `kb_telex`, `kb_vni`, `kb_romaji_ime`; `kb_layout_keys_rev_{ru,il,ko,ara}`; the mechanism forms `kb_layout_keys_spaced`, `native_spaced`, `kb_layout_keys_maybe`, `native_maybe`, `kb_layout_keys_demo3`, `kb_lk_rand_demo3`, `native_optrev`, `kb_layout_keys_optrev`. A condition with the suffix `_qonly` is the same arm with `scope: question_only` |
| `label`, `short` | display names |
| `what` | one or two sentences |
| `kind` | `native` / `lossless` / `lossy` |
| `told` | true when a sentence before the item tells the model the keyboard state (drawn blue) |
| `design` | `core` (the main run's tests and the pilots), `secondary`, `exploratory` |

## Setting

| key | what |
|---|---|
| `id` | `KEY=SETTING` as in `docs/MODEL_MATRIX.md` and the run tables (`gpt_6_1_terra=off`) |
| `model_key`, `model_id` | registry key; the model id sent |
| `vendor`, `family` | maker; model line = model id without version numbers and dates (rule in make_bundle.py) |
| `tier` | registry tier 0 / 1 / 2 |
| `open_weights` | `true` when the registry lists an open-weight release; absent otherwise (absent is not a check of the licence) |
| `open_weights_repo` | the repository id where the registry gives one and does not mark it unverified |
| `level`, `level_label`, `level_order` | registry setting name; label in the poster's words ("effort none", "thinking off"); order off < off-requested < minimal < low < medium < high < xhigh < max, `on` last |
| `reasoning` | `off` / `on` / `off-requested` (requested, not observed) |
| `output_budget` | the registry's output-token budget for this setting (MODEL_MATRIX.md); `pilot_output_budget` is what the November pilots sent |
| `price_class` | `cheap` / `middle` / `expensive` / `unknown` (the run plan's roster rule, section 6). List prices themselves are not published; the site shows list-price cost per call only |
| `roster` | true for the 147 registered settings |
| `smoke`, `smoke_note` | the registry's 5-call smoke check: `pass`, `pass*` or `fail` (with the reason) |
| `planned` | true when the main run plans the setting (registered and passed the smoke check) |
| `in_map` | true for the five settings of the 122-variant map |
| `pilot_names`, `pilot_run_health` | the setting's name in the November pilots (`terra_none`); its run health over all its pilot calls {calls, no_reply, refusal, truncated, unparseable} (layout pilot summary, section 1) |
| `has_cells` | whether any cell exists |

## Language

`code` (FLORES-200, `rus_Cyrl`), `bcp47` (`ru-Cyrl`, for `lang=`), `name_en`, `name_native`
(from CLDR via macOS; four English names that CLDR lacks are set in make_bundle.py), `script`,
`script_name`, `dir` (`ltr`/`rtl`), `romanised_variant` (a Latin-script variant of a language
written in another script; no native-script name is given), `layout_pair` (primary D3x pair, e.g.
`ru>us`; `us_shr>us` for English: every key shifted one to the right), `layout_family` (the pilot
languages' family, see `layout_families`), `kb_clean`
{operator: D1 romanise / D2 strip diacritics, scheme}, `null_control`, `already_romanized`,
`groups` (`map` = all 122, `breadth` = has a wrong-layout condition, `ladder` = the four main-run
ladder languages, `pilot_layout`), `kind` (`variant` / `pool`). The pool `pool_cross6` has
`members` (the six cross-script variants of the layout pilot).

## Cell

| key | what |
|---|---|
| `setting`, `lang`, `arm`, `scope` | what was measured; `scope` = `full` (whole item typed) or `question_only` |
| `run`, `status`, `date` | which run; `pilot` / `interim` / `final` |
| `items`, `calls` | items and calls behind the number |
| `correct`, `acc`, `ci`, `ci_method` | correct calls, accuracy (share), interval [lo, hi], method id |
| `outcomes` | {correct, wrong, refused, truncated, unparseable} and, from the main run, `declined` (a provider's stock decline) and `no_reply`: how the calls ended; a key is absent where the source does not split it |
| `outcomes_from` | `summary` (the counts as the summary gives them), `run_health` (exact: the setting's run health has no cut-off, unparseable or missing reply, so every call that is neither correct nor refused is wrong) or `not_split` (the page shows the setting's run-health totals instead) |
| `no_valid` | everything but correct and wrong (refused, declined, truncated = cut off at the output budget, unparseable, no reply): the headline "no valid answer"; absent where it is not known |
| `subset` | set when the cell rests on a subset of the items (Claude: the first 20 items of each cross-script layout) |
| `reasoning_tokens` | {mean, median} per call as each API reports them |
| `output_tokens` | {mean} |
| `cost_per_call` | {value, currency} at list price; for the pilots see `costs` instead |
| `latency_s` | {median} or {mean} |
| `floor` | {value, method: `overlap`}: the floor without reading for this record set (below) |
| `operator` | id in `operators` where the typed text came from another operator than the arm's main one |
| `per_map`, `note`, `condition`, `seed`, `pair`, `draw_ranks` | where given |

**Floor without reading** (`method: overlap`): expected accuracy of always picking the option with
the largest share of its letter triples found in the passage, ties sharing credit, computed on the
typed text itself; the question is not used. Pilot: 34.8% over the six cross-script layouts (29% to
41% by language), 32.0% on their native text; chance is 25%. It is not the accuracy without the
passage: that is the arm `native_nopassage` of the main run.

## Contrast

`id`, `setting?`, `lang?`, `a`, `b` (arm ids), `label`, `est` (a − b), `ci`, `ci_method`,
`unit` (`share` or `points`), `n`, `a_value?`, `b_value?`, `run`, `status`, `family`
(`exploratory` / `confirmatory` / `secondary`), `note?`; main-run contrasts may add `p_holm`,
`supported`, `ci_settings`.

## Cost (pilot)

`setting`, `arm`, `scope` (what was pooled), `calls`, `input_tokens_mean`, `output_tokens_mean`,
`reasoning_tokens_mean`, `cost_per_call` {value, currency}, `latency_s`, `run`, `status`,
`operator?`. From the pilot cost table (means over the setting's successful calls of that form in
the layout pilot: every language it ran, repeats included; `calls` says how many).

## Zh

`classes` (18), `m` (2), `bound_pct` (50), `forced` [{id, label, k, n, pct, ci, ci_method, run}],
`flag` [{format `open`/`free`/`ab`, format_label, outcome, sentence `none`/`control`/`note`,
sentence_label, k, n, pct, ci, ci_method, determined {k, n, pct}, bare? {k, n, pct}}],
`sentences` {note, control} (the exact sentences), `contrasts` [{id `H1`…`H2c` or
"`x` minus `y`", a, b, outcome, est, ci (over classes), ci_settings (settings and classes
resampled), p_holm or p, supported, classes_pos, classes_neg, family, unit: points}],
`per_setting` [{setting, pilot_name, forced {k, n, pct, ci}, arms {arm: {k, n, bare, declines}},
contrasts {H: {est, ci}}, reasoning_share}], `calls` {pilot, followup}, `items`.

In `per_setting.arms`, `k` counts the outcome of the format: correct for `fc`, answers 0 for
`ab*`, says that the text does not settle the answer for `free*` and `open*`, out of `n` calls on
the 36 undetermined items.

## Plan and Design

`plan`: `confirmatory` [{id C1…C5, label, a, b, what}], `alpha`, `correction`, `ladder_languages`,
`items` {first_rank, last_rank, extended, pilot_ranks, text}, `cluster`, `scope`, `freeze`,
`exploratory` [string], `source`, `date`. Written from the run plan with its section 10 rulings
(which win over its sections 1 to 9); make_bundle.py stops if the wording it depends on changes.

`design`: `built` {language: [arm, or `arm@question_only`]} from the main data build's summaries
(a form that no run builds for a language, and that has no cell, is shown as "not part of the
design"); `map_settings`; `not_planned` [{model_key, arms_kind, why}]; `pilot_pooled_only`
[{setting, arm, langs, pooled, run}] (run per language, reported only pooled); `roundtrip_main`
{language: [exact, items]} and `roundtrip_ranks` (the D3x round trip of the wrong-layout arm).

## Main-run input (the adapter's contract)

`make_bundle.py --mainrun PATH` reads PATH: one `.json` file (an object, a list, or
`{"cells": [...], "contrasts": [...]}`), a `.jsonl` file (one object per line), or a directory of
such files. One object per (setting, language, arm[, scope]):

```json
{"setting": "gpt_6_1_terra=off", "lang": "rus_Cyrl", "arm": "kb_layout_keys_named",
 "scope": "full", "run": "mainrun_20261119", "status": "interim", "date": "2026-11-27",
 "items": 200, "calls": 600, "correct": 412, "acc": 0.6867, "ci": [0.641, 0.729],
 "ci_method": "cluster bootstrap over passages, 95%",
 "outcomes": {"correct": 412, "wrong": 170, "refused": 0, "truncated": 18, "unparseable": 0},
 "reasoning_tokens": {"median": 0, "mean": 0}, "output_tokens": {"mean": 9.1},
 "cost_per_call": {"value": 0.00051, "currency": "USD"}, "latency_s": {"median": 1.4},
 "floor": {"value": 0.39, "method": "overlap"},
 "condition": "kb_layout_keys_named", "seed": null, "pair": "ru>us"}
```

Required: `setting` (KEY=SETTING of MODEL_MATRIX.md), `lang` (FLORES-200), `arm` (an arm id; a
seeded name such as `kb_lk_ru-us_s7_table` is mapped to its arm), `items`, `calls`, `acc`, `ci`,
`status` (`interim` or `final`), `run`, `date`. A condition with the suffix `_qonly` becomes its arm
with `scope: question_only`. Everything else is optional; `no_valid` is
computed from `outcomes`. A `ci_method` that is not a key of `methods` is shown as written.
**explorer.json of `analysis/mainrun/`** (`explorer.py`) is read as it is: a JSON file with
`cells`, `settings` and `interval` is converted cell by cell (the registry id is
`model_key=reasoning_level` from its `settings`; condition names map as above; outcome shares become counts; `refusal` stays
*refused*, `vendor_decline` and `stock_decline` become *declined*; the run is named after the
file's folder and dated by the file unless the document carries `run` and `date`).

Contrasts: objects with `"kind": "contrast"` (or in `contrasts`) with `id`, `a`, `b`, `label`,
`est`, `ci`, `unit`, `family`, `status`, and optionally `setting`, `lang`, `p_holm`, `supported`,
`ci_settings`. The site prefers, for the same (setting, language, arm, scope), a final cell over an
interim one over a pilot one, and lists the others beside it.

`tools/test_bundle.py` checks this contract: every condition name of the main data build maps to an
arm (a `_qonly` name to the same arm, question-only scope), a synthetic file in each input shape
reads back under those arms, and the bundle on disk names no venue, local path or price list.
