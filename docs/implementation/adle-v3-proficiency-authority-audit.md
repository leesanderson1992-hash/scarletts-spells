# ADLE V3 word ↔ micro-skill proficiency authority audit

## 2026-08-30 revalidation addendum

Classification: `HISTORICAL_IMPLEMENTATION_RECEIPT` with corrected current observations.
It is not the approved target-model contract. The original 2026-08-29 body is
preserved below and must be read with these corrections:

1. Production has **eight**, not three, active canonical words with more than
   one mapped micro-skill: `activity`, `careful`, `decision`, `diabetes`,
   `helpful`, `invention`, `playing`, and `quickly`.
2. One child/word currently has two active ADLE learning items: `playing` with
   `D4_MOR_BASE_WORDS_IDENTIFY_BASE` and
   `D4_MOR_BASE_WORDS_PRESERVE_BASE`. Both were pending with no schedule or
   evidence at revalidation. Statements below saying no such learner case
   exists are superseded.
3. The released specialist inventory is **314** pairs: Prefix 35, Suffix 40,
   Base 225, Closed Compound 7, and Separated/Hyphenated Compound 7. Both
   Compound route heads are Production-enabled. Statements below describing
   307 released plus seven unreleased Compound pairs are superseded.
4. The inspected 314 specialist pairs still have zero matching approved generic
   support, so the central convergence defect remains and is larger than the
   original receipt stated.
5. Production has no persisted five-state ADLE `instructional_state` columns;
   this is a model/data-surface gap, not proof that the documented teaching
   states are absent pedagogically.
6. A parallel generic learning/evidence system is still populated (including
   legacy competency and generic evidence rows) and must be included in lineage
   and double-count analysis before target release.
7. The owner has now approved a different target model: correct canonical word
   events project positively to all governed genuinely demonstrated skills;
   causal misspellings project negatively only to causal skills; proficiency is
   Breadth, Diversity/Complexity, Transfer, and Stability with derived Level
   1–5. The audit body's suggestion to preserve equal state-based breadth is
   current-runtime history, not the target decision.
8. The owner has also approved stage-sensitive word graduation and review
   regression: controlled pass is Cover–Write OR sentence-dictation target;
   Day-1 failure returns to controlled; Day-3+ failure receives one next-day
   recovery; failed recovery regresses one rung; and three consecutive failed
   independent checks return to controlled. The audit body's current
   catch-up/ejection observations remain runtime history, not target policy.

Canonical target ownership is now split between
`docs/contracts/adle-spelling-proficiency-contract.md` and
`docs/contracts/adle-word-progression-and-review-contract.md` as indexed by
`docs/architecture/adle-authority-map.md`; implementation staging is in
`docs/implementation/adle-proficiency-overhaul-plan.md`. No historical claim
below has been rewritten to look current.

Status: `COMPLETE — implementation decision ready`

Audit date: 2026-08-29 (Europe/London)

Audit kind: read-only architecture, implementation, and Production audit. This
receipt does not authorise a runtime, schema, curriculum, mapping, learner-data,
weighting, profile, deployment, or Production change.

## 1. Executive answer

V3 has the right identity separation but two non-converged word→micro-skill
authorities.

- A canonical word can be related to more than one micro-skill. Global
  `spelling_canonical_mappings` can discover multiple error routes for one
  correction when the misspellings differ; learner-specific
  `adle_learning_items` keep child + word + micro-skill targets distinct; one
  per-word Review can be attributed to all linked learner routes without
  duplicating the word event.
- Evidence pricing and word state are deliberately **word-level**. The
  proficiency projection then enumerates qualifying word-support links and
  gives the same state-derived breadth value to every admitted skill:
  `active=0.1`, `produced=0.4`, and
  `secure/review_retired/mastered=1.0`. Current classification:
  **`MULTI_MICROSKILL_BUT_EQUAL_WEIGHT`**.
- The owner's stronger-target / weaker-incidental hypothesis is not current
  proficiency policy. An older, still-semantic evidence contract preserves
  primary/supporting roles, but its weighting formula is illustrative and its
  scoring model was superseded. Current approved Slice 5 policy explicitly
  gives equal breadth per mapped skill. Targeted weighting therefore needs a
  separate owner policy decision; it must not be smuggled into authority
  convergence.
- Generic support is a real current proficiency gate, not a dead table. It is
  also a historical general-purpose gate that has not converged with specialist
  V3 route authority. Prefix, Suffix, Base Word, and Compound Word intake can
  already accept exact governed route/profile content without an approved
  generic-support row, while the proficiency projection cannot. For specialist
  routes its classification is
  **`HISTORICAL_GATE_NOT_YET_CONVERGED`**, with partial semantic overlap:
  current runtime still enforces it, but it is no longer the only authority
  capable of proving the fact.
- Production makes the split concrete. All 35 approved Dynamic Prefix member
  pairs, all 40 Dynamic Suffix member pairs, all 225 Base Word member pairs,
  and all seven released Closed Compound member pairs have zero matching
  approved generic support. The released specialist lesson authority therefore
  works while breadth is withheld. Seven further governed separated/hyphenated
  Compound pairs are still unreleased and must remain fail closed.
- There is also a narrower correctness defect: the profiler does not validate
  approval on the **same target skill link**. It accepts an active non-contrast
  target link, then asks whether the word has any approved support link for any
  skill. Production `careful` has an approved Base Word support plus an
  `in_review` Suffix support, so the Base approval can unlock the Suffix link if
  that child has evidence and banding. This contradicts the approved Slice 5
  exact-link rule. It is a runtime and test-coverage gap, independent of the
  specialist convergence decision.

The smallest correct plan is therefore: lock the exact current and defective
edges in diagnostic regressions; approve one route-neutral
`WordSkillProficiencyAuthority` policy; fix exact-link approval; project
approved generic support and governed specialist route content through that
same interface; recompute both numerator and allocation denominator from that
interface; shadow-compare Production; then release. Preserve equal state-based
breadth in this convergence. Consider targeted/incidental weights only in a
later separately governed evidence-policy change.

## 2. Baseline and method

### Repository and deployment pin

| Check                       | Result                                                          |
| --------------------------- | --------------------------------------------------------------- |
| Clean audit worktree        | `scarletts-spells-phase-e`                                      |
| Branch                      | `codex/phase-e-legacy-convergence` tracking `origin/main`       |
| Refreshed `origin/main`     | `42bf928fb6efde80c2f65dfd5a0a0bd9411616c1`                      |
| Local audit HEAD            | exact match to refreshed `origin/main`                          |
| Commit subject              | `refactor(adle): retire verified legacy database functions`     |
| Ready Production deployment | `dpl_2HarPzGQcYdiktAFjngQDTzSYKQ9`                              |
| Deployment target/state     | `production` / `READY`                                          |
| Deployment Git ref/SHA      | `main` / `42bf928fb6efde80c2f65dfd5a0a0bd9411616c1`             |
| Stable Production domain    | `scarletts-spells.vercel.app`                                   |
| Latest Production migration | `20260829133000 retire_verified_adle_legacy_database_functions` |

The current-state registry and Phase E audit still print the earlier
`f3a4b37…` application SHA
(`docs/implementation/adle-current-state-and-release-registry.md:12-18` and
`docs/implementation/adle-phase-e-legacy-convergence-audit.md:5-9`). Their
semantic architecture remains useful, but those baseline fields are now
contradicted by the verified deployment above.

### Production safety receipt

Production was queried only through the configured production pooler. Every
probe ran inside:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
-- SELECT statements only
ROLLBACK;
```

No secret, learner identifier, free-text attempt, raw writing, or connection
value is included in this receipt. No RPC was invoked. No application, Vercel,
database, schema, mapping, support, profile, learner, evidence, score, or
deployment state was changed.

## 3. Governed documentation findings

Status meanings in this section:

- `CURRENT`: current policy or released implementation record.
- `HISTORICAL`: useful design/chronology but superseded for the stated rule.
- `AMBIGUOUS`: two current-looking sources do not resolve the semantic choice.
- `CONTRADICTED`: current code/Production disproves the stated operational fact.

### Material rule inventory

| Document                                                                   | Section / line  | Exact semantic rule                                                                                                                                                                                                                                    | Status                                                                                                                                               |
| -------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/contracts/adle-daily-assignment-and-evidence-blueprint-contract.md`  | 3-20            | Single policy source for evidence, word states, and graded micro-skill breadth; micro-skill is the lesson, words are practice, Review proves retention, writing proves transfer.                                                                       | `CURRENT` via the 2026-08-29 correction, despite the draft label at line 24.                                                                         |
| same                                                                       | 22-39           | Phase E/R5/R6 and snapshot v3 are current; first impression may activate and add controlled evidence but is not independent production; breadth still requires support, approval, and banding. This correction supersedes contrary draft implications. | `CURRENT`                                                                                                                                            |
| same                                                                       | 78-115          | Word evidence state is per child + word; `produced` needs a correct unprompted production; learning item is child + word + primary skill.                                                                                                              | `CURRENT`, with the later shared-route implementation extending one word to multiple child-specific items.                                           |
| same                                                                       | 242-278         | Evidence weights are authentic 2.0, self-correction 1.5, cold dictation 1.5, recent dictation 0.5, controlled lesson 0.75, weak task 0.25. Transfer word evidence is real, but breadth still needs normal support/banding/approval.                    | `CURRENT`                                                                                                                                            |
| same                                                                       | 286-301         | Deductions never rewrite history; word mastery is score + production + spacing + authentic-use gated.                                                                                                                                                  | `CURRENT`                                                                                                                                            |
| same                                                                       | 303-329         | Breadth is per word per mapped skill: active 0.1, produced 0.4, secure/retired/mastered 1.0. Multi-skill words count in each mapped skill. Levels use allocation-derived targets and are gated, never averaged.                                        | `CURRENT`                                                                                                                                            |
| same                                                                       | 348-365         | `evidence-eligible` requires an approved micro-skill mapping; `mastery-breadth-eligible` adds the child band. Obscure words may earn word evidence but no breadth.                                                                                     | `CURRENT`                                                                                                                                            |
| same                                                                       | 417-425         | Current banding version has three levels; structural metadata sets level, frequency/AoA only gates child eligibility; allocation is recomputed.                                                                                                        | `CURRENT`                                                                                                                                            |
| `docs/implementation/adle-slice-5-proficiency-engine-plan.md`              | 3-29            | Slice 5 is owner-signed-off and complete; proficiency is a pure read projection with no new storage.                                                                                                                                                   | `CURRENT`                                                                                                                                            |
| same                                                                       | 71-105          | The shipped model is state-based breadth from active, approved, non-contrast support links; target/level reporting is pure.                                                                                                                            | `CURRENT`                                                                                                                                            |
| same                                                                       | 126-145         | `isMasteryBreadthEligible` is the gate; allocation counts active non-contrast support links but intentionally applies no support-review-status or child-band filter.                                                                                   | `CURRENT`; this establishes a deliberate denominator/numerator asymmetry.                                                                            |
| same                                                                       | 166-172         | Multi-skill words credit every mapped skill with equal state-based breadth.                                                                                                                                                                            | `CURRENT`                                                                                                                                            |
| same                                                                       | 244-292         | A crediting link itself must be active, non-contrast, and approved; one credit per word+skill; the word must also pass status 5 and effective banding.                                                                                                 | `CURRENT`; contradicted by one implementation detail described in §8.                                                                                |
| `docs/decision-log.md`                                                     | 108-128,174-190 | Owner QA closed Slice 5 as a pure recomputed read model and expressly approved state-based 1.0/0.4/0.1 breadth, status-5 eligibility, contrast exclusion, allocation-derived targets, and gated levels.                                                | `CURRENT`; confirms the Slice 5 plan is approved authority rather than an abandoned proposal.                                                        |
| `docs/contracts/writing-engine-mastery-and-evidence-contract.md`           | 3-22            | Old stage ladder, source weights, and weighted formula are superseded by the blueprint; core principles, evidence vocabulary, lineage, and boundaries remain.                                                                                          | `CURRENT` supersession boundary                                                                                                                      |
| same                                                                       | 46-59           | A word is evidence about skills, not the skill; credit only skills genuinely tested; one word cannot prove mastery; complex spelling does not prove every simpler skill.                                                                               | `CURRENT` semantic principle                                                                                                                         |
| same                                                                       | 144-185         | Conceptual evidence must preserve skill key, primary/supporting/weak/unrelated role, role weight, source, correctness, and model version.                                                                                                              | `CURRENT` semantic/lineage requirement; not a claim that current Slice 5 stores per-skill weights.                                                   |
| same                                                                       | 247-255         | Same-session correction cannot create durable mastery by itself; evidence and models remain source-linked and versioned.                                                                                                                               | `CURRENT`                                                                                                                                            |
| same                                                                       | 369-454         | Primary/supporting/weak/unrelated roles describe evidential meaning; role-weight formula is explicitly illustrative, not frozen.                                                                                                                       | `CURRENT` semantic vocabulary; `HISTORICAL` as a scoring formula after blueprint supersession.                                                       |
| `docs/contracts/canonical-spelling-word-map-contract.md`                   | 21-37           | Diagnostic mappings are not Teaching Dictionary support. `micro_skill_word_support` is the support layer; diagnostic correction may anchor a lesson, while support rows supply support/contrast/review words.                                          | `CURRENT` boundary, although specialist route content later became another accepted teaching authority.                                              |
| same                                                                       | 145-160         | `spelling_canonical_mappings` own exact misspelling/correction/skill truth; `learning_items` are child-specific; mastery/evidence meaning is separately governed.                                                                                      | `CURRENT`                                                                                                                                            |
| same                                                                       | 162-204         | Dictionary metadata does not itself imply learner practice, evidence, mastery, or resolver truth.                                                                                                                                                      | `CURRENT`                                                                                                                                            |
| `docs/implementation/adle-canonical-target-identity-and-guarded-intake.md` | 7-20            | Learner target is child + word + error route; one word schedule is shared; route attribution does not duplicate evidence. The original intake record also required exact support.                                                                      | Identity clauses `CURRENT`; the blanket support clause is `HISTORICAL` for specialist routes because current intake has route-specific substitution. |
| same                                                                       | 45-53           | A local Base Word proof showed one word with two learner routes, one shared attempt/outcome, and attribution to both routes.                                                                                                                           | `HISTORICAL` proof of a still-current capability                                                                                                     |
| `docs/implementation/adle-phase-e-legacy-convergence-audit.md`             | 31-80           | Current V3 flow separates occurrence, learner target, teaching group, and per-word Review identity.                                                                                                                                                    | `CURRENT` semantic architecture; deployment SHA/counts in the file are historical.                                                                   |
| same                                                                       | 82-97           | R6 owns immutable Review outcomes/repairs; R5 owns per-word schedule; `legacy_bundle` remains supported.                                                                                                                                               | `CURRENT`                                                                                                                                            |
| same                                                                       | 134-145         | First impression is controlled evidence, Review can produce, support/approval/banding gate breadth, repair cannot overwrite failure, correct spelling is not automatic breadth.                                                                        | `CURRENT`                                                                                                                                            |
| `docs/implementation/adle-current-state-and-release-registry.md`           | 36-76           | Base, five Prefix, ten Suffix, and current Compound specialist routes have governed production/release states and exact profile/content rosters.                                                                                                       | `CURRENT` capability register; SHA at 12-18 is `CONTRADICTED` by the newer deployment.                                                               |
| `docs/implementation/writing-engine-roadmap.md`                            | 4160-4237       | The old bounded Stage 2C resolver intentionally returned one primary skill and excluded multi-skill output or mastery updates.                                                                                                                         | `HISTORICAL` and out of scope for current ADLE proficiency; it governs an earlier resolver slice, not Slice 5 breadth.                               |

### Documentation conclusion

The current governed proficiency policy is not ambiguous about equal
state-derived breadth or the support/approval/banding gates. The unresolved
architecture is newer: the policy predates specialist route profiles/content
that can independently prove exact word+skill teaching authority. The docs say
both facts are current but never define how specialist authority is projected
into proficiency. That is a documentation/architecture convergence gap, not
permission to remove all approval gates.

## 4. Actual word ↔ micro-skill data model

```text
observed occurrence / parent-local candidate
        │ child/source scoped
        ▼
approved canonical mapping candidate
        │
        ├── global spelling_canonical_mappings
        │      misspelling + correction + micro_skill
        │      (no child_id)
        │
        ▼
canonical_teaching_dictionary_words
        │ canonical word identity
        ├── canonical_teaching_dictionary_word_support
        │      word + micro_skill + role + review lifecycle
        ├── specialist profile/member or route-content authority
        │      word + exact specialist micro_skill + release lifecycle
        │
        ▼
adle_learning_items
        child + canonical word + micro_skill
        │
        ├── adle_learning_item_sources (immutable lineage)
        └── one adle_review_schedule_words row per child + word
                 └── schedule/outcome/attempt route rows for every linked item

taught/outcome/authentic/slippage ledgers
        │ child + word; outcomes optionally have route attribution
        ▼
priceWordEvidence → computeWordEvidenceState
        │ child + word only
        ▼
computeSkillProficiency
        │ enumerates generic support links, not learner routes/profiles
        ▼
ephemeral per-child per-skill per-level proficiency report
```

### Schema facts

- `spelling_canonical_mappings` has
  `misspelling_normalized`, `correct_spelling_normalized`, and
  `micro_skill_key`, but no child identity
  (`supabase/migrations/20260525123937_baseline_current_production_schema.sql:1805-1829`).
  Its active unique index is on misspelling + correction + dialect, not skill
  (`:2662`). Therefore one exact error/correction cannot simultaneously carry
  two active skills, but two different misspellings can point to the same
  corrected word with different skills.
- The Teaching Dictionary support table separately stores word + skill +
  `support_role` + review lifecycle
  (`supabase/migrations/20260629120000_add_canonical_teaching_dictionary_storage.sql:151-189`).
  Canonical mappings do **not** synthesize these rows.
- Canonical intake persists or reuses one active learner item for exact
  child + canonical word + skill and preserves source/canonical mapping lineage
  (`supabase/migrations/20260722180000_add_adle_canonical_intake_and_shared_routes.sql:3-29,63-118`).
- The same migration creates one per-word schedule route and append-only
  attempt/outcome attribution tables; comments explicitly forbid duplicating
  word evidence (`:125-167`).
- Proficiency has no stored child proficiency/breadth record. It is recomputed
  by `computeAllSkillProficiency`; the only stored derived denominator is
  `canonical_teaching_dictionary_skill_level_allocation`.

### Direct answers to question B

1. **Can one word have multiple governed skills?** Yes, in three distinct
   senses: multiple global canonical error mappings (different misspellings),
   multiple generic support links, and multiple specialist profile/content
   memberships. A child can also have multiple learning items for the same
   word. These are different authorities and must not be collapsed into learner
   history.
2. **Are word/skill relationships derived from canonical mappings?** Canonical
   mappings establish global error-route truth and drive learner intake, but
   they do not automatically become proficiency support. Proficiency currently
   requires the separate Teaching Dictionary support table.
3. **Are canonical mappings learner-independent?** The global table is. The
   parent-verified candidate/source remains child/source scoped until promoted;
   the global mapping may retain source lineage without becoming child scoped.
4. **What is generic support?** For generic lessons it is curated teaching and
   evidence-eligibility metadata. For Slice 5 it is the only enumerated
   proficiency word→skill link. For specialist V3 it is a second, older gate
   beside route profiles/content, and those authorities have not converged.

## 5. First-impression evidence path

```text
controlled lesson completion
  → one assignment attempt per produced word
  → one active taught-history row with attempt_text
  → priceWordEvidence compares attempt to canonical word
  → correct non-homophone controlled attempt = +0.75
     and isProduction = false
  → computeWordEvidenceState: active, not produced
  → computeSkillProficiency considers every admitted support-linked skill
  → state credit 0.1 at the word's effective level
```

The pricing code converts taught history into lesson/probe candidates
(`lib/adle/evidence-pricing.ts:236-251`), prices a correct controlled lesson at
0.75 with no production flag (`:374-392`), and word state becomes `active` when
there is an encounter but no production (`lib/adle/word-evidence-state.ts:154-171`).

No per-skill evidence amount is written. The taught source can identify the
lesson skill for lineage and pricing-family validity, but the breadth projection
does not restrict credit to that skill. It enumerates all qualifying generic
support links. Breadth is therefore attempted for all admitted word-associated
skills at equal `active=0.1`, subject to support, approval, child band, banding,
and allocation.

## 6. Review evidence path

```text
Review encounter
  → immutable original outcome + original attempt
  → R5/R6 finalization writes one word-level outcome event
  → route rows attribute that one outcome to every active learner route
  → success becomes review/retest/retirement-check pass
  → priceWordEvidence prices pass as recent +0.5 or cold +1.5
     and isProduction = true
  → correct prompted Review writing can additionally write authentic use +2.0
  → computeWordEvidenceState reaches at least produced
  → computeSkillProficiency gives produced=0.4 to every admitted support link
```

R5 finalization derives pass/fail strictly from `original_outcome`, writes one
outcome, and copies all active schedule routes only as attribution
(`supabase/migrations/20260825130000_add_adle_review_r5_finalization.sql:470-536`).
Correct-in-writing success additionally writes one prompted Review authentic-use
event (`:538-565`). Pricing ignores fail outcomes and prices pass outcomes as
review production (`lib/adle/evidence-pricing.ts:252-267,394-435`). The word
becomes `produced` after any positive production
(`lib/adle/word-evidence-state.ts:154-171`).

Target route affects activation, required production context, route lineage,
and homophone validity selection; it does not change proficiency weight. A
Review spelling is not split into target and secondary evidence entries. The
same word state is later projected equally through admitted support links.

The observed `hoping` transition is consistent with this path: Production has
one taught row, one later pass, and one authentic correct-use event. The
governed values `0.75 + 0.5 + 2.0 = 3.25` explain the observed score; the pass
adds a production, moving `active → produced`, and the approved `hoping` support
changes breadth `0.1 → 0.4`.

## 7. Repair proof

Repair attempts are separate append-only rows, and update/delete is rejected
(`supabase/migrations/20260825120000_add_adle_review_r4_word_repair.sql:117-146`).
Terminal repair state is immutable (`:197-215`). Finalization requires a failed
original to reach a terminal repair state but still writes a fail event from the
original outcome (`supabase/migrations/20260825130000_add_adle_review_r5_finalization.sql:470-497`).

`priceWordEvidence` receives taught history, outcome events, authentic use, and
slippage; it never receives repair attempts. It skips failure outcomes
(`lib/adle/evidence-pricing.ts:252-255`). Therefore a correct repair creates no
independent production and no positive breadth transition.

Production corroboration, grouped without learner identity:

| Original outcome | Terminal repair state   | Finalized encounters | Pass outcomes | Fail outcomes |
| ---------------- | ----------------------- | -------------------: | ------------: | ------------: |
| failure          | `completed_correct`     |                    8 |             0 |             8 |
| failure          | `attempted_not_secured` |                    1 |             0 |             1 |
| success          | `not_required`          |                   11 |            11 |             0 |

This behavior is aligned and must not change in proficiency convergence.

## 8. Exact breadth predicate and implementation defect

### Intended predicate from approved docs

For one child, word `W`, skill `S`, and active banding version `V`:

```text
1. W has a word evidence state for the child (unseen is allowed but gives 0).
2. The exact W→S support link is:
     row_status = active
     review_status ∈ {approved_for_guided_review,
                      approved_for_first_exposure}
     support_role ∈ {support_example, review_example}
3. W is an active recognisable canonical word.
4. W is within the child's allowed frequency and age bands.
5. W has an active banding row for V, or a valid active override.
6. The level has an active allocation cell for S under V.
7. Credit = state table; one credit per W+S; level target and lower-level gate apply.
```

Not required by the current proficiency calculation: a learner item for `S`, a
schedule route for `S`, profile membership, assignment eligibility, lesson
source quality, profile release, or the word evidence score independently of
its computed state.

### Actual code predicate

`computeSkillProficiency` first gathers every target-skill link that is merely
active and non-contrast; it omits review-status approval
(`lib/adle/micro-skill-proficiency.ts:140-158`). It then calls
`isMasteryBreadthEligible` (`:164-180`). That helper's evidence gate asks only
whether the word has **any** active approved support mapping, without checking
skill or non-contrast role
(`lib/adle/dictionary-eligibility.ts:187-207,261-270`). Banding, allocation,
state credit, and level gates then apply (`micro-skill-proficiency.ts:174-235`).

The actual relationship test is therefore:

```text
active non-contrast W→S exists
AND any approved support row exists for W (possibly another skill/role)
AND word + child band + effective banding pass
```

This is not the documented exact-link approval predicate.

### Production counterexample

`careful` currently has:

- canonical `carefull → careful → D4_MOR_SUFFIXES_FUL_LESS`;
- canonical `carful → careful → D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX`;
- approved support to `D4_MOR_BASE_WORDS_PRESERVE_BASE`;
- active but `in_review` support to `D4_MOR_SUFFIXES_FUL_LESS`.

For a child with `careful` evidence and eligible banding, the approved Base Word
row satisfies the word-wide gate and the unapproved Suffix row enters the Suffix
numerator. No current regression catches the cross-skill approval leak. This is
a **`RUNTIME_GAP` + `TEST_COVERAGE_GAP`**, not an optional simplification.

### Allocation denominator

The allocation runner counts every active non-contrast support link at an
effective level and does not inspect review status
(`scripts/adle-band-teaching-dictionary.py:300-315`; Slice 5 plan 136-142).
Production has 961 such non-contrast rows and the active allocation rows sum to
961, all computed 2026-07-09. Only 39 support rows are approved today; 922
non-contrast rows remain `in_review`. This denominator policy is explicitly
pinned, so it is not the same bug as the numerator leak. It makes progress
conservative while review is incomplete. Any change to that policy needs an
owner amendment and a full target-impact audit.

## 9. Multi-micro-skill credit behavior

Classification: **`MULTI_MICROSKILL_BUT_EQUAL_WEIGHT`**, implemented in code but
not exercised by any word with two approved generic support links in current
Production.

Exact behavior:

1. `priceWordEvidence` produces one score and production list for child+word.
2. `computeWordEvidenceState` produces one state for child+word.
3. `computeAllSkillProficiency` runs once per allocation skill and scans support
   links. If W→S is admitted, it applies the same word state table.
4. Duplicate links for the same W+S are structurally deduplicated.
5. There is no primary-target multiplier, secondary multiplier, division of
   score, or per-route proficiency event.

Thus one correct spaced spelling can affect more than one skill only when more
than one relationship is admitted by the proficiency support predicate. It
does not consult every canonical misspelling mapping and does not consult every
learner Review route. The current route attribution tables prove which learner
items consumed the event but do not allocate weight.

Production relationship probes:

- No word has two approved generic non-contrast support links.
- `careful`, `diabetes`, and `playing` each have active canonical mappings to
  two different skills, proving the global mapping model can be multi-skill.
- No child+word currently has more than one active learner item, and no active
  schedule currently has more than one active route. The multi-route schema and
  runtime are implemented and regression-covered, but current learner data does
  not provide a live multi-route example.
- `careful` is the nearest real multi-skill support probe, but one of its links
  is unapproved, so it is evidence of the approval defect rather than a clean
  approved multi-skill example.

## 10. Generic support versus Dynamic Prefix authority

### Consumer comparison

| Dimension            | Dynamic Prefix profile/member                                           | Generic support mapping                                   |
| -------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| Identity             | Approved profile + exact canonical member                               | Exact canonical word row                                  |
| Skill                | Profile owns one exact Prefix skill                                     | Row owns one exact skill                                  |
| Approval             | Profile and member review/release lifecycle, production enabled         | Row review status; guided/first-exposure approval         |
| Role                 | Member can be authentic target/transfer and assignment eligible         | `support_example`, `review_example`, or `contrast`        |
| Teaching consumer    | Dynamic Prefix loader/compiler and canonical intake                     | Generic readiness/composer and central readiness fallback |
| Intake authority     | Route-specific ready pair is sufficient (`canonical-intake.ts:591-704`) | Required in the generic fallback (`:703-750`)             |
| Proficiency consumer | None                                                                    | Sole link enumeration in `computeSkillProficiency`        |
| Allocation consumer  | None                                                                    | Sole allocation input                                     |
| Lifecycle            | Specialist profile/member release                                       | General Teaching Dictionary review lifecycle              |

An approved Prefix profile/member/exact skill proves the same core proposition
needed for breadth — “this governed word demonstrates this skill” — and does so
strongly enough to select and teach the word. Generic support additionally has
a route-neutral breadth role and a distinct approval vocabulary. The layers are
therefore not byte-for-byte duplicates, but requiring an independently
populated second row for the same specialist fact is non-converged architecture.

Classification for the five current Prefix routes:
**`HISTORICAL_GATE_NOT_YET_CONVERGED`**.

Why not the alternatives:

- Not `INDEPENDENT_REQUIRED_AUTHORITY`: current specialist intake already
  safely substitutes exact route authority.
- Not pure `DUPLICATE_AUTHORITY`: the generic row carries role and its own
  lifecycle, while the profile carries teaching/release content.
- `PARTIALLY_OVERLAPPING_AUTHORITY` describes the shapes, but not the
  architectural disposition: the proficiency-only requirement is the older
  Slice 5 gate that has not been updated for released specialist profiles.
- Not `UNKNOWN`: consumers and Production overlap were directly inspected.

### Production proof for all five Prefix profiles

| Profile family           | Approved assignment members | Matching approved generic supports |
| ------------------------ | --------------------------: | ---------------------------------: |
| `un-`                    |                           7 |                                  0 |
| `dis- / mis-`            |                           7 |                                  0 |
| `in- / im- / il- / ir-`  |                           7 |                                  0 |
| `re- / pre-`             |                           7 |                                  0 |
| `sub- / inter- / super-` |                           7 |                                  0 |
| **Total**                |                      **35** |                              **0** |

The result is internally consistent: Prefix teaching succeeds through profile
authority while current proficiency breadth is withheld. It is nonetheless a
governance convergence gap because the same governed relationship is admitted
for teaching but invisible to proficiency.

## 11. Other current V3 specialist routes

| Route                              | Word→skill teaching authority                                          | Needs generic support for current intake? | Current breadth authority   | Duplicate/non-converged layer?                                                 |
| ---------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Generic Composer v1                | exact generic support or approved selector/content path                | Yes for the ordinary exact-support path   | generic support             | No; support is native generic authority.                                       |
| Dynamic Prefix v2                  | approved production profile + approved exact member + route-ready pair | No                                        | generic support only        | Yes: historical gate not converged.                                            |
| Dynamic Suffix/Affix v3            | approved production profile + approved exact member + route-ready pair | No                                        | generic support only        | Yes: same split as Prefix.                                                     |
| Base Word v2                       | governed route release/activation + exact route content/member pair    | No                                        | generic support only        | Yes; route registry explicitly declares `wordSupportAuthority: route_content`. |
| Compound Word v2                   | governed curriculum release + exact route content/member pair          | No                                        | generic support only        | Yes; route registry explicitly declares `wordSupportAuthority: route_content`. |
| Other unreleased specialist skills | no production-ready route content                                      | N/A; fail closed                          | generic support if approved | No substitution until a governed route is released.                            |

The central curriculum registry allows specialist `route_content` to substitute
for generic word support (`lib/adle/curriculum-readiness/route-registry.ts:53-58`;
`resolver.ts:338-377`). Base and Compound explicitly declare that authority
(`route-registry.ts:108-128,223-240`). Prefix and Suffix do not declare it in
that registry (`:145-220`), yet the live canonical-intake evaluator separately
accepts their route-ready profile pairs (`canonical-intake.ts:591-704`). This is
a second internal convergence gap: two readiness consumers encode specialist
substitution differently.

Production exact-pair comparison:

| Specialist family                               | Governed profile/content member pairs | Matching approved generic supports |
| ----------------------------------------------- | ------------------------------------: | ---------------------------------: |
| Prefix                                          |                                    35 |                                  0 |
| Suffix                                          |                                    40 |                                  0 |
| Base Word                                       |                                   225 |                                  0 |
| Compound Word — released closed compounds       |                                     7 |                                  0 |
| Compound Word — unreleased separated/hyphenated |                                     7 |                                  0 |
| **Total**                                       |                               **314** |                              **0** |

The 314 inventoried pairs contain 307 currently released pairs and seven
unreleased Compound pairs. The appropriate fix must be route-neutral. Adding
307 generic rows merely to mirror already-released specialist content would
preserve two authorities and invite drift. Conversely, bypassing approval for
arbitrary mappings — or admitting the seven unreleased pairs — would be unsafe.
The convergence needs one normalized approved word+skill authority interface
with typed provenance.

## 12. Real Production trace: `dishonest`

Current Production contains:

- one active approved canonical word `dishonest`;
- one active visible mapping
  `disshonest → dishonest → D4_MOR_PREFIXES_DIS_MIS`;
- no `disonest → dishonest → Silent H` mapping;
- no generic support row for `dishonest`;
- one approved Dynamic Prefix `dis-/mis-` membership for the DIS/MIS skill;
- one taught-history row, one `review_pass`, and one outcome route for the DIS
  learner target.

The owner's two-skill `dishonest` example is therefore conceptually valid but
is not current Production truth. Silent H must not be inferred or manufactured.

Actual current result for the independent Review success:

```text
Review pass
  → word-level review production evidence
  → word can become produced
  → DIS route receives attribution
  → proficiency scans generic support
  → no dishonest support rows
  → no DIS breadth; no Silent-H breadth
```

Profile membership made the lesson/intake relationship governed, but the
profiler never reads it. This is the cleanest direct demonstration of the
specialist authority split.

## 13. Docs versus code versus Production matrix

| Semantic rule                              | Documentation says                                                                           | Code does                                                                                           | Production evidence                                                                                         | Verdict                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Multiple skills per word                   | Each mapped skill can receive breadth.                                                       | Support scanner can credit multiple skills; mapping and route schema support multiples.             | Three words have two active canonical mapping skills; no word has two approved support skills.              | `ALIGNED` capability; Production not exercising approved case.                      |
| Canonical misspelling-derived relationship | Mapping owns exact misspelling/correction/skill truth, separate from support.                | Intake consumes it for learner target; profiler does not.                                           | `careful`, `playing`, `diabetes` show multiple mapping routes.                                              | `ALIGNED`                                                                           |
| Learner-specific target                    | Child + word + skill remains distinct from global word relationships.                        | Learning item/source/route tables implement it.                                                     | `dishonest` has DIS learner route only.                                                                     | `ALIGNED`                                                                           |
| First-impression evidence                  | +0.75 controlled, active, not production.                                                    | Correct taught attempt is +0.75 and `isProduction=false`.                                           | `hoping` taught history supports observed 0.75 start.                                                       | `ALIGNED`                                                                           |
| Review production evidence                 | Pass is +0.5 recent or +1.5 cold; may move to produced; prompted writing may add 2.0.        | Word outcome + authentic-use pricing implements this.                                               | `hoping` facts explain 3.25 and `dishonest` has a pass.                                                     | `ALIGNED`                                                                           |
| Repair semantics                           | Original failure immutable; repair is not independent production.                            | Repair separate; finalizer writes fail; pricer ignores repair.                                      | Eight correct terminal repairs still produced eight fail outcomes and zero passes.                          | `ALIGNED`                                                                           |
| Targeted skill weighting                   | Older semantic contract names roles; current Slice 5 pins equal breadth.                     | No target/secondary weighting.                                                                      | No per-skill weighted evidence rows.                                                                        | `NO GAP — CURRENT BEHAVIOUR INTENTIONAL`; owner hypothesis requires a new decision. |
| Secondary/incidental skill credit          | Current blueprint says each mapped skill equally; only genuinely tested skills should count. | Every admitted support link gets same state credit.                                                 | No clean double-approved support word; capability unexercised.                                              | `ALIGNED` policy, `TEST_COVERAGE_GAP` in live-like fixtures.                        |
| Generic support gate                       | Current correction says support/approval/banding required.                                   | Generic support is sole proficiency enumerator.                                                     | Specialist success without support gets word evidence but no breadth.                                       | `ALIGNED` operationally; `DUPLICATE_AUTHORITY` architecturally for specialists.     |
| Exact support approval                     | The exact W→S link must be approved.                                                         | Target link need not be approved if W has another approved link.                                    | `careful` is a real cross-skill counterexample shape.                                                       | `CONTRADICTORY`                                                                     |
| Profile membership authority               | Released specialist profile/content authorizes teaching.                                     | Live intake accepts it; profiler ignores it; central registry differs for affixes vs Base/Compound. | 307 released specialist pairs have zero approved support overlap; seven more Compound pairs are unreleased. | `DOCS_AHEAD_OF_CODE` for proficiency; `DUPLICATE_AUTHORITY`                         |
| Level/banding                              | Child band + effective banding + allocation target; gated levels.                            | Implemented.                                                                                        | Active allocation has 368 cells across 238 skills, sum allocation 961.                                      | `ALIGNED` with intentional denominator asymmetry.                                   |
| Breadth proficiency                        | Pure projection by state and qualifying mapped skill.                                        | Implemented; only composer not-yet-secure selection consumes reports currently.                     | Natural `hoping` 0.1→0.4 observed.                                                                          | `ALIGNED`, except exact-link bug and specialist authority gap.                      |

## 14. Gap register

| ID  | Gap                                                                                                                           | Classification                                                                                                 | Correctness or simplification?          | Evidence / consequence                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| G1  | Target W→S support approval is not checked on the same link.                                                                  | `RUNTIME_GAP`, `TEST_COVERAGE_GAP`                                                                             | Correctness                             | Cross-skill approval can unlock an `in_review` link; `careful` proves the Production shape.                       |
| G2  | Specialist route authority is invisible to proficiency and allocation.                                                        | `DUPLICATE_AUTHORITY`, `RUNTIME_GAP`, `DOCUMENTATION_GAP`                                                      | Correctness of V3 authority convergence | 307 released specialist pairs have zero approved generic overlap; legitimate word evidence yields no breadth.     |
| G3  | Prefix/Suffix live intake and central readiness registry encode substitution differently.                                     | `RUNTIME_GAP`, `TEST_COVERAGE_GAP`                                                                             | Correctness/consistency                 | Canonical intake accepts route-ready affix profiles; central resolver defaults affixes to generic support.        |
| G4  | Canonical mappings and specialist memberships are not normalized into one shared proficiency relationship set.                | `DATA_GOVERNANCE_GAP`, `DUPLICATE_AUTHORITY`                                                                   | Correctness of provenance/approval      | Multiple true sources exist but consumers choose tables ad hoc.                                                   |
| G5  | No approved generic multi-skill Production word or live current multi-route learner case exercises equal multi-skill breadth. | `TEST_COVERAGE_GAP`                                                                                            | Correctness protection                  | Feature exists mainly in unit/regression fixtures; Production cannot demonstrate clean target+secondary behavior. |
| G6  | Active allocation denominator intentionally includes `in_review` links while numerator requires approval.                     | `NO_GAP — CURRENT BEHAVIOUR INTENTIONAL`                                                                       | Policy choice, not defect               | Owner-approved Slice 5 pin; conservative targets. Revisit only through policy amendment.                          |
| G7  | Stronger target / weaker incidental proficiency weighting is absent.                                                          | `NO_GAP — CURRENT BEHAVIOUR INTENTIONAL` under current policy; potential `DOCUMENTATION_GAP` if owner wants it | Optional future design                  | Current policy explicitly equal; old role-weight formula is not frozen/current scoring authority.                 |
| G8  | Current-state docs contain the previous Production SHA.                                                                       | `DOCUMENTATION_GAP`                                                                                            | Operational hygiene                     | Verified Production and origin/main are `42bf928…`; no proficiency semantic impact.                               |
| G9  | No persisted child proficiency/breadth row exists.                                                                            | `NO_GAP — CURRENT BEHAVIOUR INTENTIONAL`                                                                       | Intentional simplification              | Slice 5 deliberately shipped a pure read model.                                                                   |

There is no evidence for a migration/schema gap in the smallest convergence:
the existing tables can be adapted into a normalized read authority. A new
materialized relationship table or persisted per-skill evidence ledger would
create a migration requirement, but neither is necessary for the first safe
fix.

## 15. Recommended target architecture from existing governance

### Direct answers

**Should a canonical word have one governed set of skill relationships shared
by all learners?** Yes. The relationship set should be a learner-independent,
versioned projection of approved global authorities. Learner items remain
separate and identify why this child is being taught/reviewed.

**Should learner teaching history determine weighting rather than identity?**
Teaching history must never determine global word identity. It may determine
route attribution, prompt/context validity, and — only after a new owner policy
decision — target-versus-secondary weighting. Current proficiency policy does
not authorize that weighting.

**Should correct spaced retrieval provide evidence to more than one skill?**
Yes, current policy already says breadth counts in each governed mapped skill.
The evidence remains one word event; proficiency is a projection through every
approved relationship that the spelling genuinely demonstrates.

**Should the taught skill receive stronger credit?** Not in the first
convergence. The concept is plausible and preserved in older semantic role
vocabulary, but current owner-approved Slice 5 says equal state-derived breadth.
Changing it would alter learner scores and requires a dedicated evidence-policy,
history, calibration, and UI decision.

**What permits secondary credit?** A normalized, learner-independent,
approved word+skill authority record with provenance and a role allowed for
breadth. A raw canonical misspelling mapping alone should not automatically
grant secondary breadth; it proves diagnostic route truth but not necessarily
that a correct whole-word production genuinely tests the skill. It must be
promoted/adopted into support authority or be covered by released specialist
route content.

**Is generic support still necessary?** Yes as the generic route's native
curated relationship authority and as one source of normalized proficiency
authority. No as a mandatory duplicate row when a released specialist profile
or exact route-content authority already proves the same approved word+skill
fact.

**Can specialist membership substitute?** Yes when the route/profile and member
are active, correctly reviewed/released, exact to word+skill, non-contrast for
breadth, and the route is production/current. This is already the intake model.

**Prefix-only or route-neutral?** Route-neutral. Prefix, Suffix, Base, and
Compound all exhibit the split; future specialist routes will repeat it unless
the policy is centralized.

### Proposed normalized read contract

```ts
type WordSkillProficiencyAuthority = {
  canonicalWordId: string;
  microSkillKey: string;
  proficiencyRole: "support_example" | "review_example";
  approvalState: "approved_for_breadth";
  provenanceKind:
    | "canonical_word_support"
    | "specialist_profile_member"
    | "specialist_route_content";
  provenanceId: string;
  authorityVersion: string;
};
```

This is a conceptual interface, not a schema proposal. Each source adapter must
fail closed. Deduplicate by word+skill after retaining all provenance. The exact
same normalized set must drive both proficiency numerator eligibility and the
allocation denominator's source set, with the existing intentional review-
status denominator policy either explicitly represented or separately amended.

Canonical misspelling mappings remain a discovery/intake authority. They do not
enter this set merely by existing. Learner items and Review route rows remain
child-specific attribution, not global word→skill authority.

## 16. Smallest staged convergence plan

### P1 — Lock the observed boundaries and approval defect

- **Semantic change:** none; add diagnostic/regression coverage for current
  first-impression, Review, repair, equal multi-skill, specialist-without-support,
  and cross-skill approval-leak behavior.
- **Runtime files/functions:** tests around
  `computeSkillProficiency`, `isMasteryBreadthEligible`, canonical intake, and
  Review pricing only; do not edit production functions in this stage.
- **Schema/data impact:** none.
- **Migration:** none.
- **Historical compatibility:** fixtures include historical generic support and
  current specialist authority separately.
- **Regressions:** assert the defect reproduces before fixing; assert repair
  never produces; assert route attribution does not duplicate evidence.
- **Production safety:** local facts only; no Production writes.
- **Stop condition:** stop if a fixture cannot reproduce Production's `careful`
  relationship shape or if current outcomes differ from this receipt.

### P2 — Owner architecture gate: approve route-neutral authority semantics

- **Semantic change:** amend governance to name one normalized proficiency
  word+skill authority and enumerate admissible source adapters/approval states.
  Explicitly preserve equal state-based breadth in this stage.
- **Runtime files/functions:** planning references for
  `dictionary-eligibility.ts`, `micro-skill-proficiency.ts`, curriculum route
  registry/resolver, and allocation runner.
- **Schema/data impact:** none.
- **Migration:** none.
- **Historical compatibility:** generic support remains valid; specialist
  historical snapshots remain readable; no history is reinterpreted yet.
- **Regressions:** review the proposed matrix against all current routes.
- **Production safety:** documentation/decision only.
- **Stop condition:** stop unless the owner explicitly chooses: admitted
  specialist sources, exact approval states, role normalization, denominator
  treatment, and whether affix route registry declarations are corrected.

### P3 — Correct exact-link approval and centralize the read authority

- **Semantic change:** enforce approval on the exact W→S relationship; adapt
  approved generic support and approved specialist route/profile content into
  the normalized set; dedupe W+S.
- **Runtime files/functions:** likely
  `lib/adle/dictionary-eligibility.ts`,
  `lib/adle/micro-skill-proficiency.ts`, a new small pure authority adapter,
  `lib/adle/curriculum-readiness/route-registry.ts`,
  `lib/adle/curriculum-readiness/resolver.ts`, and loader fact assembly.
- **Schema/data impact:** none in the recommended adapter-first shape.
- **Migration:** none.
- **Historical compatibility:** generic support continues unchanged; current
  specialist profile/content rows are read, not rewritten; old assignments and
  evidence remain immutable.
- **Regressions:** exact-link approval, provenance dedupe, all five Prefix,
  all Suffix, Base, Compound, generic fallback, unreleased-route fail closed,
  multi-skill equal breadth, and byte-stable unrelated composer selection.
- **Production safety:** feature-gated or shadow-only initially; no data writes.
- **Stop condition:** stop on any ambiguous specialist approval, duplicate W+S
  disagreement, released route with incomplete provenance, or changed repair/
  evidence score.

### P4 — Converge allocation computation on the same source policy

- **Semantic change:** make denominator source authority explicit and consistent
  with P2. Preserve the approved policy that may count unapproved generic rows
  only if the owner reaffirms how that maps to normalized authority; do not
  silently change target sizes.
- **Runtime files/functions:**
  `scripts/adle-band-teaching-dictionary.py` or a route-neutral replacement,
  allocation loaders/report tooling.
- **Schema/data impact:** derived allocation rows only, after shadow comparison
  and a separately approved recomputation procedure.
- **Migration:** no schema migration; a governed data recomputation may be
  required and must be separately authorised.
- **Historical compatibility:** retain banding version and prior allocation
  receipts; never rewrite learner evidence.
- **Regressions:** before/after per-skill-level allocation diff; target/progress
  impact report; zero unapproved accidental numerator links.
- **Production safety:** read-only shadow report first; no apply in this stage.
- **Stop condition:** stop on unexplained allocation shrink/growth, any score or
  level change outside the approved semantic delta, or missing specialist band.

### P5 — Production shadow verification and guarded release

- **Semantic change:** none beyond approved P3/P4 decisions.
- **Runtime files/functions:** shadow comparison/report surface and deployment
  configuration only.
- **Schema/data impact:** none unless P4 receives separate data-apply authority.
- **Migration:** none expected.
- **Historical compatibility:** verify current/historical assignments, generic,
  specialist, Review, and composer reads.
- **Regressions:** full ADLE proficiency, dictionary eligibility, canonical
  intake/readiness, evidence, Review R4/R5/R6, composer, and specialist suites;
  Production read-only comparison by route and skill.
- **Production safety:** deploy code only after owner approval; keep rollback
  path and compare counts before enabling the converged reader.
- **Stop condition:** any learner score drift beyond the approved authority
  delta, any Review/repair drift, any missing profile member, or any Production
  write during verification.

### P6 — Optional later policy: targeted versus incidental weighting

- **Semantic change:** only if separately approved, introduce primary-tested
  versus secondary/supporting per-skill weighting.
- **Runtime files/functions:** evidence policy/version, route attribution,
  proficiency projection, reporting, and calibration tooling.
- **Schema/data impact:** potentially material; may require versioned interpreted
  evidence or sufficient immutable source lineage.
- **Migration:** unknown until designed; not part of P1-P5.
- **Historical compatibility:** must not silently reinterpret old evidence under
  a new model; versioned projection or explicit recalculation policy required.
- **Regressions:** target/secondary reversal by learner history, negative
  evidence boundaries, calibration, historical replay, and UI explanations.
- **Production safety:** shadow scores and owner calibration before release.
- **Stop condition:** no explicit owner decision, insufficient lineage, unclear
  role definitions, or unacceptable historical score movement.

## 17. What must not change in the first convergence

- Word-level evidence pricing, evidence weights, caps, or score history.
- `active / produced / secure / review_retired / mastered` state semantics.
- Original Review outcome immutability or repair exclusion.
- One word-level Review event with route attribution rather than duplicated
  evidence/reward events.
- Learner item identity: child + canonical word + skill.
- Global canonical mapping truth or parent-local occurrence lineage.
- Prefix/Suffix/Base/Compound profile content, membership, releases, or learner
  assignments merely to populate generic support.
- Child-band obscure-word firewall, banding version, level gating, or target
  formula without a separate policy decision.
- Equal breadth weights in the authority-convergence release.
- Historical learner rows, snapshots, evidence, schedules, or rewards.
- Production data through an audit or shadow-verification path.

## 18. Verification receipt

Existing regressions run from the clean pinned worktree:

| Command                                          | Result |
| ------------------------------------------------ | ------ |
| `npm run adle:proficiency-regression`            | PASS   |
| `npm run adle:dictionary-eligibility-regression` | PASS   |
| `npm run adle:evidence-regression`               | PASS   |
| `npm run adle:canonical-intake-regression`       | PASS   |
| `npm run adle:review-r4-word-repair-regression`  | PASS   |
| `npm run adle:review-r5-regression`              | PASS   |
| `npm run adle:review-r6-regression`              | PASS   |

These green suites confirm the intended current paths but do not invalidate the
cross-skill approval defect: the current proficiency suite lacks that fixture.

Production read-only inventory relevant to the decision:

| Fact                                                            |    Result |
| --------------------------------------------------------------- | --------: |
| Approved `support_example` rows                                 |        39 |
| `in_review` `support_example` rows                              |       900 |
| `in_review` `review_example` rows                               |        22 |
| `in_review` contrast rows                                       |        27 |
| Active non-contrast rows / allocation sum                       | 961 / 961 |
| Active allocation cells / skills                                | 368 / 238 |
| Approved generic multi-skill words                              |         0 |
| Active canonical target words with >1 mapped skill              |         3 |
| Current child+word pairs with >1 active learning-item skill     |         0 |
| Current active per-word schedules with >1 active route          |         0 |
| Released specialist word+skill pairs / approved generic overlap |   307 / 0 |
| Governed but unreleased Compound word+skill pairs               |         7 |

No write was needed to establish the architecture.

## 19. Git status and exact next implementation gate

The audit began from a clean worktree at exact `origin/main`. At close, the only
intended change is this untracked audit receipt:

```text
?? docs/implementation/adle-v3-proficiency-authority-audit.md
```

No runtime, test, migration, seed, mapping, profile, generated artifact,
lockfile, deployment, or Production file was changed. No commit or push was
performed.

**Exact next implementation gate:** owner approval of P2 — a route-neutral
`WordSkillProficiencyAuthority` contract that (a) requires approval on the exact
word+skill relationship, (b) admits named approved specialist profile/route-
content sources as substitutes for duplicate generic support, (c) preserves
equal state-based breadth and repair/word-evidence semantics, and (d) explicitly
decides whether the allocation denominator retains its current inclusion of
active `in_review` generic links. Only after that decision may P3 runtime work
begin.

## Verdict

`V3 PROFICIENCY AUTHORITY AUDIT COMPLETE — CONVERGENCE PLAN READY`

`V3 PROFICIENCY AUTHORITY AUDIT COMPLETE — IMPLEMENTATION DECISION READY`
