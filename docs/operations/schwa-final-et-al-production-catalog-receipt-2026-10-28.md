# Final -et and -al catalog cutover — 28 October 2026

The owner authorised deassigning the old natural/actual skill and moving its
resolver mappings to No Matching Skill. The exact bounded operation was run
against Production using `scripts/retire-natural-actual-for-final-al.mjs --apply`.
It used the existing governed activation, bulk review, resolver reopen and
No Matching Skill functions inside one serializable transaction. The actor was
the single existing admin identity recorded on these mapping events.

Preflight found nine active, visible old-skill mappings with nine confirmed
resolver items, 11 published old-skill words, zero old-skill learning items,
an enabled old route head, enabled review controls and no catalog rows for the
new keys. The new forward migration version `20261028120000` was absent from
the Production migration ledger.

Independent readback after commit found:

- `D4_SCHWA_FINAL_ET` and `D4_SCHWA_FINAL_AL` active, assignable and nested
  under `D4_SCHWA_FINAL`; both appear in the bulk-assign catalog query.
- `D4_SCHWA_MEDIAL_NATURAL_ACTUAL` inactive and unassignable, with its route
  head paused.
- Zero active or visible old-skill resolver mappings.
- Nine open No Matching Skill cases with detached resolver items.
- Eleven current deassign decisions for the old skill's published words.

This was a bounded Production data patch, not application deployment or lesson
activation. The migration ledger was not edited by hand. The forward migration
remains unapplied; its catalog upsert is repeatable, and its route publication
function changes still need the normal migration gate. New word assignments
and reviewed route content are separate steps.
