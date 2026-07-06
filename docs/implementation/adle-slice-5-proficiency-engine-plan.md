# ADLE Slice 5: Micro-skill Proficiency Engine — Plan

## Status

- Status: `COMPLETE 2026-07-05. Owner signed off the QA artefact
  adle-slice-5-proficiency-report-samples-2026-07-05.md (implementation-
  order step 7), closing the QA gate; closeout recorded (step 8).
  Decision-log entries "2026-07-05 — ADLE Slice 5 implemented (owner QA
  gate pending)" and "2026-07-05 — ADLE Slice 5 complete: owner QA
  sign-off". No migration and no new storage landed (open question 1);
  proficiency is a pure recomputed read model over the Slice 4 evidence
  states. Next: Slice 6 (live session surface + completion wiring).`
- Previous status: `Implemented 2026-07-05 (all implementation-order
  steps 1–6), owner QA gate pending. Landed: 5A lib/adle/proficiency-policy.ts
  (PROFICIENCY_POLICY_V1, credit table, target formula helpers, badging
  vocabulary constants); 5B/5C lib/adle/micro-skill-proficiency.ts (pure
  breadth-credit projection over Slice 4 states — status-5 gate,
  contrast exclusion, override-aware levels, allocation-derived targets,
  first-populated-level gating never averaging, blueprint reporting
  shape, notYetSecureSkillKeys deriver); 5D additive fail-open
  notYetSecureSkillKeys extension in lib/adle/composer-skill-selection.ts
  with the actionability guard (composer regression byte-identical
  green); 5F scripts/adle-proficiency-regression.ts registered as
  npm run adle:proficiency-regression; 5E
  scripts/adle-proficiency-report-samples.ts +
  docs/implementation/adle-slice-5-proficiency-report-samples-2026-07-05.md.
  All eight adle:* suites green; new lib modules typecheck and lint
  clean. No migration and no new storage (open question 1). Next: owner
  QA gate over the report samples, then closeout.`
- Previous status: `Owner-approved 2026-07-05 ("Yes") — all five open
  questions closed with the plan's recommendations; the unpopulated-level
  edge (open question 5) refined per the owner to "progress to the first
  available (populated) level".`
- Previous status: `Draft for owner review`.
- Date: 2026-07-05
- Policy sources:
  [adle-daily-assignment-and-evidence-blueprint-contract.md](../contracts/adle-daily-assignment-and-evidence-blueprint-contract.md)
  (§"Micro-skill proficiency (graded breadth, gated levels)" — the single
  policy source for breadth credit, target(L), gating, badging, and the
  reporting shape; §"Dictionary eligibility ladder" — the
  `mastery-breadth-eligible` status-5 gate; the 2026-07-04 formula-package
  amendment item 1 — 3 levels under `banding_v1.1`, version-owned level
  range; and the 2026-07-05 pedagogy amendment item 2 — the
  prerequisite-precedence "not yet secure" extension, explicitly a
  this-slice decision),
  [adle-word-complexity-banding-and-formula-numbers-proposal.md](adle-word-complexity-banding-and-formula-numbers-proposal.md)
  (§2 allocation reality: 372 populated cells, 98% under floor 8, median
  4 words/skill — a pilot sample with bulk population planned; keep floor
  8 exactly; badge limited allocation; the allocation table recomputes
  per import batch; contrast-role links excluded from breadth
  allocation).
- Predecessors:
  [adle-slice-1-dictionary-eligibility-and-banding-plan.md](adle-slice-1-dictionary-eligibility-and-banding-plan.md),
  [adle-slice-2-review-scheduler-plan.md](adle-slice-2-review-scheduler-plan.md),
  [adle-slice-3-daily-assignment-composer-plan.md](adle-slice-3-daily-assignment-composer-plan.md),
  [adle-slice-4-evidence-engine-plan.md](adle-slice-4-evidence-engine-plan.md)
  (all COMPLETE 2026-07-05 with owner QA sign-offs; their implementation
  pins are owner-approved — this slice consumes them, never revisits).
- Roadmap position: fifth ADLE implementation slice — roadmap Phase 11 in
  the [version-3-roadmap.md](version-3-roadmap.md) "ADLE slice track"
  (dictionary eligibility → scheduler → composer → evidence engine →
  **micro-skill proficiency**). Slice 6 (live session surface) and
  Slice 7 (child/parent UI, including the proficiency dashboard) follow.
- Deployment method: **no migration is proposed** (open question 1 —
  proficiency is a pure projection; the recommended shape adds no
  storage). If the owner instead picks persisted snapshots or registry
  parity, that becomes one unique forward migration, local/dev only, per
  `docs/operations/supabase-migration-policy.md`. No hosted/production
  Supabase mutation, no `supabase db push`, either way.

## Purpose

Give ADLE the projection that turns Slice 4's per-word evidence states
into per-micro-skill proficiency:

1. **Versioned proficiency policy** — the blueprint's breadth-credit
   table (1.0 / 0.4 / 0.1), the target formula constants (cap 20, ratio
   0.6, floor 8), and the gating/badging rules, as a constants module
   (`PROFICIENCY_POLICY_V1`) in the `REVIEW_POLICY_V1` /
   `COMPOSER_POLICY_V1` / `EVIDENCE_POLICY_V1` pattern.
2. **Breadth credit** — per (child, skill, level): graded credit from
   each mapped word's evidence state, capped at 1.0 per word per skill,
   counting only status-5 (`mastery-breadth-eligible`) words mapped by
   active, approved, non-contrast support links.
3. **Level targets and gating** — `target(L)` computed from the
   allocation table (never hard-coded), floor 8 kept exactly,
   `secure (limited allocation)` badging for under-floor cells, and
   gated-never-averaged level security (Level L secure only when
   progress ≥ 1.0 and all lower levels are secure; higher-level evidence
   reports `developing (early)` while gated).
4. **Reporting read model** — the blueprint's per-skill reporting shape
   (highest secure level, developing level with progress, next target,
   evidence gaps, allocation-limited flag) with the parent-facing
   progress-toward-next-level vocabulary, plus an owner-facing QA report
   artefact. The UI that renders it is Slice 7.
5. **The "not yet secure" prerequisite-precedence extension** — the
   2026-07-05 amendment item 2 decision this slice was named to make:
   whether Part 2 skill selection's prerequisite tier extends from
   "prerequisite is a selectable candidate" to "prerequisite is not yet
   secure" now that proficiency exists (open question 3; recommended:
   adopt, with a starvation guard).

This slice produces no UI, no rewards or Word Treasure writes, no
evidence-engine or scheduler changes, no instructional-state
transitions, and (in the recommended shape) no storage.

## What already exists (verified 2026-07-05; re-verify before pinning)

Verified against the working tree on 2026-07-05 (module exports and the
allocation runner read directly; DB counts carried forward from the
Slice 4 closeout inventory — re-verify live before implementing):

- **`lib/adle/word-evidence-state.ts` (Slice 4D)** —
  `computeWordEvidenceState(policy, pricing, facts)` returns
  `{ state, slipped, unresolvedSlips, score, explanation }` per
  (child, word); states `unseen / active / produced / secure /
  review_retired / mastered`; `isSlipEligibleState`. Its documented pins
  matter here: while a slip is unresolved the secure/mastered edges fail
  (a secure-evidence word **reports `produced` with `slipped = true`**),
  but `review_retired` persists (the scheduler's retirement fact cannot
  be recomputed away) and carries the flag. See open question 2.
- **`lib/adle/evidence-pricing.ts` (Slice 4C)** — `priceWordEvidence`
  over the per-word fact streams (`WordPricingFacts`), returning
  `WordEvidencePricing` (`entries`, `score`, `productions`).
  `EVIDENCE_POLICY_V1` in `lib/adle/evidence-policy.ts`.
- **`lib/adle/dictionary-eligibility.ts` (Slice 1C)** —
  `isMasteryBreadthEligible(word, supports, childBand)` (status 5:
  evidence-eligible + within the child's band),
  `effectiveComplexityLevel(banding, override, activeBandingVersion)`
  (active override wins, else the computed level under the active
  version, fail-closed null when unbanded), `readAllocation` /
  `allocationsForSkill` over `SkillLevelAllocationFact` rows,
  `WordSupportFact` with
  `supportRole: "support_example" | "contrast" | "review_example"`, and
  `APPROVED_SUPPORT_REVIEW_STATUSES`.
- **`canonical_teaching_dictionary_skill_level_allocation`** — 372
  active cells under `banding_v1.1_2026-07-04`; recomputed by
  `scripts/adle-band-teaching-dictionary.py` per import batch. Verified
  in the runner: the allocation counts **active, non-contrast** support
  links of active banded words at their effective (override-aware)
  level. It applies **no support review-status filter and no child-band
  filter** — see the denominator/numerator pin in 5C.
- **`canonical_teaching_dictionary_word_support`** — word→skill mappings
  with roles; multi-skill words carry one link per skill.
- **`micro_skill_catalog`** — 240 active skills with
  `skill_family_key`; prerequisite links reach the composer as the
  injected `prerequisiteKeysBySkill` fact set in
  `lib/adle/composer-skill-selection.ts`, whose
  `prerequisite_precedence` tier (tier 2, between reteach demand and
  largest cluster) is the exact code the "not yet secure" extension
  would modify. The tier is fail-open: absent prerequisite data decides
  nothing, and a deferral that would empty the survivor set is ignored.
- **Slice 2/3/4 conventions** — pure fact-fed `lib/adle/` modules with
  injected dates; DB access only in loaders/scripts; fixture-backed
  DB-independent regressions registered as `npm run adle:*`
  (tsc-compile-and-run pattern); guarded scripts (dry-run default,
  localhost guard, confirmation token, JSON batch report); owner QA
  gates via readable per-child sample artefacts.
- **Local dev** — migrations applied through `20260705210000` (Slice 4A;
  migration files on disk confirm). Dictionary: 874 words banded
  424/342/108; 8 family methods + 32 activity templates; **all
  per-child ADLE tables empty** (fixtures create their own children).
  If local dev drifts from this inventory, stop and re-verify
  (migration policy stop conditions).

## Pinned policy this slice implements (approved 2026-07-04/05; cited, not re-litigated)

- **Breadth credit per word per mapped skill, capped at 1.0 per word per
  skill:** `secure` / `review_retired` / `mastered` = 1.0; `produced` =
  0.4; `active` = 0.1 (`unseen` = 0). Multi-skill words credit each
  mapped skill; evidence points credit the word, breadth credit counts
  per skill.
- **Level progress:**
  `progress(skill, L) = sum of credits from Level-L words mapped to the
  skill / target(L)`.
- **Target formula:** `target(L) = min(20, ceil(0.6 × allocation(skill,
  L)))`, floor 8. `allocation(skill, L)` = count of
  mastery-breadth-eligible dictionary words for that skill and level;
  the allocation table is the required data artefact, recomputed from
  the dictionary + banding version on every import batch — targets are
  **never hard-coded** and grow automatically as words arrive.
- **Limited allocation:** allocation < 8 → the level can be secured from
  the full allocation and is badged `secure (limited allocation)`. Keep
  the floor of 8 exactly — do not tune targets to the pilot sample
  (proposal §2, owner context 2026-07-04: the 874 words are a pilot
  sample; 98% of cells under floor is expected sample-scale behaviour).
- **Gating:** Level L is `secure` only when progress ≥ 1.0 **and** all
  lower levels are secure; higher-level evidence still reports as
  `developing (early)` while gated — **levels are gated, never
  averaged**.
- **Level range is version-owned:** 1–3 under `banding_v1.1_2026-07-04`
  (2026-07-04 amendment item 1); the proficiency engine reads the level
  range from the active banding version fact, never assumes a count.
- **Reporting per skill:** highest secure level, developing level with
  progress, next target, evidence gaps, allocation-limited flag.
- **Parent-facing language:** progress-toward-next-level framing
  ("developing / on track"), never pass/fail badges; long developing
  periods are the system working and must read that way.
- **Status-5 gate:** only `mastery-breadth-eligible` words
  (evidence-eligible + within the child's band) count toward breadth
  targets. An obscure correct word may earn word evidence but must not
  count toward breadth targets (the obscure-word firewall's reporting
  end).
- **Contrast exclusion:** contrast-role word–skill links are excluded
  from breadth allocation (proposal §2: 966 non-contrast links over 240
  skills) — they support teaching, they are not the skill's word bank.
- **Slice 4 pins consumed as-is:** slip-agnostic detection eligibility,
  slipped-flag semantics (unresolved slip fails the secure/mastered
  edges; `review_retired` persists and carries the flag), correctness
  derivation, ladder figure 6.75. This slice reads
  `computeWordEvidenceState` outputs and never re-derives states.
- **Boundaries:** one word cannot prove micro-skill mastery (targets
  have floor 8 / full limited allocation); Word Treasure remains
  separate — micro-skill proficiency never mints Golden Bars and no
  reward state is read as evidence or written; instructional states
  (INTRODUCTION_REQUIRED … MAINTENANCE) describe lesson flow only and
  are never derived from evidence or proficiency.

## Design

### 5A. Proficiency policy constants (`lib/adle/proficiency-policy.ts`)

`PROFICIENCY_POLICY_V1` (`proficiency_policy_v1_2026-07-05`), the
versioned constants module in the established `*_POLICY_V1` pattern:

- credit table: `{ secure: 1.0, review_retired: 1.0, mastered: 1.0,
  produced: 0.4, active: 0.1, unseen: 0 }`
- target constants: `targetCap: 20`, `targetRatio: 0.6`,
  `targetFloor: 8`
- badging vocabulary constants: `secure`, `secure (limited allocation)`,
  `developing`, `developing (early)` (the gated-higher-evidence label),
  `not started`
- `creditRoles: ["support_example", "review_example"]` (the non-contrast
  link roles that carry breadth credit — mirrors the allocation
  runner's contrast exclusion)

No registry table in the recommended no-migration shape; every computed
result stamps `proficiency_policy_version` the way priced evidence
entries stamp `evidence_policy_version`. Registry parity
(`adle_proficiency_policy_versions`) is bundled into open question 1 —
if the owner wants it, it is a one-table registry-only migration seeded
with v1, in the `adle_evidence_policy_versions` shape.

### 5B. Breadth credit (`lib/adle/micro-skill-proficiency.ts`, part 1)

Pure, fact-fed, injected-date, server-only. One module owns 5B and 5C
(credit → targets → gating → reporting is one projection; splitting it
would force the intermediate shapes into exports).

Inputs (all injected facts, in the Slice 1/4 fact-shape vocabulary):

- per-word evidence state results — `WordEvidenceStateResult[]` from
  Slice 4's `computeWordEvidenceState` (the caller composes pricing +
  states exactly as the Slice 4 report script does; this module never
  reprices)
- dictionary facts: `DictionaryWordFact[]`, `WordSupportFact[]`,
  `WordBandingFact[]`, `BandingOverrideFact[]`, the active
  `BandingVersionFact`
- the child's `ChildBandProfile` (status-5 gate)
- `SkillLevelAllocationFact[]` (the allocation table rows)

Credit rules (each one traceable to the pinned policy):

1. **Which links credit:** a word credits a skill only via an **active**
   support link whose role is in `creditRoles` (contrast excluded) and
   whose review status is in `APPROVED_SUPPORT_REVIEW_STATUSES`. One
   credit per (word, skill) regardless of how many qualifying links
   exist — the 1.0-per-word-per-skill cap applied structurally.
2. **Which words credit:** only words passing
   `isMasteryBreadthEligible(word, supports, childBand)` — status 5,
   per child band. Obscure or out-of-band words are excluded from the
   numerator even when their evidence state is `mastered` (they keep
   their word evidence; they never count toward breadth).
3. **Which level a credit lands in:**
   `effectiveComplexityLevel(banding, override, activeBandingVersion)`.
   Unbanded words (null) earn **no breadth credit** — fail closed,
   matching the import path's no-Level-no-eligibility posture and the
   allocation denominator (which also only counts banded words).
4. **How much a word credits:** the credit table applied to the word's
   **reported evidence state** (open question 2 pins this as
   state-based, exactly as the blueprint words it — credit states, not
   flags). Consequences under the Slice 4 state pins:
   - a secure-evidence word with an unresolved slip reports `produced`
     → credits 0.4 automatically; no separate flag penalty is needed
   - a slipped `review_retired` word still reports `review_retired` →
     credits 1.0 (the slip already deducts word score and re-enters the
     word into review; breadth does not double-punish)
   - `mastered` can never carry an unresolved slip (its edge fails), so
     no case arises there
5. **Determinism:** identical facts + policy version → byte-identical
   output; per-credit explanation entries name the word, link role,
   level source (computed vs override), state, and credit value.

Output of 5B (internal): per (skill, level): the credited word list with
per-word credit, and the credit sum.

### 5C. Targets, gating, and the reporting shape (same module, part 2)

**Target pin (blueprint formula made total):** for each populated
allocation cell,

- `allocation ≥ 8` → `target(L) = min(20, max(8, ceil(0.6 ×
  allocation)))` (the floor written into the formula: 0.6 × 8 = 4.8
  rounds to 5, below the floor, so the floor binds until allocation
  reaches 12)
- `1 ≤ allocation < 8` → `target(L) = allocation` and the level is
  badged `secure (limited allocation)` when secured (the blueprint's
  "can be secured from the full allocation")
- `allocation = 0` (no active cell for that skill/level under the
  active banding version) → the level is **unpopulated**: it gets no
  target, cannot be secured, and — the gating pin below — does not
  block higher levels

`progress(skill, L)` = credit sum / target(L), reported capped at 1.0
(raw value retained in the explanation trail). Targets always come from
`readAllocation` / `allocationsForSkill` over the injected allocation
rows for the **active banding version** — never hard-coded, never
cached across banding versions.

**Gating pin (owner-approved 2026-07-05 — "progress to the first
available level"):** a skill's levels are gated bottom-up starting from
its **first populated level** (the lowest level with a non-zero
allocation), not from Level 1 in the abstract. Level L is `secure` when
`progress(L) ≥ 1.0` and every **populated** lower level is secure;
unpopulated lower levels are neither a blocker nor a step the child can
be asked to complete — the child simply progresses at the first level
that actually has words. Unpopulated levels are still surfaced as a
`no_allocation` evidence gap so the sparseness is visible and honest,
and the behaviour is self-healing: the allocation table recomputes per
import batch, so when words arrive at a previously empty lower level the
gate re-engages on the next recomputation (a previously secure higher
level then reports `developing (early)` again — recomputation is the
designed behaviour, and the allocation-limited/gap flags carry the
story). The fail-closed alternative (an empty lower level blocks
everything above it) was rejected: it would gate almost every skill in
the 372-cell pilot sample indefinitely with no action the child could
take — a data gap would masquerade as child progress state.

*Consequence the owner should be aware of (reversible, doc-level):* when
bulk population later adds words at a level that was empty, a skill that
read `secure` at a higher level can revert to `developing (early)` until
the newly populated lower level is secured. This is the honest reading
(the child genuinely has unproven breadth at the newly visible level),
but it can look like backward movement in a parent report. If that
framing is unwanted, the alternative is to freeze a level's secured
status once earned and only apply new lower-level requirements to
not-yet-secure levels — flag for a reporting-vocabulary decision at
Slice 7 if it matters then; it changes nothing structural in this slice.

**Higher-level evidence while gated:** computed and reported as
`developing (early)` with its progress — never folded into any average,
never shown as secure.

**Reporting shape (blueprint, verbatim fields) per skill:**

- `highestSecureLevel: number | null` (with per-level badges, including
  `secure (limited allocation)`)
- `developingLevel`: the lowest non-secure populated level, with
  `progress`, `creditedWords`, `target`, and `nextTarget` phrasing
  ("X of Y words showing security")
- `gatedLevels`: higher levels with evidence, each `developing (early)`
  with progress
- `evidenceGaps`: `no_allocation` levels; counts of mapped in-band
  words still `unseen` / `active` / `produced` at the developing level;
  `allocation_under_floor` where it applies
- `allocationLimited: boolean` (any populated cell under floor 8 —
  proposal §2 item 4: parent-facing level reporting is meaningful only
  once allocation clears the floor, and this flag carries that signal)
- `proficiencyPolicyVersion`, `bandingVersion`, and the explanation
  trail (audit style of `composer-skill-selection`)

**Parent-facing vocabulary pin (open question 5):** `secure`,
`developing — on track`, `developing (early)`,
`secure (limited allocation)`, `not started`; progress phrased as
progress-toward-next-level ("7 of 8 Level 2 words secure"); no
pass/fail, no percentages-as-grades, and long developing periods framed
as the system working ("building breadth at Level 2"). These strings
ship as constants in 5A so Slice 7's UI consumes, never re-invents.

### 5D. Prerequisite-precedence "not yet secure" extension (`lib/adle/composer-skill-selection.ts`)

The 2026-07-05 amendment item 2 named this a this-slice decision (open
question 3). **Recommended: adopt now, with a starvation guard**, as a
backward-compatible extension of the existing tier-2 code:

- `SkillSelectionFacts` gains an optional injected fact:
  `notYetSecureSkillKeys?: ReadonlySet<string>` — the set of skills
  whose proficiency reports **no secure level** (highest secure level
  null), computed by the caller from 5C output. Absent/empty set → the
  tier behaves exactly as today (fail-open, mirroring
  `prerequisiteKeysBySkill`); every existing regression fixture passes
  unchanged.
- **Extended deferral rule:** a candidate skill is deferred when one of
  its prerequisites is (a) itself a selectable candidate — today's
  rule, unchanged — **or** (b) in `notYetSecureSkillKeys` **and**
  actionable: the prerequisite has at least one unresolved learning
  item (so deferral points at something the system can actually teach
  next, via intake growth to selectability). A not-yet-secure
  prerequisite with **zero** unresolved learning items does not defer —
  without frontier probes (explicitly out of scope, Slice 4 open
  question 5 triage) the system has no path to generate work for it,
  and a literal reading would starve error-driven dependent skills
  behind a prerequisite nothing can act on.
- The existing fail-open empty-set rule is kept: a deferral that would
  empty the survivor set decides nothing. The audit trail's tier detail
  names which branch (candidate vs not-yet-secure) deferred each skill,
  keeping picks parent-explainable.
- Cold-start property (worth stating for QA): with empty per-child
  data every skill is not-yet-secure, but no skill has learning items
  either, so branch (b) never fires — behaviour is identical to today
  until real evidence and real intake exist.

This is the only Slice 3 file touched, it is additive, and no Slice 3
pin changes. If the owner prefers deferral (open question 3 alternative
c), 5D drops out of this slice cleanly — nothing else here depends on
it.

### 5E. Loaders, report script, and the QA artefact

- A loader (DB access outside `lib/adle/`) assembling the proficiency
  inputs per child: the Slice 4 evidence-state inputs (reusing the
  Slice 4 report loader's assembly), dictionary/support/banding/
  allocation rows, and the child band profile.
- `scripts/adle-proficiency-report-samples.ts` — a **read-only** report
  script over the established fixture children (mirroring the Slice 3
  composed-plan and Slice 4 evidence-report sample artefacts): per
  child, per skill — every level's allocation, target, credited words
  (with each word's state, credit, and link role), progress, gate
  result, badges, evidence gaps, and the parent-facing sentence the
  vocabulary pin produces. Output committed as
  `docs/implementation/adle-slice-5-proficiency-report-samples-2026-07-XX.md`
  — the owner QA gate artefact. Fixtures must cover: a limited-
  allocation secure, a gated `developing (early)`, an unpopulated-level
  skip, a slipped-word credit (both the `produced`-demotion and the
  retired-keeps-1.0 cases), a multi-skill word crediting two skills,
  and an out-of-band `mastered` word earning zero breadth.
- No guarded apply script exists in the recommended shape — there is
  nothing to apply; proficiency is read-only recomputation. (If the
  owner picks persisted snapshots, a guarded snapshot-refresh script in
  the established pattern is added here.)

### 5F. Regression coverage

`scripts/adle-proficiency-regression.ts`, registered as
`npm run adle:proficiency-regression` (tsc-compile-and-run pattern),
fixture-backed and DB-independent:

- **Credit table truth:** each evidence state prices exactly per the v1
  table; policy version stamped on every result.
- **Per-word-per-skill cap:** a word with two qualifying links to the
  same skill credits once; a multi-skill word credits each mapped skill.
- **Link filtering:** contrast-role links never credit; unapproved or
  inactive links never credit; `review_example` links credit.
- **Status-5 gate:** an out-of-band or band-metadata-missing word earns
  zero breadth credit regardless of state; the same word inside the
  band credits normally.
- **Level assignment:** override-aware (`effectiveComplexityLevel`
  parity); unbanded words excluded; credits land only in the active
  banding version's level range.
- **Target formula:** allocation 4 → target 4 + limited badge;
  allocation 8 → target 8 (floor binds); allocation 12 → target 8;
  allocation 20 → target 12; allocation 40 → target 20 (cap binds);
  allocation 0 → unpopulated, no target. Targets recompute when the
  injected allocation rows change (no caching across versions).
- **Gating never averaging:** L2 progress 1.0 with L1 at 0.9 → L2
  reports `developing (early)`, not secure and not blended; L1 reaching
  1.0 flips L2 secure in the same recomputation; an unpopulated L1
  skips the gate but emits the `no_allocation` gap; a later-populated
  L1 re-gates a previously secure L2.
- **Slipped-word credit:** the secure-evidence-with-unresolved-slip
  fixture credits 0.4 (state-based demotion); the slipped
  `review_retired` fixture credits 1.0; resolution restores 1.0.
- **Reporting shape:** all blueprint fields present; parent strings come
  from the 5A constants; capped progress with raw value in the
  explanation.
- **5D extension (if adopted):** absent fact set → byte-identical
  selection to the existing composer regression fixtures; a
  not-yet-secure prerequisite **with** unresolved items defers its
  dependent; one with zero items does not; deferral emptying the
  survivor set decides nothing; audit trail names the branch.
- **Determinism:** identical fixtures + injected date → byte-identical
  results and explanation trails; all prior `adle:*` suites stay green.

## Implementation order

1. 5A policy constants module
2. 5B breadth credit (fixture-backed as built)
3. 5C targets, gating, reporting shape (the largest pure part)
4. 5D composer prerequisite extension — only if open question 3 is
   approved as recommended
5. 5E loader + report script; generate the sample artefact
6. 5F regression registered in `package.json`; full verification pass
   (all `adle:*` suites green)
7. **Owner QA gate:** proficiency report samples over the fixture
   children (mirroring the Slice 3/4 gates) — sign-off before closeout
8. Closeout: decision-log entry + status flip in this document

## Acceptance criteria (traceable to the contracts)

- breadth credit is exactly 1.0 / 0.4 / 0.1 by evidence state, capped at
  1.0 per word per skill, versioned (`proficiency_policy_v1_2026-07-05`)
  and read from the constants module, never hard-coded at call sites
- only `mastery-breadth-eligible` (status 5, per child band) words
  credit; obscure/out-of-band words earn word evidence but zero breadth
- only active, approved, non-contrast support links carry credit,
  matching the allocation denominator's contrast exclusion
- `target(L)` is computed from the allocation table for the active
  banding version on every call — floor 8 exactly, cap 20, full
  allocation + badge under the floor; nothing tuned to the pilot sample
- levels are gated, never averaged; higher-level evidence reports
  `developing (early)` while gated; unpopulated levels skip the gate
  only via the pinned `no_allocation` gap semantics (owner-confirmed)
- the reporting shape carries all five blueprint fields and the
  parent-facing progress-toward-next-level vocabulary; no pass/fail
  anywhere
- word evidence states are consumed from Slice 4's modules unchanged —
  no repricing, no state re-derivation, no evidence or scheduler code
  changes
- the 5D extension (if adopted) is additive and fail-open: absent
  proficiency facts reproduce today's selection byte-for-byte; no
  Slice 3 pin changes
- no new storage in the recommended shape; no stored proficiency, no
  snapshot, no migration (or exactly the owner-selected registry/
  snapshot migration and nothing else)
- no reward writes, no Word Treasure reads-as-evidence, no
  instructional-state derivation, no UI; the workbook's policy columns
  are nowhere read at runtime
- all regressions pass fixture-backed with no DB dependency; no
  hosted/production Supabase mutation

## Ownership boundaries (what this slice owns vs reads vs leaves)

| concern | Slice 2 scheduler | Slice 3 composer | Slice 4 evidence engine | Slice 5 proficiency (this plan) | later slices |
|---|---|---|---|---|---|
| review outcome ledger, schedule state, review priority | **owns** | writes via completion | prices (read-only) | — (review priority stays scheduler-owned) | — |
| learning items + intake | emits ejection facts | owns | adds `slippage_reentry` intake | **reads** (5D actionability guard) | — |
| evidence policy, pricing, word evidence states, slipped flag | — | — | **owns** | **reads (consumes state results unchanged)** | — |
| dictionary eligibility ladder, banding, allocation table | — | reads | reads | **reads (status-5 gate, levels, targets)** — table stays a Slice 1 runner artefact | Slice 8 bulk population recomputes it |
| breadth credit, target(L), gating, badges, reporting shape | — | — | — | **owns** | Slice 7 renders it |
| Part 2 skill selection tiers | — | **owns** | — | **extends tier 2 only (if Q3 adopted), via injected facts** | — |
| instructional-state transitions, maintenance status | — | — | — | **out** (lesson-flow concepts; never derived from evidence/proficiency) | Slice 6+ if ever |
| child/parent UI, proficiency dashboard | — | — | — | — | **Slice 7** |
| Word Treasure state | — | — | never writes/reads-as-evidence | **never** | Slice 7 emits events only |

## Explicit non-goals

- no child or parent UI, no dashboard — Slice 7 renders this slice's
  reporting read model (progress-toward-next-level framing,
  allocation-limited flags, per the slice track)
- no persisted proficiency, no snapshot tables, no migration in the
  recommended shape (open question 1); no `supabase db push` regardless
- no instructional-state transitions, no review-priority changes, no
  maintenance status — the old Phase 11 wording is triaged in open
  question 4; scheduler and lesson-flow concerns stay where they live
- no frontier probes and no other path that manufactures learning items
  for not-yet-secure prerequisite skills (composer amendment with its
  own blueprint amendment, per the Slice 4 triage) — 5D's actionability
  guard exists precisely because this is out
- no changes to evidence pricing, word evidence states, the scheduler,
  or any Slice 1–4 pin; no allocation-runner changes (the
  denominator asymmetries are pinned as-is in 5C and revisited at
  Slice 8 bulk population if they distort targets)
- no reward writes, no Word Treasure state of any kind; proficiency
  never mints Golden Bars
- no bulk dictionary population, no target tuning to the pilot sample
- no hosted/production Supabase mutation

## Open questions for the owner (all resolved 2026-07-05 — owner "Yes")

All five were approved as recommended. Question 5's unpopulated-level
edge was refined by the owner to "progress to the first available
(populated) level," which the 5C gating pin now records. The
recommendations, retained below for traceability:

1. **Storage shape.** **Recommended: pure recomputed read model — no new
   tables, no migration.** The blueprint pins recompute-from-history and
   proficiency is a deterministic projection over Slice 4's states plus
   dictionary facts; persisting it would duplicate derivable truth and
   risk divergence (the same reasoning the owner approved for Slice 4's
   no-priced-event-ledger decision). A persisted snapshot can be added
   later as a pure cache if reporting query cost ever demands it
   (realistic only at Slice 7 UI scale, and even then per-child
   recomputation is small). Sub-decision folded in: with no migration
   there is no `adle_proficiency_policy_versions` registry row this
   slice — the policy version ships in the constants module and is
   stamped on every result; registry parity can ride along with any
   future migration. If the owner prefers snapshots or registry parity
   now, the cost is one registry/snapshot migration and a guarded
   refresh script; everything else in this plan is unchanged.
2. **Breadth credit inputs.** Two pins to confirm:
   - **Mappings:** active, approved (`APPROVED_SUPPORT_REVIEW_STATUSES`),
     non-contrast (`support_example` / `review_example`) links; status-5
     gate per child band on the word; unbanded words excluded.
     **Known asymmetry surfaced during planning:** the allocation
     denominator (Slice 1 runner) applies no review-status and no
     child-band filter, so the denominator can only be ≥ the child's
     creditable pool — progress may understate, never inflate
     (fail-conservative). **Recommended: keep the shared allocation
     table as the pinned denominator** (it is the blueprint's required
     recomputable artefact and per-child denominators would fork it);
     note the understatement as known pilot-scale behaviour and revisit
     at Slice 8 if bulk population makes it distort targets.
   - **Slipped words:** **recommended: state-based crediting, exactly as
     the blueprint words it (credit states, not flags).** Under the
     Slice 4 pins a secure-evidence word with an unresolved slip already
     reports `produced` → 0.4, so the slip demotes breadth automatically;
     the one flagged-at-1.0 case is a slipped `review_retired` word,
     which keeps 1.0 because slippage already has its own remedies
     (score deduction, review re-entry, third-slip reteach) and a flag
     penalty would double-punish. Alternative (flag-penalised: `slipped`
     caps credit at 0.4) is a one-line policy change if the owner
     prefers the harsher read.
3. **The "not yet secure" prerequisite-precedence extension.**
   **Recommended: adopt in this slice, with the actionability guard**
   (5D): defer a candidate whose prerequisite is a selectable candidate
   (today's rule) or not-yet-secure **with** at least one unresolved
   learning item; injected facts, fail-open, byte-compatible when
   absent. "Not yet secure" is pinned as: the prerequisite skill's
   proficiency reports no secure level. The amendment named this a
   this-slice decision and the guard removes the starvation risk (a
   literal extension would let a prerequisite with no items and no
   probe path indefinitely block a dependent skill the child is
   actually making errors in). Alternatives: (b) literal extension
   (defer whenever the prerequisite is not yet secure, relying only on
   the fail-open empty-set rule) — simpler but starves error-driven
   skills until frontier probes exist; (c) defer the whole extension to
   a composer amendment slice — nothing else in this plan depends on it.
4. **Scope triage of the old Phase 11 items.** **Recommended: in —
   proficiency and breadth (this plan, including the reporting shape's
   evidence-gap/diversity signal); out — instructional-state
   transitions** (lesson-flow only; the blueprint forbids deriving them
   from evidence states), **review priority** (owned end-to-end by the
   Slice 2 scheduler and Slice 3 reteach tiers; nothing proficiency
   adds), **and maintenance status** (`review_retired` monitoring in
   real writing is already the Slice 4 slippage path; a separate
   maintenance concept belongs to lesson flow, if anywhere). The
   roadmap's Phase 11 status note already frames Slice 5 this way; this
   plan makes the triage explicit.
5. **Reporting deliverable and vocabulary.** Confirm: pure reporting
   read model + owner QA report artefact only, UI in Slice 7; the
   parent-facing vocabulary pins in 5C (`secure`, `developing — on
   track`, `developing (early)`, `secure (limited allocation)`, `not
   started`; progress-toward-next-level phrasing; no pass/fail), shipped
   as 5A constants for Slice 7 to consume; and the unpopulated-level
   gating pin (`no_allocation` levels skip the gate but are reported as
   evidence gaps — the fail-closed alternative would let pilot-sample
   data gaps masquerade as child progress state).

## Handoff notes for the implementing session

- Read this plan, then the blueprint contract's "Micro-skill
  proficiency" and "Dictionary eligibility ladder" sections and both
  2026-07-04/05 amendment sections, then proposal §2 (allocation
  reality + §2.1 import-path rules), then the Slice 4 plan's pins and
  the Slice 1–3 plans for conventions.
- The "What already exists" inventory was verified against the working
  tree on 2026-07-05 (module exports, allocation-runner behaviour,
  migration files through `20260705210000`); DB counts carry forward
  from the Slice 4 closeout. Re-verify live before implementing; if
  local dev drifts, stop and re-verify (migration policy stop
  conditions).
- Keep every new module pure and fact-fed with injected dates; DB
  access stays in loaders/scripts; regressions fixture-backed,
  DB-independent, registered as `adle:*` npm scripts in the
  tsc-compile-and-run pattern.
- Consume, don't revisit: the Slice 4 pins (slip-agnostic eligibility,
  slipped-flag semantics — including the `review_retired`-persists
  behaviour that motivates open question 2's slipped-credit pin —
  correctness derivation, ladder 6.75), the Slice 2/3 pins, and
  `banding_v1.1_2026-07-04` (level range 1–3 is version-owned — read it
  from the banding version fact).
- Never hard-code a target, an allocation, or a level count; everything
  derives from the injected allocation rows and the active banding
  version, so bulk population (Slice 8) grows targets with zero code
  change.
- The composer extension (5D) must be additive: absent injected facts →
  byte-identical behaviour, existing composer regression fixtures
  untouched and green.
- The owner QA gate (step 7) mirrors Slices 3/4: a readable per-child
  proficiency report from fixtures, signed off before closeout. Cover
  the fixture list in 5E — the slipped-credit and unpopulated-level
  cases are the ones the owner most needs to see rendered in parent
  language.
- Do not price, read, or write anything for the reward contract; ADLE
  emits events, the reward contract consumes them.

## Decision-log entry (recorded 2026-07-05, drafting stage)

2026-07-05 — ADLE Slice 5 plan drafted

- `docs/implementation/adle-slice-5-proficiency-engine-plan.md` drafted:
  `PROFICIENCY_POLICY_V1` constants, pure breadth-credit projection over
  the Slice 4 word evidence states (state-based crediting, status-5
  gate, contrast exclusion, override-aware levels), allocation-derived
  `target(L)` with floor 8 and `secure (limited allocation)` badging,
  gated-never-averaged levels with a pinned unpopulated-level rule, the
  blueprint reporting shape with parent-facing vocabulary constants,
  and the prerequisite-precedence "not yet secure" extension
  (recommended: adopt with an actionability guard). Recommended shape
  is a pure read model — no migration, no new storage. Five open
  questions for the owner with recommendations.
- Status: `Draft for owner review`. No implementation, migration,
  import, or Supabase mutation authorized.

2026-07-05 — ADLE Slice 5 plan approved ("Yes")

- Owner approved all five open questions as recommended: pure recomputed
  read model (no migration, no new storage), state-based breadth
  crediting with the status-5 gate and contrast exclusion,
  allocation-derived targets (floor 8, limited-allocation badging),
  gated-never-averaged levels, the "not yet secure" prerequisite
  extension with the actionability guard, old-Phase-11 triage (states/
  review-priority/maintenance out), and the reporting-read-model +
  parent-vocabulary deliverable.
- Refinement recorded: the unpopulated-level gating edge is pinned to
  "progress to the first available (populated) level" (5C). Status
  flipped to `Owner-approved 2026-07-05`. Implementation proceeds in a
  separate session per the slice-track convention.
