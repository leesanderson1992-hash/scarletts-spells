# E1 staging completion receipt — 6 September 2026

**PASS:** observed inventory → deterministic generation → exact-pair review →
separate publication → runtime reuse → occurrence-only retrospective replay →
automatic withdrawal replay → metrics → reload/retry → cleanup.

## Build and staging

- Final implementation commit: `e9548df`.
- Preview: <https://scarletts-spells-b4bsq0u91-leesanderson1992-hashs-projects.vercel.app>.
- Deployment: `dpl_FazeMBMtzfVrFAQnNFkCjJHmJCSo`, READY.
- Supabase staging: `jlhotktspjvffslvuyfz`.
- Operations migration: `20260906160000_add_writing_enrichment_operations.sql`,
  SHA-256 `f3141aa2594a40792995187fbe61f4f8a2886eabed09c8ea72978d9c7d7b952f`.
- Published-metric correction: `20260906170000_fix_writing_enrichment_published_metrics.sql`,
  SHA-256 `1383e9f436c56b060d1572b9a25bfe76de736e941cc0470998b9131cdf054597`.
- Blocked-gap key compatibility: `20260906180000_allow_unknown_enrichment_gap_skill_keys.sql`,
  SHA-256 `f3a8e310dc1485333f623218ba42e61d0f891474f8cb34f9b2cc913e54755a6a`.

The final Preview compiled and passed TypeScript. Vercel SSO protection did not
admit the disposable automation account, so the browser exercised the same final
commit through a local Next.js server connected to the staging Supabase project.
The Preview deployment and staging-backed browser proof were both completed after
the last defect commit. No Production deployment, database or authority was used.

Staging already contained S5. The migration verifier hashed
`persist_writing_shadow_result` before and after E1 and confirmed that E1 did not
replace it. E1 scope triggers composed with S5's evidence writer, and the shared
current-evidence view uses authority sequence per occurrence.

## Executed proof

The disposable cohort created one captured writing snapshot containing two
occurrences of each candidate word plus an unaffected governed word. The live
inventory selected two active canonical relationship gaps with counts of two and
excluded the already-covered word. It persisted exact private membership while
the routine report remained aggregate.

Staging had **zero approved deterministic source rows for uncovered active
words**. That is recorded as an operational source-approval decision, not filled
with a genuine curriculum claim. The proof used two original synthetic,
disposable morphology-source assertions for one coherent batch. Generation also
suppressed an already-governed exact pair and recorded zero AI calls, tokens and
cost.

The browser showed both exact pairs as awaiting review with successful Phase B
previews. A human-style action approved `friday` →
`D4_HOM_CONTENT_WORD_HOMOPHONES_COMMON_VERB_NOUN_PAIRS`, rejected the `sign`
control with a required reason, recorded 45 seconds of curator time, and then
published the approved subset through the separate control.

Publication created one authority event and a scoped run for the two affected
occurrences. The real worker reused the active dictionary and Phase B readers,
preserved occurrence IDs and original source time, and appended new shadow
interpretations. The new relationship became effective. Earlier interpretations
remained current for the three unaffected occurrences in the same snapshot.

Withdrawal through the browser created a distinct authority event automatically.
The real worker appended another interpretation for both affected occurrences;
the temporary relationship was absent afterward. Reload displayed `Withdrawn`.
A second recovery pass claimed zero work and created no duplicate authority event.

The aggregate staging verifier reconciled:

- two generated and packaged candidates;
- one approval, one rejection and one published exact pair;
- 50% approval yield for the synthetic deterministic group;
- one stored rejection reason and 45 curator seconds;
- two relationship resolutions after publication and two relationship removals
  after withdrawal;
- zero canonical identity resolutions and zero AI usage.

Counts in learning items, both reward ledgers, Authentic Use events, review
schedules and canonical intake events were unchanged.

## Cleanup

Verification completed before cleanup. The script removed only the disposable
inventory, occurrence membership, attempts, package, review, publication,
withdrawal, event, replay and account lineage. Package
`57795221-a890-4f39-8717-6f4bc7f35592`, release
`12623e3d-89d3-483a-a2a4-7d6504e56672` and inventory run
`e612567d-c613-44f4-8efb-6e40fe75a148` no longer exist.

All E1, S4 and whole-writing controls used by the disposable cohort are off; the
cohort, source snapshot, occurrences, shadow projections and account cascaded
away. Protected counts returned to baseline and the verifier found zero fixture
residue. The additive staging migrations and genuine immutable authority/evidence
history remain.

This completes E1 implementation and its disposable staging gate. A genuine
pilot remains blocked until an existing source approval covers an uncovered word,
or the owner approves a new external source/version/use. AI remains disabled.
G1–G5 and S5 ownership are unchanged.
