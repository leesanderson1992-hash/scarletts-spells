# S8 V3 independent ordinary-writing evaluation

This directory is intentionally evidence-empty in the engineering candidate.
Do not generate human holdout prose from analyser rules or copy the S8 closeout
paragraph into this package.

Required continuation:

1. Freeze the exact V3 family release and its source closure.
2. Obtain fresh human-authored passages withheld from rule development.
3. Record one primary focus per family per passage and label every incidental
   governed-family occurrence.
4. Import the identified-human primary labels.
5. Complete the separately attributable non-gold review.
6. Send substantive disagreements to a second identified human.
7. Lock final gold and its fingerprints.
8. Run the exact-release evaluator twice and compare byte-identical reports.
9. Create `PASS_REVIEWABLE_NOT_PUBLISHED` only when every gate in
   `whole-writing-s8-v3-ordinary-writing-coverage.md` passes.

Until then all four V3 release dispositions are `BLOCKED_HUMAN_HOLDOUT_MISSING`.
No file in this directory is suitable for database insertion or activation.

## Current holdout intake

The 10 September 2026 source intake is preserved byte-for-byte under
`source-intake/raw`. `source-manifest.json` records the supplied filenames,
byte lengths and SHA-256 fingerprints. `authorship-resolution.json` records
Katie Sanderson's clarification that the prose is human-authored and that AI
was used only to create non-conflicting identifiers.

`source-intake/occurrence-inventory.jsonl` inventories every governed-family
surface with source-preserving UTF-16 offsets. The first nominal-family
occurrence in each source passage is preselected as that passage's primary
focus; no analyser result is used in this selection. All other occurrences
remain incidental annotated occurrences.

The four files under `human-review/primary-label` are blank primary-label
packets. They are not candidates or gold. Do not run the analyser against this
intake until primary labels, separate non-gold review and required adjudication
are complete and locked.

The four machine-readable files under `dispositions` record the current
`BLOCKED` holdout-evaluation outcome, exact evidence shortages and confirmation
that delivery and every release operation remain disabled. They do not replace
the frozen engineering-candidate artifacts under `release-candidates`.

## Primary-label progress

Katie Sanderson's amended `THERE_THEIR_THEYRE` workbook is preserved
byte-for-byte under `human-review/primary-label/raw`. Its main sheet supplies
472 complete occurrence decisions. Katie separately confirmed that the 52
supplemental passages are independently human-authored without analyser
predictions and that their target classifications and subtypes are her primary
human decisions. The supplement contains 107 governed occurrences: 57
`THERE_THEIR_THEYRE` and 50 incidental `TO_TOO_TWO` occurrences.

The imported primary-label set contains all 529 `THERE_THEIR_THEYRE`
occurrence decisions. All primary coverage quotas are met across 452 approved
primaries. The five neighbouring possessive uses were retained as valid,
non-primary incidental evidence. The 50 incidental `TO_TOO_TWO` occurrences
are now included in that family's completed current-inventory decisions.

Katie Sanderson's completed `THERE_THEIR_THEYRE` non-gold review is preserved
under `human-review/non-gold/completed`. It contains no analyser prediction and
matches every primary decision, so no adjudication is required. The candidate
and final-gold sets are locked, and the exact frozen release was evaluated twice
with byte-identical output. Its governed disposition is `BLOCKED`; all family
delivery and release operations remain disabled.

For `TO_TOO_TWO`, Katie Sanderson has confirmed all 1,209 core decisions and
the 50 TTT-supplement incidentals as her human decisions. The stale AI labeler
metadata is not treated as decision provenance. All current occurrence labels,
construction/subtype quotas and four protected categories are complete. Ten
independently human-authored gerund-primary passages remain required, so
candidate/gold locking and analyser evaluation remain blocked.

Katie Sanderson subsequently supplied all ten human-authored gerund passages
and adopted their populated primary decisions. Those ten gerund primaries now
meet the protected-category quota. One additional `to` in the second passage
is an inventoried non-primary occurrence without an explicit human decision;
the one-row packet under `human-review/primary-label/pending` must be completed
before candidate/gold locking or analyser evaluation.

Katie Sanderson explicitly confirmed that final incidental occurrence as a
valid, supported, non-primary `infinitive/governed_infinitive` use. The complete
1,270-occurrence human workflow and 410-primary coverage ledger are locked.
The exact frozen release was then evaluated twice with byte-identical output
and the governed report was written once. Its disposition is `BLOCKED`; the
report and failed cases are preserved without modifying the exposed candidate,
labels, analyser or evaluator.
