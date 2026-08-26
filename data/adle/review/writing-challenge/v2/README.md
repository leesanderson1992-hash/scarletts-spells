# ADLE Writing Challenge — signed-off content v2

**Production update:** v2's 98 rows have subsequently been released as
approved/archived inactive content. Review v3 was not activated. See the
[production release receipt](../releases/2026-08-26-production-v2-inactive/README.md).
The original sign-off documentation below describes the pre-release package;
its source data, manifest and hashes remain unchanged as historical evidence.

**Original handoff: content signed off by the user on 26 August 2026; not yet imported at that stage.**

This version supersedes the v1 review handoff. The v1 data package remains unchanged
for comparison. The user's amended CSV is retained byte-for-byte in
`writing-prompts.signed-off.csv`; the supplied file itself has not been edited.

## Approval and amendments

The approval authority is the user's explicit message:

> These have all been reviewed and signed off. I have made amendments to writing
> prompts but conundrums are great as they are.

The blank review fields and old “Pending approval” values inside the CSV are
historical source data; they do not override this message. Instructions within
the prompt cells remain learner-facing teaching content, not requests for Codex
to carry out. No database-write or rollout authority is inferred from content sign-off.

- All **36 writing prompts** are approved with the exact CSV text.
- All **10 Persuasion introductions** now include the specified letter-writing
  audience or format, stored as per-prompt instruction overrides. They do not
  overwrite one shared introduction for all Persuasion prompts.
- `PERSUADE-03` is now **Every Home Needs a Pet**, asking whether every home should
  have an animal that children help to look after; the exact signed wording uses “kids”.
- The other **26 writing prompts** are unchanged. All stable keys remain intact.
- Sign-off for **63 unchanged Conundrum candidates** is recorded as user-attested.
  No independent video watching, playback or embed test by Codex is claimed.

No spelling, grammar, punctuation or whitespace clean-ups have been made after
sign-off. In particular, the supplied “Minster of Education” in `PERSUADE-08` and
punctuation in the letter starters are retained. Any later copy-edit must be approved
as a new governed version rather than silently changing this signed text.

## Import package

[adle_review_prompt_versions.import.json](adle_review_prompt_versions.import.json)
contains **98 content-approved rows**:

| Category | Rows |
| --- | ---: |
| Reflection — Stoic Journal | 8 |
| Silly Stories | 10 |
| Fortunately / Unfortunately | 8 |
| Persuasion | 10 |
| Conundrums | 62 |

Rows use `content_version = v2`, `review_status = approved` and `row_status = active`.
These are intended import values, **not a statement that the rows exist in a database
or are available to learners**. No import was performed. Never run this import as
part of an automatic build. Reconcile historical prompt/video identities and version
conflicts before an explicitly authorised population step; do not overwrite an
existing approved version or reset learner-once history.

Titles, Top Tips, instruction references, structured FU configuration and video
configuration use the existing `configuration` column. Every Conundrum includes
the canonical video ID, watch URL, embed URL, official title, Astra Nova School
source and an interactive YouTube embed declaration. This configuration still needs
the shared UI integration described below; no new React activity types were added.

### One unresolved content row: Water

`CONUNDRUM-YXMchZeXnXw` is excluded from the import. Its supplied question is:

> Question not recoverable from the indexed YouTube description in this research session.

That is research metadata, not a learner question. The user's set-level approval is
recorded, but no question has been invented or silently substituted. The exact
learner-facing question is still needed. The video identity and approval register
entry remain present so it can be completed without losing provenance.

Robot's partial-description fidelity flag, and all other catalogue fidelity flags,
remain in provenance. Their signed-off question text is unchanged. The approval
register separates earlier review-queue warnings from the current content decision.

## Files and evidence

- [Governed prompt records](governed-prompts.json): common content contract and approval attribution.
- [Instructions](instructions.json): five shared category instructions plus ten Persuasion overrides.
- [Amendments](amendments.json): exact before/after changes for ten stable keys.
- [Approval receipt](approval.source.json): user statement, source hashes and explicit scope limits.
- [Conundrum approval register](conundrum-approval-register.json): all 63 signed-off candidates; Water is not import-eligible.
- [Manifest](manifest.json): source/output hashes and release metadata.
- [Validation report](validation-report.json): counts, local state and outstanding release checks.

Approval reference: `user-review-content-signoff-2026-08-26-v2`  
Release reference: `adle-review-writing-challenge-2026-08-26-v2`  
Signed CSV SHA-256: `7ad001a1eb721badaedd1d98736a2732c84d60ea40d1c39f27a58ec746fecb97`

The receipt binds the exact amended CSV, parsed source rows, previous governed
records and unchanged Conundrum queue. Builds reject source drift rather than
reusing this approval for altered wording. Each import fingerprint covers its exact
content, instruction, configuration, provenance and approval reference.

## Remaining release checks

Content approval is now recorded; it is not an outstanding approval request for
the 98 populated rows. The following are separate technical/release requirements:

1. Obtain the Water question before adding that row. The other 98 do not depend on it.
2. Check video availability, embedding, official identity and any historical aliases.
3. Wire the existing shared Review UI to render titles, Top Tips, paragraph breaks
   and actual interactive YouTube players from the governed configuration.
4. Check all visible and accessible task text, labels and video text against each
   day's Target Words. Exclude collisions; never rewrite a prompt to contain or
   reveal a Target Word. The packet contains no daily Target Word list, so this
   cannot be certified by content sign-off alone.
5. Check actual unused capacity for the authorised learner scope and Reflection
   LRU/no immediate repeats after all eligibility exclusions. The packet meets the
   raw 5/2/5/5/5 inventory minimums, but live learner history has not been queried.
6. Complete staging verification and the existing release/activation gates before
   production use. No deploy or rollout receipt was created here.

All original product rules remain: audio-only Target Words, at most ten, one shared
Review engine, learner-once ordinary content, reusable Reflection LRU, per-word
retrieval evidence for review outcomes, governed Word Reflection & Repair for
incorrect Target Words, and 10/10 as an achievement rather than completion authority.

## Reproduce and validate

From the repository root:

```sh
node scripts/build-adle-review-teaching-content.mjs --check
node scripts/build-adle-review-approved-content.mjs --check
node scripts/adle-review-teaching-content-regression.mjs
```

The approved builder's `--write` option reproduces v2 files only. None of these
commands connects to a database, rewrites the supplied CSV, approves changed source
text, or activates learners.

### Verification performed

- V1 and V2 deterministic rebuild checks: passed.
- Thirteen content regression groups: passed, including exact amendments,
  per-prompt instruction references, schema columns, immutable approval scope,
  canonical video identity, Water exclusion and separation from activation.
- Independent CSV parse comparison: all 36 signed rows match the generated
  title, introduction, question and Top Tip exactly; the original file is unchanged.
- TypeScript `tsc --noEmit --incremental false`: passed.

These local results do not claim a live import, video playback or browser proof.
