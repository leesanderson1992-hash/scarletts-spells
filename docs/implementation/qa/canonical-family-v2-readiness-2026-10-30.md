# Canonical family identity and V2 breadth — 30 October 2026

## Authority

The existing `canonical_teaching_dictionary_base_family_registry` is the shared family identity. Its aliases retain links to approved lexical revisions and older ADLE Base Word Lab records. Lexical records remain the source for reviewed morphology and meaning; ADLE records remain the source for lesson content and assignment eligibility. Historical IDs and learner evidence must not be rewritten.

V2 previously read the older family-member table without checking the parent family status. In the read-only Production audit, all 225 words with approved active legacy member rows had more than one legacy family ID, because superseded parents retained active historical members. The canonical registry has 1,173 words with membership and 13 words in more than one canonical family. Multiple canonical families may be legitimate for compounds and words with two roots.

The V2 loader now reads canonical membership and family decisions. A single owner-reviewed family gives one breadth key, regardless of historical aliases. For a word with multiple families, an active, approved ADLE family for the assessed micro-skill may select the applicable root. Otherwise the group remains unresolved. Interpreted decisions do not certify a family breadth group. The group authority fingerprint includes decision statuses and skill-specific family selection.

## Consumer boundary

Dictionary family summaries already prefer the canonical registry. Weak-vowel lesson loaders and prefill check canonical aliases while retaining the approved ADLE lesson package. Lexical family loaders use the latest approved linguistic revision; ADLE lesson loaders use their approved teaching records. Those source reads are intentional and must keep their source IDs for lineage. The admin family search still presents lexical and lesson records as separate selectable source records; its UI must identify their shared canonical family before presenting them as one teaching family.

## Verification and release status

- V2 calculator regression covers duplicate historical aliases, a genuine two-root word, skill-specific root selection and an interpreted decision.
- TypeScript, targeted lint, V2 regression and Next production build passed locally.
- The initial learner-level comparison failed because `.env.local` points at the local Supabase API while the database query used Production. A temporary Production API environment was obtained separately, without changing local configuration. The post-confirmation read-only Scarlett comparison at `asOf=2026-10-30` completed for 297 active skills; detailed differences are below. The parent view has not been changed in Production.
- The 96 active D4 Base Words family keys all have registry aliases. The owner subsequently confirmed the 86 provisional mappings without exceptions. A guarded Production migration promoted precisely those 86 records; independent readback shows 931 `owner_reviewed` and zero `owner_decision_interpreted` registry families. See `canonical-family-confirmation-receipt.json` in the preparation output folder.

The 86 decisions comprised 85 `strong_match` rows aligned to a value in the next row of the owner-edited CSV, plus the explicit `angle` choice. The final `write` value is in the owner file's final key-only row. The Production confirmation is bound to the original package and decision-file hashes.

After confirmation, the read-only comparison at 2026-10-30 had 31 changed level or status results across 297 skills: 20 increases, 4 decreases, 5 level/null transitions, 2 status-only changes and 266 unchanged results. The four lower numeric results were `D4_PAT_SPLIT_DIGRAPHS_O_E` (3→2), `D4_PG_SHORT_OO_OO` (5→4), `D4_PG_SHORT_OO_OULD` (5→3), and `D4_IRRE_TRICKY_WORDS_COMPLEX_HIGH_FREQUENCY` (5→4). Their observed accuracy generally remained strong; the canonical pool changed the applicable breadth target or removed an unresolved group. `D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED` changed from Level 1 to unresolved because Production has no approved compound facts for that skill; the old Level 1 rested on an unresolved family group. The existing approved compound facts for closed compounds now derive component-pair breadth groups, so related derivatives cannot add extra breadth. A final review of source references and gate trails is required before parent release.

The restricted comparison receipt is `../outputs/schwa-cluster-bulk-readiness-2026-10-29/scarlett-v2-canonical-family-comparison-2026-10-30.json` (SHA-256 `643043eb5957f186b85f06522775fec35e43eaef0e5e3bd45842526ef376e3a4`). It contains all 31 changed gate trails, reason codes, source-event references and input fingerprints, without raw writing. In the `o-e` case, `homework` remains a valid positive performance but shares `home`'s breadth family; three distinct families fall short of Level 3's four-family gate. For `short oo`, `ould`, and complex high-frequency irregular words, the revised Level 5 breadth targets are six, six, and six families respectively; Scarlett has four, three, and five observed groups. These are breadth gaps, not accuracy failures.

The registry decision migration is applied in Production. The application code is not deployed. Before parent release, inspect the changed gate trails and the missing separated/hyphenated compound facts, verify the parent flag rollback, and complete the exact Production release checks. No Production learner data or word-mastery records were changed in this work.
