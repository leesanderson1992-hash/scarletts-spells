# S4 staging completion receipt — 6 September 2026

**PASS:** candidate import → explicit pair review → publication → runtime reuse
→ withdrawal → reload → database verification → disposable cleanup.

## Build and environment

- Implementation: `afbb2e4` — Add S4 governed word-skill review and publication workflow.
- Preview: <https://scarletts-spells-staged-p8vljz8f7.vercel.app>
- Deployment: `dpl_CPib8Ag87TNxQLD5fM1fABJQUXDn`, READY; compile and TypeScript passed.
- Supabase staging: `jlhotktspjvffslvuyfz`.
- Additive migration: `20260906140000_add_word_skill_review_workflow.sql`.
- Migration SHA-256: `b64bc098fffae52a0e21e43a964c7ac37ce84cbc49816219b3ebdbca2a3d3cf4`.

The Preview used the isolated `local` authority environment against the staging
database and an allowlist containing only the disposable administrator. Normal
`staging` and `production` publication controls stayed off. No learner evidence
controls were enabled. No production deployment or database mutation occurred.
The clean deployment worktree excluded all uncommitted Context Resolver and
authority proposals; their original hashes remained unchanged.

## Executed proof

The browser imported two exact candidate pairs. The first duplicated an existing
governed `wash` association; the second was an explicitly rejected test candidate,
not a curriculum assertion. Both were initially awaiting human review. Recording
one approval and one rejection created an immutable review without publishing.
The separate publication action created exactly one authoritative pair.

Publication survived reload. The real published-association loader and Phase B
reader returned 44 effective pairs, with one reviewed-source contribution to an
already-governed pair. The rejected pair was absent. The normal staging authority
environment read zero test associations. This proves reuse and deduplication
without expanding the effective word–skill set.

The admin withdrawal action changed the release to Withdrawn, retained its review
and pair records, and survived reload. The actual runtime loader returned the
withdrawn association as inactive. The final database verifier confirmed:

- two original candidates and the exact `approved`, `rejected` decisions;
- the authenticated reviewer's identity and one published pair;
- the immutable withdrawal receipt;
- unchanged counts in learning items, both reward ledgers, Authentic Use events,
  review schedules and writing source snapshots.

Final verified package: `399cc05f-d26b-47a2-a647-1a46a5b007c4`.
Final verified release: `409c0588-201a-4f30-8ff0-d9c41d26ac26`.
Both identifiers refer to disposable records removed during cleanup.

An earlier pass encountered a Supabase API-key transport error before its final
database verifier, and cleanup completed before verification. That pass was not
accepted as the completion proof. A fresh package repeated the full browser and
runtime flow on the same build, and its database verifier passed before cleanup.

## Cleanup and limits

Cleanup disabled the isolated controls, removed only the exact disposable
package/review/publication/withdrawal lineage and deleted the disposable account.
The verifier confirmed no fixture package, release or pair remained, all three
environments' S4 controls were off, and protected counts matched the baseline.
Private fixture credentials and the downloaded Preview environment were removed.
The additive migration remains in staging; no genuine authority history was
deleted or rewritten.

Proof tooling: `scripts/word-skill-review-staging-proof.mjs`, with the staging CLI
path supplied through `WRITING_PROOF_SUPABASE_CLI`. `verify-runtime` and `verify`
use `node --import tsx --conditions=react-server` to load the real server readers.
The workflow implementation and 35 local database checks are described in the
[S4 implementation receipt](whole-writing-s4-review-workflow.md).

This completes the S4 review/publication implementation and disposable staging
gate. Real knowledge releases still require exact-pair human approval and
explicit operational activation. G1–G5 learning-policy gates remain unchanged.
No qualification, remediation, Gold Bar, proficiency or retirement integration
is enabled by S4.

**Next main stage: S5 — longitudinal whole-writing micro-skill evidence in
shadow.** E1 mass enrichment can proceed alongside it through this review path.
