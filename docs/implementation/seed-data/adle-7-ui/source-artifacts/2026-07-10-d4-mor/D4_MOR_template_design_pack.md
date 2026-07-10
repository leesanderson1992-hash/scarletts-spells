# D4_MOR Morphology — 7-UI Template Design Pack (Part 2: Today's Lesson)

Status: design proposal for review before implementation
Scope: D4_MOR family only. Part 2 lesson flow. No composer changes, no evidence-semantics changes, no auto-generation, no parent dashboard.
Pedagogical references: Selby, *Morph Mastery* (2021); Math Academy-style mastery + spaced/interleaved review (already in composer).

---

## 0. Design position (where Lee overrules Codex, and where the contract still binds)

"High tech, interactive and fun" and "data-honest" are not in conflict. The contract's product rule forbids **fake correctness, fake evidence, and answer-visible recall** — it does not forbid rich interaction. So the ruling here is:

- **Interaction fidelity: maximum.** Drag-and-drop morpheme tiles, animated word assembly, colour-coded parts, themed environments. All of it.
- **Evidence fidelity: unchanged.** Every template keeps its current evidence class. Rich UI never shows the answer during independent recall, never invents correctness where there is no answer model, and falls back to a warm shell when required fields are absent.

The fallback ladder for every MOR template is: **Full interactive → degraded interactive (fewer fields) → warm shell (current behaviour)**. Nothing ever hard-fails in front of the child.

---

## 1. The core visual system: Morpheme Tiles

Borrowed conceptually from Morph Mastery's three-character, three-colour system (prefix / root-base / suffix each get a persistent colour and personality) — we adapt rather than copy:

| Part | Colour | Character concept (ours, original) | Tile shape |
|---|---|---|---|
| Prefix | Green | "Scout" — goes in front, changes the mission | Left jigsaw tab |
| Base/root | Gold | "Keeper" — holds the meaning, never changes | Centre block |
| Suffix | Blue | "Shifter" — changes the job of the word | Right jigsaw tab |

Rules:
- Tiles physically snap together (jigsaw edges) with a satisfying click + micro-animation.
- The base tile is always visually "heavier" (Keeper holds the meaning) — reinforces PRESERVE_BASE.
- The same tile system is used in **every** MOR template: intro, strip/build, meaning match, build word, and the review quick sort. One mental model, learned once.
- Tapping any tile at any time (outside recall gates) flips it to show its meaning gloss ("un- = not / opposite of").

### Theming layer (Greek & Latin roots)
For `D4_MOR_ROOTS_COMMON_LATIN_ROOTS`, `COMMON_GREEK_ROOTS`, `SCIENCE_MATH_ROOTS`, `ROOT_FAMILY_SPELLING`:
- Environment skin: Greek roots render on a **temple/parchment** scene (columns, laurel, marble tiles); Latin roots on a **Roman forum/mosaic** scene (roads, standards, mosaic tiles).
- Each root gets a one-line "artifact card": the root, its origin ("from Greek *tele* = far"), and 2–3 descendant words shown as a family tree radiating from the root tile.
- Micro-lore, not curriculum: one sentence of civilisation flavour max per lesson ("Roman engineers built *aqua*-ducts — water carriers"). Fun garnish, never a reading burden.
- Theme is a **skin driven by `themeKey` in prompt_data**, not a separate template. Default skin = neutral "word workshop".

---

## 2. Part 2 lesson flow for D4_MOR (per family method: STRIP_BUILD → MEANING_MATCH → BUILD_WORD → CONTROLLED_SPELLING → DICTATION)

```
Page 1  MICRO_READ_ONLY_INTRO   (the Lesson — interactive teaching page)
Page 2  LESSON_WORDS_INTRO      (meet your 5 words — may merge into Page 1 footer)
Page 3  MOR_STRIP_BUILD         (guided: take the word apart)
Page 4  MOR_MEANING_MATCH       (guided: what does the part mean)
Page 5  MOR_BUILD_WORD          (guided: rebuild the whole word)
Page 6  CONTROLLED_SPELLING     (look-cover-write-check)
Page 7  DICTATION_NO_IMAGE      (independent production)
Page 8  DIAGNOSTIC_DICTATION_PROBE (when composed)
```

---

## 3. Template-by-template design

### 3.1 MICRO_READ_ONLY_INTRO — "The Lesson" (Page 1, optionally spilling to Page 2)

**Desired UI — interactive teaching page, not a wall of text:**
1. **Title strip**: short skill title ("The prefix un-") + themed banner.
2. **Anchor word autopsy** (the hero moment): one anchor word assembles itself on screen from its tiles — `un` (green) slides in, `happy` (gold) lands, they click together. Child can drag them apart and back. Tapping each tile shows its meaning gloss.
3. **Rule card**: `child_friendly_explanation` + `rule_explanation` rewritten per micro-skill (see §5 — current workbook content is too generic; every MOR row shares one boilerplate explanation).
4. **Meaning flip demo**: for prefixes/suffixes, a before/after toggle — tap to add/remove the affix and watch the meaning caption change ("happy → not happy"). This is *the* teaching beat for "how the affix changes meaning."
5. **"Watch for this" cue**: one line from `common_misconceptions`, made specific (e.g. "Careful — the base word keeps its spelling: un + happy, not *unhapy*").
6. **Read-more shelf** (optional, parent-facing footnote): 1–2 recommended titles/resources for the skill (from a new `furtherReading[]` field). Collapsed by default; never blocks the child.

**Required prompt_data (new fields in bold):**
`childFacingCopy`, `teachingObjective`, `childFriendlyExplanation`, `ruleExplanation`, **`anchorWord {display, morphemes[{text, kind: prefix|base|suffix|root, gloss}]}`**, **`meaningFlip {without, with, captionWithout, captionWith}`** (affix skills only), **`watchForCue`**, **`themeKey`** (optional), **`furtherReading[]`** (optional), `lessonWordPreviews[]`.

**Evidence:** none (unchanged). **Fallback:** no `anchorWord.morphemes` → current static read-only card.

### 3.2 LESSON_WORDS_INTRO — "Meet your 5 words"

**Desired UI:** five word cards dealt onto the table, each pre-split into coloured tiles, grouped by provenance badge ("from your writing" vs "practice word"). Tap a card → it enlarges and shows why it's here ("You wrote *unhapy* — today we fix it for good"). Reveal pacing: cards flip in sequence, child taps to advance.

**Required prompt_data:** current `words[]` **plus per word: `morphemes[]` (as above), `inclusionReason`, optional `originalMisspelling`** (only shown in this teaching context, never during recall).
**Evidence:** none. **Fallback:** no morphemes → current plain word list.

### 3.3 MOR_STRIP_BUILD — "Take it apart" (guided)

**Desired UI:** the whole word appears as a single sealed block. Child drags a "split" handle (or taps between letters) to fracture it at morpheme boundaries. Correct split → the block cleaves into coloured tiles with a click; each tile flips to show its gloss. Wrong split point → gentle shake, boundary hint glows after 2 misses (scaffold, not punishment). Then reverse: tiles scatter, child drags them back into order.

**Required prompt_data:** `childFacingCopy`, `targetWord`, **`morphemes[]`**, **`splitPoints[]` (character indices)**, **`feedbackCopy {correct, hint}`**.
**Evidence:** guided attempt (unchanged — no correctness pricing; interaction completion is logged, not scored).
**Fallback:** no morphemes → current warm prompt + text input.

### 3.4 MOR_MEANING_MATCH — "What does this part mean?" (guided)

**Desired UI:** the target morpheme tile sits centre; 3–4 meaning cards orbit it. Child drags the right meaning onto the tile (or taps). Correct → tile and meaning fuse, and 2–3 example words containing the morpheme cascade below as a mini word-family. Distractor meanings are plausible (drawn from sibling morphemes in the same family — e.g. for *un-*: "again", "before", "not").

**Required prompt_data:** `childFacingCopy`, **`morpheme {text, kind}`**, **`choices[{gloss, isCorrect}]`** (exactly one correct), **`exampleWords[]`**, `feedbackCopy`.
**Evidence:** guided attempt. Because there IS an answer model here, correctness **can** be recorded honestly as guided-level (low-weight) evidence — but only if that's explicitly planned; default = log selection without pricing, same as today.
**Fallback:** no choices → warm prompt.

### 3.5 MOR_BUILD_WORD — "Build the whole word" (guided → bridge to production)

**Desired UI:** meaning-first construction. Prompt gives the *meaning* ("Build the word that means 'not kind'"). A tile tray holds the correct parts **plus 1–2 distractor tiles** (wrong affix, or a misspelled base — directly targeting the misconceptions list). Child drags tiles onto the assembly rail. Snap animation on correct order; the completed word pulses gold. Optional second round: same word, but the base tile is now blank and the child types the base letters into it (typing inside the tile — bridges to spelling).

**Required prompt_data:** `childFacingCopy`, `targetWord`, **`meaningPrompt`**, **`tiles[{text, kind, isDistractor}]`**, **`typedBaseRound: boolean`**, `feedbackCopy`.
**Evidence:** guided attempt (unchanged).
**Fallback:** no tiles → warm prompt.

### 3.6 CONTROLLED_SPELLING — "Look, cover, write, check"

**Desired UI:** explicit four-state machine (the contract already flags this):
1. **Look** — word shown as coloured tiles, child studies it (min dwell 3s).
2. **Cover** — child slides a physical-feeling shutter over the word (same recall-gate muscle as the reflection Hide Word switch — consistent interaction language).
3. **Write** — input appears *only after* cover. As the child types, letters fill a neutral rail (no colour hints during recall — colour during recall would leak morpheme boundaries).
4. **Check** — word reveals; matching segments turn gold/green/blue, mismatched span highlighted softly. Retry loops back to Look.

**Required prompt_data:** `childFacingCopy`, **`visibility: 'copy' | 'look_cover_write_check'`**, **`morphemes[]`** (for the check-state colouring), expected casing flag.
**Evidence:** first-exposure lesson attempt, non-punitive (unchanged). The cover gate strengthens honesty of this evidence — recall, not transcription.
**Fallback:** no morphemes → plain check state; no visibility field → current visible-copy behaviour.

### 3.7 DICTATION_NO_IMAGE / DICTATION_SENTENCE_CONTEXT — independent production

**Desired UI:** keep it clean — this is the evidence-critical step, so restraint *is* the design. Hear-word button (speech synthesis with `pronunciationText` override), optional sentence context with blank, replay limit (default 3, generous), neutral input. After submit: morpheme-coloured diff against target (teaching moment lives *after* the attempt, never before). No tiles, no hints pre-submit.

**Required prompt_data:** current fields **plus `pronunciationText` (optional), `sentenceContext {text, blankIndex}` (optional), `replayLimit`, `postSubmitMorphemes[]`**.
**Evidence:** unchanged (scheduled review / first-exposure / probe per composition).

### 3.8 DIAGNOSTIC_DICTATION_PROBE

**Desired UI:** framed as a "scouting mission" — explicit "it's fine not to know these yet" banner, progress dots not scores, no red anywhere, neutral "logged" tick after each word regardless of correctness. Misses route silently.
**Required prompt_data:** current + **`introCopy`**, **`noStakesFraming`**. **Evidence:** unchanged.

### 3.9 Part 1 tie-in: REVIEW_QUICK_SORT (base/prefix/suffix/root dimension)

Same tile system: due words fly in one at a time; child flicks each word (or its highlighted chunk) into one of the labelled bins (Prefix / Base / Suffix / Root — colour-matched). Requires `sortBins` + `correctBin` per word + optional per-decision explanation — exactly the fields the handoff already lists as needed. Feedback policy field decides immediate vs end-of-round reveal.

---

## 4. Design matrix (contract-required output shape)

| Template | Current UI | Desired UI | New required fields | Evidence (unchanged) | Correctness calc | Affects scheduler | Missing data today | Fallback |
|---|---|---|---|---|---|---|---|---|
| MICRO_READ_ONLY_INTRO | static text | animated anchor-word autopsy + meaning flip + themed skin | anchorWord.morphemes, meaningFlip, watchForCue, themeKey, furtherReading | none | no | no | morpheme decomposition, per-skill explanations | current static card |
| LESSON_WORDS_INTRO | plain list | tile-split word cards + inclusion reasons | per-word morphemes, inclusionReason | none | no | no | morphemes, reasons | plain list |
| MOR_STRIP_BUILD | warm shell | drag-to-split + rebuild | morphemes, splitPoints, feedbackCopy | guided attempt | no (completion only) | no | morphemes | warm shell |
| MOR_MEANING_MATCH | warm shell | drag meaning onto tile + word-family cascade | morpheme, choices[], exampleWords | guided attempt | possible (deferred) | no | glosses, distractors | warm shell |
| MOR_BUILD_WORD | warm shell | meaning-first tile assembly + distractors + typed-base round | meaningPrompt, tiles[], typedBaseRound | guided attempt | no | no | tiles, meaning prompts | warm shell |
| CONTROLLED_SPELLING | visible copy | look-cover-write-check state machine | visibility, morphemes (check colouring) | first-exposure attempt | yes (non-punitive, unchanged) | no | morphemes | visible copy |
| DICTATION_NO_IMAGE | hidden + hear | replay-limited dictation + post-submit morpheme diff | pronunciationText, replayLimit, postSubmitMorphemes | first-exposure / review | yes (unchanged) | review path only (unchanged) | morphemes for diff | current dictation |
| DICTATION_SENTENCE_CONTEXT | as above | + sentence blank | sentenceContext | as above | yes | as above | sentences | current |
| DIAGNOSTIC_DICTATION_PROBE | input list | scouting-mission framing | introCopy, framing | probe attempt | logged, non-punitive | no (unchanged) | copy only | current |
| REVIEW_QUICK_SORT (MOR dim) | warm/basic sort | flick-to-bin tile sort | sortBins stable labels, correctBin, explanation, feedbackPolicy | local (unchanged) | local only | no | bins + correct bin per word | warm prompt |

---

## 5. Teaching content plan — the real blocker

The workbook's D4_MOR content is **one boilerplate explanation copy-pasted across all 24 micro-skills** (same `child_friendly_explanation` and `common_misconceptions` on every row). That's fine as scaffolding but it cannot drive per-skill lesson pages. Before UI work lands, author per-micro-skill:

1. **Specific child_friendly_explanation** — e.g. UN: "*un-* is a tiny word part that means **not** or **opposite**. Stick it on the front and the word flips: kind → unkind. The base word never changes its spelling."
2. **Anchor word + morpheme decomposition** for the intro autopsy.
3. **Meaning glosses** per affix/root (un- = not; re- = again; pre- = before; dis-/mis- = not/wrongly; -ness = noun-maker "state of"; -ful = full of; -less = without; -ment = noun-maker; -ous = full of (adjective); -ity = noun-maker; -al = adjective-maker; -able/-ible = can be done; roots per artifact card).
4. **Skill-specific misconception** (from the generic list, pick the live one): UN → doubling/losing letters at the join (*unecessary* class of errors is IN_IM though; for UN it's base corruption); ABLE_IBLE → which ending; IN_IM_IL_IR → assimilation choice by next letter; PRONUNCIATION_SHIFT → trusting sound over family.
5. **Morpheme metadata per canonical word**: the teaching-dictionary template already has `morphemes` + `morphology_notes` columns in `canonical_word_metadata` — currently empty. This is the single dataset that unlocks every MOR template. **Authoring this column (plus split points and glosses) is the critical path.**
6. **Distractor sets** per micro-skill (sibling-affix glosses; near-miss tiles like *-able/-ible*, *dis-/mis-*).
7. **Theme assignment**: `themeKey = greek | latin | neutral` per micro-skill (ROOTS_* get themed; affixes stay neutral or get a light "word workshop" skin).
8. **Further reading** (parent shelf): *Morph Mastery* word lists/games for home use; age-appropriate etymology titles (e.g. root-word picture dictionaries, Greek-myth readers for the Greek-root theme). Author as `furtherReading[]` in the workbook.

Selby principles to encode (not copy): meaning-first before spelling; consistent colour/character per morpheme class; cumulative revision of taught morphemes (already handled by your FSRS-style Part 1); triggers/memory cues generated **by the child** (matches your MEMORY_CUE amendment); vocabulary-stretch words allowed in teaching moments even if not spelling targets.

---

## 6. Answer to "Does this need more than a UX design?"

Yes — three things, or the UX ships as warm shells with nicer paint:

1. **Content authoring pass (critical path):** morpheme decomposition + glosses + distractors + per-skill explanations for D4_MOR words and micro-skills. Workbook columns exist; they're empty. Without this, every fancy template hits its fallback.
2. **prompt_data schema extension:** the new fields in §3 need to be added to the composer's emission for MOR items and to the template contract. This is a data-shape change, not evidence-semantics change, so it's contract-safe — but it touches `daily-assignment-composer.ts`, not just components.
3. **A tile component library:** MorphemeTile, TileRail, SplitHandle, CoverShutter, BinSort — built once in `components/adle/activities/shared`, reused across all five MOR interactions and the review sort. This is the piece that makes "fancy" cheap for the next six families.

Suggested sequencing: author content for **one** micro-skill (D4_MOR_PREFIXES_UN) end-to-end → build the tile library + all templates against it → validate with Scarlett → then batch-author the remaining 23 micro-skills into a now-proven schema.
