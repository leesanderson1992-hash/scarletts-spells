# ADLE Authority Map

## Status

Authority manifest: `ADLE_AUTHORITY_MANIFEST_V1_2026-09-08`

This is the entry point for ADLE policy work. If two documents appear to define
the same rule, the owner in this map and
`docs/architecture/adle-authority-manifest.json` wins. A historical receipt may
prove what is live or what was implemented; it cannot redefine an approved
target.

## If I need to change X, which document do I edit?

| Concern | Owning document | Current/runtime status | Target status | Main dependants |
|---|---|---|---|---|
| micro-skill and ADLE learning-item identity | `docs/contracts/micro-skill-taxonomy-and-assignment-contract.md` | current word-scoped ADLE identity is released | active normative | composer, intake, proficiency |
| individual word graduation and spaced review | `docs/contracts/adle-word-progression-and-review-contract.md` | current Slice 2/R5 policy differs | approved, not implemented | evidence matrix, proficiency maths, product experience |
| final-rung retirement/pre-retirement | `docs/contracts/adle-final-rung-retirement-contract.md` | released v1 behaviour remains evidenced by `docs/implementation/adle-slice-2-review-scheduler-plan.md` | approved target, not implemented | scheduler, Review, evidence-state readers |
| word-to-skill relationships, proficiency meaning, and mixed whole-writing outcomes | `docs/contracts/adle-spelling-proficiency-contract.md` | Phase B/S4 relationships and Phase C/S5 shadow projection exist; no target level model is live | approved; consequential mixed-outcome projection not implemented | maths, evidence matrix, S9, UI |
| proficiency calculations, approved requirements, child eligibility, monitoring, and comparisons | `docs/implementation/adle-proficiency-v1-maths.md` | no target maths is live | approved under `ADLE_PROFICIENCY_REQUIREMENTS_V1_2026_09_08`; not implemented | S11/S12 shadow engine, reports, UI |
| activity/outcome evidence effects | `docs/pedagogy/adle-proficiency-task-evidence-matrix.md` | Slice 4/Review v3 facts remain live | approved, not implemented | evidence projection, instructional explanations |
| evidence identity, lineage, verification, provenance, repeated-error state, and historical activation boundary | `docs/contracts/writing-engine-mastery-and-evidence-contract.md` | active lineage plus S5–S8 shadow/source records | active normative base; whole-writing V1 policies approved and awaiting S9/adapters | all evidence consumers |
| whole-writing snapshot verification | `docs/contracts/writing-engine-mastery-and-evidence-contract.md` | no S9 qualification | `WHOLE_WRITING_VERIFICATION_POLICY_V1_2026_09_08` approved | S9, proficiency, Authentic Use |
| repeated whole-writing error escalation | `docs/contracts/writing-engine-mastery-and-evidence-contract.md` | S6/S7 preserve source and repair; recurrence adapter absent | `WHOLE_WRITING_REMEDIATION_POLICY_V2_2026_09_09` approved | recurrence adapter, S7 intake |
| pre-activation whole-writing effects | `docs/contracts/writing-engine-mastery-and-evidence-contract.md` | shadow history has no consequences | `WHOLE_WRITING_HISTORICAL_EFFECTS_V1_2026_09_08` approved | S9, S11/S12, reward and retirement guards |
| child/parent proficiency presentation | `docs/product/adle-proficiency-progression-experience.md` | complete target surface not live | approved, not implemented | child/parent UI |
| canonical word metadata and curriculum readiness | `docs/contracts/canonical-spelling-word-map-contract.md` | released content authorities | active normative | relationship adapters, composer, complexity |
| resolver and exact canonical mapping | `docs/contracts/parent-recommended-canonical-mapping.md` | released exact mapping authorities | active normative | diagnosis, Phase B relationship adapter |
| daily assignment composition | `docs/contracts/adle-daily-assignment-composer-contract.md` | released composer/snapshot routes | active normative | assignment generation |
| Word Treasure and rewards | `docs/contracts/reward-system-contract.md` | released plus compatibility paths | active normative | reward consumers and UI |
| what is live now | `docs/implementation/adle-current-state-and-release-registry.md` | current operational registry | not target authority | release and audit work |

## Current-runtime and historical evidence

These files are intentionally retained but are not future architecture owners:

- `docs/contracts/adle-daily-assignment-and-evidence-blueprint-contract.md` —
  current Slice 1–5 policy record and historical blueprint;
- `docs/implementation/adle-slice-2-review-scheduler-plan.md` — current
  scheduler and retirement implementation receipt;
- `docs/implementation/adle-review-r5-legacy-scheduler-compatibility.md` —
  current per-word/bundle compatibility evidence;
- `docs/implementation/adle-slice-5-proficiency-engine-plan.md` — current
  proficiency implementation receipt; and
- `docs/implementation/adle-v3-proficiency-authority-audit.md` — dated audit
  evidence.

Use the current-state registry and code to establish live behaviour. Use the
canonical target owner to establish replacement behaviour. Do not blend the
two into a hybrid implementation.

## Recommended reading order

1. this authority map;
2. `docs/contracts/micro-skill-taxonomy-and-assignment-contract.md`;
3. `docs/contracts/adle-word-progression-and-review-contract.md`;
4. `docs/contracts/adle-spelling-proficiency-contract.md`;
5. `docs/pedagogy/adle-proficiency-task-evidence-matrix.md`;
6. `docs/implementation/adle-proficiency-v1-maths.md`;
7. `docs/product/adle-proficiency-progression-experience.md`; and
8. word-map, resolver, evidence-lineage, reward, and current-runtime authorities
   as the task requires.

## Word progression versus micro-skill proficiency

Word progression answers what one word needs next in controlled learning or
spaced review. Micro-skill proficiency derives Breadth,
Diversity/Complexity, Transfer, Stability, and Level 1–5 across governed word
evidence. Word-route changes may affect current Stability; they do not erase
historical proficiency evidence or become the proficiency algorithm.

## Numerical status

The four-dimension architecture, productive-pattern values, breadth function,
relative-band cuts, recurrence limits, equal-active-dimension progress formula,
`CONTEXT_DEPENDENT_CLOSED_SET_V1`, and DOB-based child eligibility are approved
under `ADLE_PROFICIENCY_REQUIREMENTS_V1_2026_09_08`. They are target policy, not
current runtime. S11/S12 must implement them in shadow with evidence trails,
monitoring, and comparisons before any separately approved cohort cutover.

## Next authorised engineering step

S9: implement snapshot-scoped verification, mixed outcomes, activation-cutoff
classification, and shadow qualification as specified in
`docs/implementation/whole-writing-s9-qualified-evidence-specification.md`.
Every consequential consumer remains disabled. The G2 family corpus work and
the separately controlled recurrence-to-S7 adapter follow their approved gates.
Learner-facing proficiency requires S11/S12 shadow reconciliation and explicit
cohort-cutover approval.

## Future policy changes

For any governed ADLE policy:

1. identify the manifest authority owner;
2. change the owning contract only;
3. assign or update a policy version when semantics change;
4. update dependent documents by reference, not duplicated policy text;
5. add or update one decision-log entry; and
6. run `npm run adle:authority-docs-check`.

Do not add the same new policy as an amendment to multiple contracts.
