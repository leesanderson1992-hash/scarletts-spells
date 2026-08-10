# Base Word family meanings v1

This package republishes the approved Base Word family graph as a new,
append-only Teaching Dictionary release. It corrects the historical Production
batch's omission of all 227 reviewed `child_friendly_meaning` values. It does
not mutate or supersede that old batch.

## Semantic boundary

`child_friendly_meaning` is the reviewed teaching gloss for the displayed
canonical word. Some glosses make transparent morphology explicit (for
example, “played again” or “not happy”), but the reviewed data does not show
different meanings for the same canonical word in different families. The two
words that appear in two families, `photograph` and `photography`, retain the
same gloss in each membership.

The current Base Word runtime contract embeds that gloss in the immutable
family-member semantic projection, so this release preserves it there. This
does not claim that family membership owns a separate canonical dictionary
definition. A future normalized word-sense/teaching-gloss authority would be a
separate architecture change and is not required to publish this reviewed
projection safely.

The package source manifests bind canonical `word_key` values. The guarded
Production publisher resolves those keys to exact active, approved canonical
word IDs and freezes the resolved IDs in the immutable family authorities.
This avoids assuming that every canonical identity was created by the original
deterministic UUID importer. Legacy family-row dictation text is not treated as
family semantics: the publisher links the new compatibility rows to the
existing shared, reviewed Teaching Dictionary dictation records. A later Base
Word route release must still bind its own immutable Teaching Dictionary
closure.

## Reviewed authority

- Authoritative source commit:
  `e4219122b7e68f37a47af6fa4152e65d19083cd3`
- Meaning-pair review SHA-256:
  `acdc53a6c5f8aa3cbb73908539d7dd0020307dcd948fc7b7791b676872b09221`
- Reviewer: Katie Sanderson
- Reviewed at: `2026-07-24T15:53:22+01:00`
- Population: 87 families / 227 members / zero unresolved meanings
- Roles: 119 `authentic_target`, 87 `base`, 21 `transfer`

`audit/family-meaning-audit.csv` is a human-readable derivative. It is not a
new source of truth. The reviewed source CSV, generator revision, review
receipt and immutable package manifest remain authoritative.

## Governed publication

The release CLI supports `validate`, read-only `plan`, narrowly scoped
`migrate`, mutating `release`, and read-only `verify`. Both mutations require
exact confirmation tokens; publication additionally requires an immediately
preceding plan SHA, a clean worktree at exact `origin/main`, the reviewed
migration, serializable locking, the restricted Teaching Dictionary release
role, and unchanged protected learner/assignment/activation snapshots.

Publication may add the two immutable Base Word family-membership authorities.
It must not create a Base Word route release, operational activation, learner
gate, learning item or assignment. The release therefore remains
Production-dark and cannot expose a child by itself.
