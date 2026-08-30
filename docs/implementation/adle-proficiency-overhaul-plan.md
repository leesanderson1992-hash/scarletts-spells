# ADLE Proficiency Overhaul Plan

## Programme status

```text
PHASE A COMPLETE — AUTHORITY CONVERGED
PHASE B READY
```

Classification: `ACTIVE_IMPLEMENTATION_ROADMAP`

Phase A changed documentation governance only. It changed no runtime,
proficiency calculation, Review/scheduler behaviour, resolver, learner data,
Word Treasure, assignment generation, schema, Supabase state, deployment, or
Production configuration.

The ADLE authority map and machine-readable manifest determine policy
ownership. This roadmap sequences implementation; it does not redefine the
contracts it cites.

## Current runtime versus approved target

| Concern | Current runtime | Approved target owner | Convergence phase |
|---|---|---|---|
| word/skill relationship reads | approved generic support is the current Slice 5 breadth path; specialist/resolver facts are not one normalized proficiency pool | Spelling Proficiency Contract | Phase B |
| evidence projection | current Slice 4/5 word states and state-priced breadth | Spelling Proficiency Contract, Task/Evidence Matrix, Evidence and Lineage Contract | Phase C |
| word graduation and review failure routing | Slice 2/R5 `review_policy_v1_2026-07-04` | Word Progression and Review Contract | Phase C2 |
| complexity and eligibility | current global banding/allocation plus child-band firewall | Spelling Proficiency Contract, V1 Maths, Canonical Word Map Contract | Phase D |
| proficiency levels | current `0.1 / 0.4 / 1.0` Slice 5 projection over global levels | Spelling Proficiency Contract and V1 Maths | Phase E |
| learner-facing proficiency | no complete target Level 1–5 experience | Progression Experience | Phase G |
| controlled release | current consumers unchanged | release plan after shadow approval | Phase H |

Historical Slice plans remain evidence of what was built. They are not target
architecture owners.

## Roadmap

### Phase A — Documentation authority convergence

Status: `COMPLETE`.

Delivered:

- one canonical owner per governed ADLE concern;
- a sole Word Progression and Review target contract;
- proficiency, maths, and task/evidence documents reduced to their own
  concerns;
- current-runtime scheduler/proficiency receipts clearly classified;
- active evidence-lineage and taxonomy contracts cleaned of obsolete target
  models;
- a machine-readable authority manifest and human authority map;
- a documentation drift checker; and
- one bounded Phase B implementation prompt.

### Phase B — Canonical WordSkillRelationship read authority

Build one server-only, read-only, versioned, provenance-preserving normalized
relationship model over existing governed sources.

Required properties:

- normalize approved canonical resolver mappings;
- normalize released specialist memberships/content;
- normalize approved generic support;
- normalize explicit reviewed associations;
- deduplicate by exact `(canonical_word_id, micro_skill_key)`;
- retain relationship role, provenance, and authority version;
- enforce exact-pair approval;
- include specialist/resolver facts without requiring duplicate generic
  support; and
- emit a read-only reconciliation report.

Boundaries:

- server-only;
- no schema or migration;
- no learner evidence or scoring;
- no composer or resolver behaviour change;
- no UI or reward connection;
- no Production writes; and
- no deployment.

If any admitted source lacks stable read identity, review state, or version
lineage, stop with evidence. Do not add schema merely to simplify the adapter.

### Phase C — Learner evidence projection

Interpret existing immutable word events through the Phase B relationship
authority.

- project positive evidence to every governed demonstrated relationship;
- project negative evidence only to governed causal skills;
- classify controlled, isolated, contextual, authentic, repair, and exposure
  environments;
- preserve one source event with many derived references;
- preserve verification and lineage; and
- report unknown/ambiguous evidence without invention.

This phase remains a read-only projection and does not replace current
consumers.

### Phase C2 — Word progression/scheduler replacement

Design and implement the Word Progression and Review Contract only after:

1. queue simulation;
2. current-storage and migration-impact review;
3. in-flight word-route transition design;
4. policy-version coexistence and rollback design;
5. immutable-event vocabulary review; and
6. explicit implementation authority.

Do not implement the scheduler replacement before Phase B. Do not infer storage
changes from documentation cleanup.

### Phase D — Complexity, representative groups, and child eligibility

Using the real Phase B relationship pool:

- derive skill-relative `FOUNDATION`, `EXTENDED`, and `CHALLENGE` coverage;
- normalize representative groups;
- compute pool fingerprints and certifiability;
- enforce the child-eligibility/obscure-word firewall;
- report missing groups/bands as allocation limits; and
- compare target pools with current global banding without current-data writes.

### Phase D2 — Simulation and numerical calibration

Run counterfactual simulations over the real normalized relationship,
evidence, and complexity pools. Calibrate breadth, diversity, transfer,
Stability, recurrence, and progress constants.

All Level numbers in the V1 Maths document remain:

```text
PROPOSED_V1_DEFAULT — OWNER DECISION REQUIRED
```

They do not block Phase B. They are approved or adjusted only after the real
pools can be inspected.

### Phase E — Freeze and implement V1 proficiency Level maths in shadow

After Phase D2 owner approval:

- freeze a versioned requirement profile;
- implement Breadth, Diversity/Complexity, Transfer, and Stability;
- compute sequential Level 1–5 gates and progress explanations;
- run alongside current Slice 5; and
- leave current composer/proficiency consumers unchanged.

### Phase F — Production read-only shadow verification

Run read-only comparison on real Production facts. Report:

- target and current level distributions;
- source-environment contribution;
- multi-skill positive projection;
- causal-negative and unknown attribution;
- specialist/resolver-only relationship visibility;
- duplicate-lineage suppression;
- complexity/group coverage and allocation limitations;
- child-eligibility exclusions;
- recurrence and sparse-authentic-evidence behaviour; and
- sensitivity to every proposed numerical constant.

No learner-facing or write effects.

### Phase G — Child and parent UI

Implement the approved Progression Experience behind a feature gate after the
shadow model and numbers are approved. Keep Word Treasure visibly separate.

### Phase H — Controlled release

Prerequisites:

- approved shadow report and frozen numerical policy;
- complete invariant/regression suite;
- explicit current-consumer cutover decision;
- migration and scheduler authority where applicable;
- explainability and UI QA;
- feature flag and rollback plan; and
- separate deployment authorisation.

Only Phase H may replace current proficiency consumers.

## Phase B acceptance criteria

Phase B is complete only when it returns:

1. source counts by admitted authority type;
2. deduplicated exact pair counts;
3. retained provenance and authority versions for every pair;
4. explicit contrast-only exclusions;
5. blocked/ambiguous relationship reasons;
6. specialist visibility without generic duplication;
7. resolver-derived exact relationships with diagnostic provenance;
8. representative fixtures including `careful`, `playing`, `dishonest`, and
   `hopeful`;
9. proof that no learner evidence, proficiency, composer, UI, reward, schema,
   Production write, or deployment path changed; and
10. an evidence-backed conclusion on whether the no-schema route is
    sufficient.

## Exact Phase B prompt

> Implement Phase B only for Scarlett's Spells / ADLE: create and test a
> server-only, read-only, versioned `CanonicalWordSkillRelationship` read
> authority over existing approved canonical resolver mappings, released
> specialist memberships/content, approved generic support, and explicit
> reviewed associations. Normalize each admitted fact to
> `canonical_word_id + micro_skill_key + relationship role + provenance +
> authority version`; deduplicate exact word/skill pairs while retaining every
> provenance record; enforce exact-pair approval; exclude contrast-only and
> unreviewed/ambiguous facts; and make specialist or resolver authority visible
> without requiring a duplicate generic-support row. Add deterministic unit and
> regression fixtures for `careful`, `playing`, `dishonest`, `hopeful`, a
> specialist-only pair, a resolver-derived pair, duplicate provenance, contrast
> exclusion, unknown identity, inactive skill, and release/review failure.
> Produce an owner-facing read-only reconciliation report with source counts,
> deduplicated pair counts, all provenance, blocked/ambiguous relationships,
> specialist visibility, exact-pair results, and a determination of whether the
> no-schema route is sufficient. Do not change schema, migrations, learner
> evidence, proficiency calculation, scheduler/Review, resolver behaviour,
> composer selection, assignment generation, UI, rewards, learner data,
> Supabase, Production configuration, deployment, or current runtime consumers.
> If a source cannot provide stable identity, review/release state, or version
> lineage through a deterministic adapter, stop and report that exact blocker;
> do not add schema or broaden Phase B.
