# ADLE Phase C learner-evidence reconciliation — 2026-08-30

Status: `PHASE C COMPLETE — LEARNER EVIDENCE PROJECTION READY`

Interpretation version: `ADLE_LEARNER_EVIDENCE_PROJECTION_V1`

This is a server-only, SELECT-only shadow read model. It does not replace any
current proficiency, Review, scheduler, composer, assignment, resolver, reward,
Word Treasure, or UI authority.

## A. Evidence sources discovered

| Source | Stable event identity | Meaning and outcome truth | Canonical word resolution | Verification | Environment classification | Causal attribution | Duplicate risk | Phase C admission |
|---|---|---|---|---|---|---|---|---|
| `adle_assignment_attempt_events` | immutable row ID | individual submitted answer and stored `is_correct` | direct canonical word ID | immutable runtime outcome | task section, template, evidence class, attempt kind, and source provenance jointly distinguish controlled production, Review contextual production, direct Review checks, repair, and exposure | incorrect attempts use an exact active visible resolver mapping only | R5/R6 outcome and repair rows may mirror it | admitted when it is a performance; exposure rows excluded |
| `adle_review_outcome_events` + `adle_review_word_encounters` | original assignment-attempt ID when the encounter proves the link; otherwise outcome row ID | immutable original Review result | direct canonical word ID | runtime outcome | linked original creative Review is contextual; governed legacy direct Review outcome is isolated | exact governed misspelling mapping only | commonly mirrors the assignment attempt | admitted; proven mirrors collapse |
| Review-prompted `adle_authentic_use_events` | linked original assignment-attempt ID | compatibility record for the original must-use target outcome | direct canonical word ID | parent-verified stored row | contextual, never authentic merely because the row is named `authentic_use` | inherited from the original performance | mirrors assignment and Review outcome stores | admitted as a representation; proven mirrors collapse |
| `adle_review_repair_attempts` | linked repair assignment-attempt ID | repair/reacquisition detail, not a new Review success | direct canonical word ID through the encounter | runtime record | repair | no proficiency projection | mirrors the repair assignment attempt | admitted as repair metadata; proven mirrors collapse |
| learner-chosen `adle_authentic_use_events` | writing-piece identity (`child + word + piece_ref`) | verified learner-chosen use or same-piece self-correction | direct canonical word ID | `parent_verified`, row status, and verification time | authentic writing; self-correction is repair | an original verified slip remains causal; correction never erases it | Writing Engine compatibility rows can represent the same piece | admitted when active; rejected/inactive rows excluded |
| `adle_slippage_events` | immutable source reference | verified original spelling slip | direct canonical word ID | stored active row | controlled, contextual, authentic, or isolated from governed `context_kind` | exact governed misspelling mapping only | may coexist with same-piece authentic correction | admitted when active |
| `adle_taught_word_history` | immutable row ID | assignment/exposure history, not learner performance | direct canonical word ID | not applicable | exposure only | none | none material | excluded |
| `practice_attempts` | immutable row ID | direct legacy spelling attempt | exact normalized target word | immutable attempt outcome | controlled for controlled mode; otherwise isolated | exact governed misspelling mapping only | compatibility evidence may mirror it | admitted where canonical identity resolves |
| `learning_item_evidence` | exact upstream writing issue, correction-attempt, or writing-piece lineage when present; otherwise its own row ID plus an ambiguity key | generic compatibility evidence, not automatically source truth | exact normalized word from governed metadata or writing issue | source-context dependent | final issue/authentic confirmation is authentic; controlled practice is controlled; child correction is repair | explicit verified micro-skill only for negative evidence | high; 71 Production representations collapsed | admitted only for governed contexts; missing words blocked; unresolved possible duplicates fail closed |
| `parent_verified_spelling_candidate_mappings` | original writing-issue occurrence, Review occurrence, or immutable source occurrence | parent-verified causal misspelling occurrence; verification is not another performance | exact normalized corrected spelling | parent verification decision and candidate status | authentic unless exact Review provenance proves contextual | mapping's explicit micro-skill | can mirror final issue compatibility evidence | admitted when active and canonical; rejected/inactive excluded |
| `writing_issue_correction_attempts` | immutable correction-attempt ID | separate repair attempt with independently retained outcome | exact normalized approved/suggested replacement | immutable attempt | repair | none for proficiency | compatibility evidence often mirrors it | admitted as repair metadata; missing words blocked |
| `child_word_treasure_evidence_candidates` | immutable candidate ID | downstream reward/verification candidate, not a Phase C performance authority | exact normalized corrected word where possible | candidate state is not sufficient performance verification | no safe current classification | none | possible upstream Writing Engine overlap | blocked as unsupported; zero Production rows |

## B. Canonical Phase C event model

```ts
type LearnerWordEvidenceEvent = {
  eventId: string
  learnerId: string
  canonicalWordId: string
  occurredAt: string
  outcome: "correct" | "incorrect" | "unknown"
  environment:
    | "CONTROLLED_LESSON"
    | "ISOLATED_RETRIEVAL"
    | "CONTEXTUAL_TRANSFER"
    | "AUTHENTIC_WRITING"
    | "REPAIR"
    | "EXPOSURE_ONLY"
  verificationState: "verified" | "suspected" | "rejected"
  independence: "independent" | "scaffolded" | "answer_visible"
  causalMicroSkillKeys: string[]
  sourceKind: LearnerEvidenceSourceKind
  sourceEntityId: string
  provenance: {
    interpretationVersion: "ADLE_LEARNER_EVIDENCE_PROJECTION_V1"
    performanceLineageKey: string
    sourceRepresentations: Array<{
      sourceKind: LearnerEvidenceSourceKind
      sourceEntityId: string
      representationRole:
        | "source_event"
        | "derived_outcome"
        | "compatibility_evidence"
        | "repair_detail"
        | "verification"
        | "exposure"
    }>
    canonicalWordResolution: {
      kind: "direct_canonical_id" | "exact_normalised_word"
      authorityReference: string
    }
    classificationReasons: string[]
    verificationEntityId: string | null
    verifiedAt: string | null
  }
}
```

`eventId` is the stable hash of the interpretation version and exact performance
lineage. Verification metadata is attached to that event; it does not change
`occurredAt` or fabricate a second performance.

Skill projections contain the stable event reference, learner, canonical word,
micro-skill, polarity, occurrence time, environment, and (for positive facts)
the Phase B relationship fingerprint.

## C. Environment-classification rules

- `CONTROLLED_LESSON`: independent, answer-hidden lesson production proven by
  section/template/evidence provenance, including Cover–Write and sentence
  dictation. Recognition, modelling, and guided display are not promoted.
- `ISOLATED_RETRIEVAL`: a direct spelling check, including the Review fallback
  for a due target not used in the original contextual writing.
- `CONTEXTUAL_TRANSFER`: the original independent target outcome in creative,
  problem-solving, conundrum, or other meaningful Review writing where ADLE
  selected the must-use word. Prompted Review rows named `authentic_use` remain
  contextual.
- `AUTHENTIC_WRITING`: verified learner-chosen writing only, with no ADLE
  must-use target provenance.
- `REPAIR`: an immediate or returned correction after an error. It remains
  auditable reacquisition metadata and produces no positive or negative skill
  projection.
- `EXPOSURE_ONLY`: assignment creation, target display, modelling, guided
  recognition, or taught-history state. It is excluded from the normalized
  performance stream.

Verified independent correct events in the first four environments project
through every admitted positive Phase B `demonstrates` relationship. Incorrect
events project only to explicit governed causal micro-skills. Unknown causal
attribution remains an empty array; Phase C never fans a failure out through
the positive word graph.

## D. Deduplication rules

1. Exact immutable upstream lineage is the only automatic cross-store collapse
   key. Source priority chooses the primary representation but preserves every
   source entity in provenance.
2. Review outcome, prompted-use, and repair detail rows collapse onto the
   original assignment attempt only when Review encounter lineage proves it.
3. Writing Engine verification collapses onto the original writing issue or
   writing piece. The original issue's own submission time is authoritative;
   later verification retains `verifiedAt` separately.
4. Generic compatibility rows collapse only when they expose that exact issue,
   piece, or correction-attempt identity.
5. `learner + word + date` is never a dedupe key. Two genuine activities on the
   same date remain two events.
6. A possible duplicate without exact lineage makes every implicated candidate
   `AMBIGUOUS`; conflicting facts on one exact lineage also fail closed.

## E. Files changed

- `lib/adle/proficiency/evidence/contracts.ts` — versioned event, provenance,
  decision, projection, and reconciliation contracts.
- `lib/adle/proficiency/evidence/adapters.ts` — exact source adapters and causal
  resolver mapping.
- `lib/adle/proficiency/evidence/dedupe.ts` — deterministic exact-lineage
  collapse and fail-closed ambiguity handling.
- `lib/adle/proficiency/evidence/projector.ts` — positive Phase B fan-out and
  asymmetric causal-negative projection.
- `lib/adle/proficiency/evidence/classifier.ts` — normalized read-model assembly,
  safe aggregates, and fingerprints.
- `lib/adle/proficiency/evidence/canonical.ts` — stable canonicalization and hash
  helpers.
- `lib/adle/proficiency/evidence/repository.ts` — `server-only`, SELECT-only
  Production/source loader.
- `lib/adle/proficiency/evidence/report.ts` — identity-free aggregate report.
- `scripts/adle-learner-evidence-regression.ts` — required fixture regressions
  and static safety checks.
- `scripts/adle-learner-evidence-reconciliation.ts` — explicitly guarded live
  reconciliation command.
- `package.json` — Phase C regression and reconciliation scripts.
- this report.

## F. Fixture results

All required fixtures pass:

- correct `hopeful` remains one event and produces three positive skill
  projections;
- `hopefull` produces only the governed negative `-ful` projection;
- `hopful` produces only the governed preserve-base negative projection;
- controlled `fearful` Cover–Write correct plus dictation incorrect remains two
  events, one positive word event plus the causal negative;
- two controlled failures plus a correct repair preserve both failures and
  create no positive projection from repair;
- original creative/problem-solving Review writing is contextual;
- the unused-target direct Review check is isolated retrieval;
- Review-prompted data named authentic is contextual;
- genuine verified learner-chosen writing is authentic;
- suspected authentic evidence is retained pending verification but is
  ineligible for projection;
- verification activates the original event ID and occurrence time without a
  second learner performance;
- original failure plus successful repair remains negative plus repair;
- exact cross-store lineage collapses; two same-day activities do not;
- unresolved possible duplication fails closed;
- blocked Phase B relationships never project;
- specialist-only and resolver-only admitted relationships do project.

## G. Production reconciliation

Two consecutive guarded SELECT-only Production reads returned identical values.
No learner identity or raw writing was emitted.

| Source | Raw | Admitted representations | Excluded | Blocked | Ambiguous | Duplicate representations collapsed |
|---|---:|---:|---:|---:|---:|---:|
| assignment attempts | 342 | 206 | 136 | 0 | 0 | 0 |
| Review outcomes | 23 | 23 | 0 | 0 | 0 | 20 |
| Review-prompted authentic-use rows | 2 | 2 | 0 | 0 | 0 | 2 |
| Review repairs | 10 | 10 | 0 | 0 | 0 | 10 |
| authentic-use rows | 371 | 371 | 0 | 0 | 0 | 0 |
| slippage rows | 0 | 0 | 0 | 0 | 0 | 0 |
| taught history | 76 | 0 | 76 | 0 | 0 | 0 |
| generic learning-item evidence | 179 | 167 | 0 | 12 | 0 | 71 |
| legacy practice attempts | 0 | 0 | 0 | 0 | 0 | 0 |
| Writing Engine verified spelling | 93 | 82 | 1 | 10 | 0 | 0 |
| Writing Engine correction attempts | 132 | 107 | 0 | 25 | 0 | 83 |
| Word Treasure candidates | 0 | 0 | 0 | 0 | 0 | 0 |

- raw candidate representations: 1,228;
- admitted primary source events: 782;
- duplicate representations collapsed: 186;
- normalized unique learner word events: 782;
- excluded / blocked / ambiguous representations: 213 / 47 / 0;
- environments: controlled 172; isolated 21; contextual 5; authentic 466;
  repair 118; exposure 0;
- outcomes: correct 577; incorrect 204; unknown 1;
- verification: verified 782; suspected 0; rejected 0;
- positive skill projections: 384;
- causal negative projections: 99;
- positive events projecting to multiple skills: 87;
- historically authentic-named Review rows reclassified contextual: 2;
- specialist-only projections: 161;
- resolver-only projections: 81;
- Phase B blocked relationships encountered by canonical learner evidence: 0.

Fingerprints:

1. source candidates:
   `3af6bfc183e0e5dc0173c297bb372bb2dbb7e88ec99f0195557e266ce474e360`
2. normalized learner word events:
   `fd018daaa06edf277c2ec3679faa2f8de11c9f5924393392a34f46b49ebd685c`
3. word×skill projections:
   `6154f8907335ef43a2e4c273e5363dcead975760d9d6badab7c12471350faa63`

## H. Current naming and lineage debt

- Two current prompted Review records carry an `authentic_use`-shaped source
  name but are deterministically `CONTEXTUAL_TRANSFER`. Phase C changes only
  their shadow interpretation; Word Treasure and rewards remain untouched.
- Generic compatibility stores are not safe authorities by table name. Exact
  upstream issue/piece/attempt lineage is required; 186 proven mirrors were
  collapsed.
- Returned-correction verification metadata can carry a derivative submission
  reference. When it points to an original Writing Engine issue, the issue's
  own submission is the governed occurrence authority. This resolved eight
  initially conflicting pairs without changing stored history.

## I. Blocked and ambiguous evidence

- 47 representations are blocked because their word text has no exact active
  canonical dictionary identity: 12 generic evidence rows, 10 verified
  spelling mappings, and 25 correction attempts. They remain auditable and do
  not project. Some are parallel representations, so this is deliberately a
  representation count rather than an invented unique-performance count.
- zero Production representations remain ambiguous;
- zero real canonical learner events encountered a Phase B blocked
  relationship;
- Word Treasure candidate rows remain an unsupported boundary source, but
  Production currently contains zero such rows.

The 47 blocked representations are row-local canonical identity gaps, not a
schema or lineage failure. The smallest future remedy is governed canonical
dictionary intake for those exact words; Phase C must not invent the IDs.

## J. No-schema verdict

`PHASE C NO-SCHEMA PROJECTION SUFFICIENT`

## K. Boundary proof

- no schema or migration was added;
- no Supabase mutation or RPC was used;
- Production access was guarded and SELECT-only;
- no historical record was rewritten;
- no Review, scheduler, controlled-graduation, proficiency, composer,
  assignment, resolver, Word Treasure, reward, UI, deployment, or Production
  configuration behavior changed;
- the repository imports `server-only`, and regression checks reject mutation
  methods in the Phase C load path;
- existing runtime regressions passed without weakened expectations.

## L. Verification

Passed:

- `npm run adle:authority-docs-check` (before implementation and final gate);
- `npm run adle:learner-evidence-regression`;
- repeated guarded Production `adle:learner-evidence-reconciliation` reads;
- `npm run adle:word-skill-relationship-regression`;
- `npm run adle:word-skill-reconciliation`;
- Review R4 word-repair and persistence-hydration regressions;
- Review R5 and R6 regressions;
- `npm run adle:evidence-regression`;
- all three Writing Engine authentic submission/verification/promotion
  regressions;
- Word Treasure free-writing evidence regression;
- resolver-visible, runtime-integration, readiness, and readiness-read-model
  regressions;
- canonical-intake core, readiness, demand, reconciliation, and
  current-submission regressions;
- specialist compound, affix, and prefix/base snapshot regressions;
- current `adle:proficiency-regression`;
- script TypeScript, application TypeScript, lint, build, and
  `git diff --check`.

## M. Phase verdict

`PHASE C COMPLETE — LEARNER EVIDENCE PROJECTION READY`

## N. Exact recommended next gate

The next safest gate is **scheduler simulation / C2 design**, limited to a
read-only simulation and contract review. Phase C now supplies the singular
controlled, contextual, isolated, authentic, and repair facts needed to test
OR-controlled graduation, Day-1 return, recovery timing, and regression rules
without mutating the live word route. Do not implement scheduler state or schema
until that simulation is explicitly authorised and reconciled against the 172
current controlled events.
