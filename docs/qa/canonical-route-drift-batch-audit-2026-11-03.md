# Canonical route drift batch audit — 2026-11-03

This is a read-only Production snapshot after the reviewed 14-word Overview import and the -able/-ible pilot membership release. It checks native route readiness, not merely the presence of publication rows.

## Weak-vowel publications

`npx tsx scripts/audit-canonical-weak-vowel-drift.mts production` classified the latest publication for each of 440 word–skill pairs:

| Category | Pairs | Action |
| --- | ---: | --- |
| Current shared facts and route content | 408 | No change |
| Only the dictionary fingerprint changed | 31 | Revalidate and refresh as a governed batch against the current approved Overview; keep route-only teaching choices and audio unchanged |
| Meaning conflict | 1 | Editorial review of `answer` before any refresh |

All 11 weak-vowel pairs assigned to the 14-word pilot were in the fingerprint-only category. For each, the published meaning, route source fingerprint, and word/sentence audio hashes still matched. Native `loadRouteWordStatuses` blocked them with `published_content_or_dictionary_source_changed` because the publication fingerprint predated the Overview update.

The governed 11-pair refresh passed a Production transaction rollback proof, then applied with the exact reviewed CSV SHA-256 and owner-reviewed written-fact workbook. It staged new immutable route versions, reviewed and published them against current Overview facts, and checked protected learner-state counts in the transaction. The post-apply native check reports all 11 pilot pairs as administrative candidates with zero blockers. The full publication audit moved from **408 current / 31 fingerprint-only drift / 1 meaning conflict** to **419 current / 20 fingerprint-only drift / 1 meaning conflict**. The 20 remaining drifts and the `answer` meaning conflict were not changed.

## Base Word route

After `vercel env pull .tmp/canonical-pilot-production.env --environment=production --yes`, `NODE_OPTIONS=--conditions=react-server npx tsx scripts/verify-canonical-pilot-routes-live.mts` checked the Production native preflight. The temporary environment file stays outside Git. The Base Word route has 556 entries and is released and activated, but its compiler preflight is blocked. The route-wide issue counts are:

| Issue | Count |
| --- | ---: |
| Source draft payload is malformed | 61 |
| Editorial sign-off missing or stale | 201 |
| Source draft predates approved dictionary morphology | 200 |
| Reviewed family has no complete compiler-valid selection | 3 |

These are issue counts, so a word can appear in more than one category. Of seven pilot words assigned the Base Word skill, all have an approved word–skill relationship and an authorized lexical family. Six have no reviewed route content in the current lesson; `enjoyable` has reviewed content with complete technical facts, but the route-wide compiler block still prevents it being an administrative candidate. Family authorization alone does not provide an ADLE Base Word lesson selection.

## Batch repair boundary

1. Refresh fingerprint-only weak-vowel pairs through a new immutable reviewed route version and publication. The 11 reviewed pilot pairs are complete. The other 20 need their own reviewed change provenance before approval.
2. Build current Base Word route candidates from canonical Overview and the chosen approved family. Reuse route-only teaching choices only where their source is exact and still valid. Group malformed drafts, stale editorial reviews, and stale morphology by their source pattern; send ambiguous content to human review in one sheet.
3. Run the native preflight and compiler on the whole release candidate, then verify the 14-word pilot at the word level. Do not infer readiness from historical member rows or release status alone.

The full-dictionary conversion remains open. The 14-word file is a pilot, not a reviewed replacement for all active entries.
