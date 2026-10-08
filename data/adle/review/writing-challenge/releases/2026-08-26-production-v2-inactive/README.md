# Production release receipt — approved v2 prompts, inactive

**Released and independently verified on 26 August 2026. Review v3 remains inactive.**

| Release fact | Verified result |
| --- | --- |
| Production project | `wwohrqtunajrbwxyssjf` |
| Release reference | `adle-review-writing-challenge-2026-08-26-v2` |
| Approved content inserted | 98 rows |
| Reflection / Silly Stories / FU / Persuasion / Conundrums | 8 / 10 / 8 / 10 / 62 |
| Stored approval | `review_status = approved` |
| Stored inactive state | `row_status = archived` |
| Selectable approved/active prompts | 0 before; 0 after |
| Review learner rollout rows | 0 before; 0 after |
| Active Review learner rollouts | 0 before; 0 after |
| Protected learner/review/scheduler/activation tables | 20, all counts and digests unchanged |
| Committed transaction | `186763` |
| Pre-commit verification time | `2026-08-26 06:51:31.879316+00` |
| Independent post-commit readback | All 98 rows match exactly |

The user explicitly requested **v2**, so the later v3 Water addition was not released.
There were no pre-existing prompt rows, no conflicts and no updates or deletes.
No schema, scheduler, learner, activation, environment or deployment changes were made.

## Exact content commit reference

This Production content release is now bound to the exact reviewed content commit
**`7e530e0311973a56a3a8a7961f1686b7d02ee608`**, on branch
`codex/review-teaching-content`.

The commit contains only the 12 approved v2 package files, including the README,
sign-off sources and signed CSV. Scripts, v1/v3 packages and operational receipts
are excluded. The commit has not been pushed.

This is a **retrospective provenance binding**, not a new release or a claim that
the original release ran from this commit. The original apply receipt retains its
execution HEAD, `1f4e687157ab767faa88417e68b0953828f577e0`, and transaction
`186763` unchanged. The [commit binding](content-commit-binding.json) records the
new commit, exact file hashes, package and content fingerprints, all 98 per-prompt
fingerprints, and hashes of both the original and fresh verification receipts.

The [fresh read-only Production verification](verify-1787728630691.json), observed
at `2026-08-26 07:17:10.672996+00`, ran with the new commit as HEAD. Every committed
package file matches the validated working copy byte-for-byte; the import and
manifest hashes match the original release. All 98 Production rows and their IDs,
versions, fingerprints and archived statuses still match the original release.
There are **zero selectable prompts, zero rollout rows and zero active Review v3
rollouts**. No content was re-imported and no activation or database mutation was
performed by this follow-up.

The 20 protected tables were unchanged during this read-only verification. Across
the interval since the original release, `daily_assignments` has a different
snapshot; that intervening change has not been investigated or attributed. The
prompt-table digest, schema fingerprint and inactive rollout state are unchanged.

The v2 deterministic check, 16 content regression groups, six release-safety
regression groups and TypeScript no-emit check all passed again. Original CSV
line endings and intentional Markdown line breaks were preserved. These checks
do not grant activation readiness or independently certify video playback.

This addendum and the operational evidence remain outside the content-only commit.

## Governance and inactive mapping

The approved source payload is unchanged. Its SHA-256 is
`9b53410602db3facb5addc3cf44486d815f323617de56bc8c27f22c9d4f525a6`;
the v2 manifest SHA-256 is
`8baac80c2d3498a4dc4b90ad82a82d1f0ef764c86714e2cb356b5e629eed71d3`.

The existing schema allows `active`, `superseded` and `archived`, but not `inactive`.
This release maps the user's inactive requirement to **approved/archived**. That
keeps every row outside the loader's approved/active selection predicate while
preserving approval, stable keys, content versions, introductions, questions, tips,
video provenance and all source fingerprints. The operational payload fingerprint
in the receipt separately records the archived status projection.

The original v2 sign-off manifest describes its pre-release state and remains
immutable evidence. **This production receipt is the later operational state.**
Content sign-off and the user's subsequent production release authorisation are
separate records; neither grants Review activation authority.

## Evidence

- [User release authorisation](authorisation.json)
- [Read-only production plan](plan-1787727043585.json)
- [Successful production rehearsal and verified rollback](rehearse-1787727075971.json)
- [Committed release and independent fresh-connection verification](apply-1787727092828.json)
- [Immediate commit receipt](commit-186763.json)

The full release receipt contains generated row IDs and fingerprints, project and
package pins, runner fingerprint, transaction identity, before/after protected-table
digests and a second connection's readback. It contains no credentials or raw
learner spelling evidence. An additional standalone `verify-*.json` read-only receipt
is retained in this directory.

## Verification and rollback boundaries

Six focused publisher regression groups passed, covering production pinning,
archived mapping, idempotent reuse, content/status conflict refusal, video-alias
refusal, stale-plan rejection, transaction rollback and protected-state drift.
The existing 16 content regression groups also passed before release.

Before commit, a real production transaction inserted and read back the 98 exact
archived rows, then rolled back. A separate connection confirmed restoration of
the exact empty baseline. The subsequent commit used that same baseline hash,
locked the prompt and protected tables, inserted only missing rows, and verified
content and protected state before committing. A fresh connection then verified
the committed result. No test fixtures were left in Production.

The runner has no update, delete, schema-migration or activation path. It rejects
any existing v2 row whose content or status differs. Replays reuse identical
approved/archived rows without rewriting them. Further activation or operational
changes require a separate explicit request and the existing Review rollout gates.

The safe read-only follow-up is:

```sh
node scripts/adle-review-prompt-v2-production-release.mjs verify --environment production
```

Use the existing authorised Production connection environment privately; never
paste connection strings or credentials into commands, receipts or task messages.
