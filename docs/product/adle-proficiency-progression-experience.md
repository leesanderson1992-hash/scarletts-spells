# ADLE Proficiency Progression Experience

## Status and ownership

Classification: `APPROVED_TARGET_NOT_YET_IMPLEMENTED`

Model: `ADLE_PROFICIENCY_MODEL_V1`

This contract owns child and parent presentation of ADLE micro-skill
proficiency. It authorises no UI or runtime change in this pass. Educational
truth and calculations remain owned by the canonical proficiency contract and
V1 maths specification. Word-route transitions are owned by the ADLE Word
Progression and Review Contract; this document only presents its facts.

## Product intent

Every micro-skill should feel alive and learnable. The child sees a clear Level
1–5 journey and useful progress between level-ups. The parent sees why the
level exists, what evidence supports it, where evidence is still thin, and what
the child is learning now.

Neither surface exposes raw coefficients, an unexplained mastery percentage, or
the size of the unobserved dictionary as learner failure.

## Stable progression identity

| Level | Educational meaning | Default child label | Parent label |
|---:|---|---|---|
| 1 | Initial controlled application | Discovering | Initial application |
| 2 | Emerging independent retrieval | Building | Building independence |
| 3 | Varied breadth and early contextual transfer | Strong | Flexible |
| 4 | Delayed, complex, contextual and established authentic transfer | Skilled | Robust |
| 5 | Broad, generalised, spaced transfer with low recurrence | Expert | Generalised |

Numeric Levels 1–5 are stable. Labels are product copy and may change without
changing model semantics. Before Level 1, show “Ready to discover” or omit the
skill from the main child shelf; never show “failed” or “0%”.

## Child experience

### Skill card

The default card contains:

```text
Split Digraph o_e

LEVEL 3 — STRONG
[========--] toward Level 4

14 words discovered
3 tricky-word successes
Used while solving a challenge
1 next step: use it in your own writing
```

Required elements:

- child-friendly micro-skill name;
- current numeric level and label;
- progress toward the next level;
- two or three evidence achievements;
- one truthful next-step message; and
- a content-limited message when the governed pool, not the learner, blocks a
  gate.

Do not show raw breadth ratios, model versions, recurrence coefficients,
relationship provenance, or arbitrary decimal scores.

### Achievement vocabulary

Backend facts map to positive, specific messages:

| Backend fact | Child message |
|---|---|
| First eligible controlled word | New word discovered |
| New distinct word | Your skill works in a new word |
| First word in another group | New word type discovered |
| First Extended/Challenge word | Tricky word conquered |
| Later independent success | Remembered after a delay |
| Contextual Transfer success | Used while solving a challenge |
| Verified authentic correct use | Spotted in your real writing |
| Later success after a causal error | Came back strong after learning |
| Day-3-or-later isolated lapse | Quick memory check tomorrow |
| Next-day recovery pass | Remembered it on the comeback |
| One-rung regression | Rebuild from an earlier memory step |
| All next-level gates pass | Level up |

Avoid “points earned”, “percentage correct across all words”, and negative copy
for unknown/unobserved content.

### Progress bar

The bar is the V1 next-level progress calculation translated into a familiar
visual. It is motivational, not educational truth. The bar must:

- identify its destination level;
- be recomputed under a pinned model version;
- never change the level itself;
- cap each dimension so repeated easy work cannot dominate;
- explain the most useful unmet gate in child language; and
- show Level 5 as maintenance/continued discovery, not `100% of spelling`.

The expanded child detail may show four illustrated facets:

- **Words** — new distinct words;
- **Word types** — representative and tricky forms;
- **Use** — challenge and real-writing transfer; and
- **Remembering** — success after time.

These are not four competing scores. They are a child-language explanation of
the gated profile.

### Level-up event

A level-up should be celebratory but compact:

```text
Level 4 — Skilled!

You used Split Digraph o_e across different words,
remembered it after a delay, and used it in a challenge.
```

Rules:

- emit one idempotent presentation event per
  `learner + skill + achieved level + model version`;
- do not mint a Golden Bar or Gold Coin from a proficiency level-up;
- retain the historical level-up even if later recurrence lowers the current
  derived level/confidence; and
- describe later renewed practice as strengthening, not loss of prior effort.

### Authentic-writing discoveries

When verified authentic writing reveals positive knowledge, the child may see:

```text
Your writing showed three spelling skills!

hopeful helped show:
- Split Digraph o_e
- Suffix -ful
- Keep the base word
```

The surface must make clear that one word revealed several skills; it must not
pretend three separate writing events occurred. Only governed relationships are
shown. Suspected analyser output is not celebrated as canonical proficiency
until existing verification boundaries pass.

### Content/allocation limitations

When a level cannot be certified because the governed word pool lacks required
bands or groups, do not show an impossible learner task. Child copy should be
neutral, for example:

```text
You have completed the challenges available for this skill.
More word adventures are being prepared.
```

The parent/admin surface carries the technical limitation.

## Parent and educator experience

### Summary card

```text
Split Digraph o_e
Level 4 — Robust

Breadth
18 distinct demonstrated words

Diversity and complexity
Foundation: demonstrated
Extended: demonstrated
Challenge: developing in transfer
3 of 4 required representative groups

Transfer
Contextual: strong — 5 words
Authentic: established — 2 words

Stability
4 successful days across 35 days
0 unresolved causal misspellings in the current 28-day window
```

This view should lead with the level and plain-language interpretation, then
show the independent dimensions. A percentage may appear only as labelled
“progress toward Level N”, accompanied by its unmet gates.

### Required detail

For each skill, expose where available:

- current and highest historically observed level under each model version;
- distinct demonstrated word count;
- current breadth requirement and governed pool size;
- demonstrated and required representative groups;
- Foundation/Extended/Challenge coverage;
- independent, contextual, and authentic distinct-word counts;
- challenge-load transfer count;
- successful observation days and elapsed span;
- recent governed causal misspellings and whether resolved by later independent
  evidence;
- affected words' current spaced-review rung, next-day recovery status, and
  consecutive-failure count where non-zero;
- words currently being learned/reviewed;
- allocation/content limitations;
- current instructional state summary; and
- “why this level?” explanation with expandable event and relationship
  provenance for support/debug roles.

Unknown words must not appear as failures. Raw unverified candidates should be
visibly labelled and excluded from canonical counts.

### Diagnostic language

Use:

- “demonstrated in 18 distinct words”;
- “contextual transfer established”;
- “authentic transfer is still emerging”;
- “one recent causal error is awaiting later independent confirmation”; and
- “Challenge-band content is limited for this skill”.

Avoid:

- “18/240 words correct” when 222 were unobserved;
- an unexplained aggregate score without gates;
- “failed the skill” for one causal misspelling; and
- presenting repair as if it were independent transfer.

### Comparison and history

Parent trend views may show dimension changes over time. They must pin the
model version and distinguish:

- new learner evidence;
- relationship/pool changes;
- requirement-policy recalibration; and
- verification changes.

A recomputed level change caused by a new model version must be labelled as a
model update, not attributed to learner regression.

## Relationship to Word Treasure

The skill card may link to related Treasure words, but the two journeys remain
visually and semantically distinct:

| Proficiency | Word Treasure |
|---|---|
| Learner + micro-skill | Learner + exact once-misspelled word |
| Breadth, diversity, transfer, stability | Nugget, Forge, Golden Bar, Vault |
| One correct word may support several skills | One event affects that word's own journey |
| Level-up does not mint a Bar | A Bar does not set a skill level |
| Contextual Review supports skill transfer | System-selected Review is not default authentic Golden Bar use |

If the same event affects both projections, the UI may celebrate both outcomes
without merging them.

## Empty, loading, and changed states

- **No evidence:** “No spelling adventure started yet.”
- **Suspected authentic evidence:** show as awaiting grown-up verification, not
  in level counts.
- **Allocation limited:** identify content limitation and suppress misleading
  next-step countdowns.
- **Recent causal recurrence:** keep historical achievements; show the current
  strengthening or recovery action emitted by the Word Progression contract.
  UI code must not derive the next route state.
- **Model update:** explain that the way evidence is summarised changed; do not
  imply the child lost completed work.
- **Unavailable provenance:** fail closed and omit the affected candidate from
  canonical counts; parent surface may show a data-quality notice.

## Accessibility and child safety

- Do not use colour alone for levels or dimensions.
- Provide text alternatives for bars and icons.
- Avoid rank comparison with other children.
- Avoid shame, streak-loss pressure, or language implying unknown words are
  deficiencies.
- Keep child next steps achievable and tied to a real unmet gate.
- Parent detail can be diagnostic without exposing other learners or raw
  sensitive writing by default.

## Acceptance criteria

The released experience must prove:

1. a child can name their current level and one next step;
2. progress remains visible between level-ups;
3. Level 5 does not imply all dictionary words are known;
4. a parent can explain all four dimensions from the screen;
5. the UI distinguishes contextual from authentic transfer;
6. a repair is never presented as an original Review success;
7. allocation limitations are not blamed on the learner;
8. multi-skill positive discoveries retain one source event;
9. Word Treasure remains separate;
10. every displayed count can be reproduced from the pinned profile;
11. one failed controlled production does not hide the other production's
    successful word graduation;
12. later failures never erase the child's historical word discoveries; and
13. recovery, one-rung regression, and controlled reteaching use encouraging,
    stage-accurate language.
