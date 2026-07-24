# ADLE shared-route readiness review packet v1

Status: **approved for guarded staging review on 2026-07-23; not production
content and not a production import authority.**

This packet supplies the two deliberately route-specific analyses required by
the `really` / `helpful` staging proof. It does not change the existing,
human-reviewed analyses for `really` preserve-base or `helpful` identify-base.

## Proposed teaching routes

| Canonical word | Micro-skill | Teaching objective | Child-facing explanation |
| --- | --- | --- | --- |
| `really` | `D4_MOR_BASE_WORDS_IDENTIFY_BASE` | Find the complete base word `real` before adding `-ly`. | In `really`, find `real` first. Keep the whole base in mind, then add the ending. |
| `helpful` | `D4_MOR_BASE_WORDS_PRESERVE_BASE` | Preserve the complete base word `help` before adding `-ful`. | In `helpful`, spell `help` first. Keep every letter of `help`, then add `ful`. |

## Required reviewed lesson support

The staging importer must additionally verify active canonical dictionary rows
and reviewed family/member records for these exact words before it writes any
candidate, mapping, or learning item:

| Route | Authentic target | Related transfer pool |
| --- | --- | --- |
| Preserve base | `really`, `helpful` | `real`, `realism`, `help`, `helper` |
| Identify base | `really`, `helpful` | `real`, `realism`, `help`, `helper` |

The importer fails closed if a word is absent, ambiguous, not
assignment-approved, lacks contextual dictation support, or cannot supply a
reviewed two-family/four-transfer selection. It does not invent a replacement
word.

## Approval record

The Scarlett Spells product owner approved the wording in the Codex review
conversation on 2026-07-23. That approval is limited to this exact packet and
the guarded staging proof. It does not activate runtime content, authorise a
production import, or change the 1,000-word review batch.

## Staging sign-off declaration

Before guarded staging import, the operator must record the product-owner
approval reference, current UTC timestamp, and this packet's SHA-256 in the
non-sensitive staging receipt. The proof command verifies those values before
it writes any candidate or mapping.

The receipt must include:

- reviewer name and UTC timestamp;
- confirmation that both analyses are linguistically and pedagogically
  appropriate for the stated routes;
- confirmation that the two transfer pools are appropriate and do not imply a
  false invariant; and
- the immutable review packet SHA-256 supplied to the proof command.

No script or environment variable is a substitute for the recorded approval.
The proof command deliberately rejects a missing approval reference or packet
digest.
