# Dynamic Affix `-al` Production completion audit

Audited on 2026-08-08 after a genuine learner completed the normal Dynamic
Affix V3 `D4_MOR_SUFFIXES_AL` assignment. The learner and parent reported no
complaints.

## Route and completion

- assignment: `4ee5f1e2-985b-4da2-8c5b-acdc2fe0dd1e`;
- normal generation source: `adle_composer_v1` / `parent_manual`;
- persisted route and recipe: `dynamic_affix_word_lab:v3`;
- payload: `dynamic_affix_lesson_v3`, version `3`;
- profile: `D4_MOR_SUFFIXES_AL`;
- assignment and all 16 items: `completed`;
- one Reflection record was persisted.

The four lesson words retained the intended three-authentic / one-transfer
shape: the three authentic bindings carry Test 2's existing ADLE learning-item
references; the transfer binding has none. This confirms normal composition,
not a manual assignment insert.

## Interaction and outcome audit

- 6 guided-practice events;
- 4 correct Dictation events;
- 4 production spelling events: 3 correct and 1 incorrect;
- 4 taught-history rows, including the transfer word as required by the
  all-word teaching/evidence contract;
- 3 authentic review schedules and no transfer schedule;
- 3 authentic `entered_forge` reward events;
- no duplicate active Dynamic Affix learning items;

The completed lesson is compatible with the corrected canonical-intake route
identity. All 29 Test 2 approved suffix candidates are now activated as
`dynamic_affix_word_lab:v3`; their parent approvals and original lineage remain
unchanged.

## Release state

Production deployment `dpl_C7g2wGXiQJw2JHktR3HXmYxFNvBb` is Ready. The
canonical-intake persistence correction is migration
`20260808093000_fix_dynamic_affix_canonical_intake_persistence`; it validates
the exact reviewed suffix profile member before persisting the V3 route. The
governed mapping correction superseded the old hidden `confushon → confusion`
SION-syllable authority and published the reviewed
`D4_MOR_SUFFIXES_SION` authority.

Status: accepted natural Production completion; no learner complaint reported.
