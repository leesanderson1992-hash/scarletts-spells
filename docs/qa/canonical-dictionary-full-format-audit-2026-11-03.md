# Active Teaching Dictionary format audit

Read-only Production audit after the 14-word pilot, 2026-11-03:
`npx tsx scripts/audit-canonical-dictionary-format.ts production`.

| Measure | Count |
| --- | ---: |
| Active approved words | 2,495 |
| Active morphology records | 2,495 |
| Exact canonical morphology | 23 |
| Words with at least one review issue | 2,473 |
| Legacy part aliases | 955 |
| Missing reviewed part fact | 1,086 |
| Invalid part/join count | 262 |
| Family-linked immutable morphology needing review | 169 |
| Missing written syllable breakdown | 151 |
| Noncanonical band value | 18 |
| Latest route meaning differing from Overview | 7 |
| Latest route word sum differing from Overview | 22 |

These morphology categories are mutually exclusive results of the current
validator. The review count also includes shared-fact and route conflicts, so
it is not their sum. No entry has a missing morphology row, definition,
metadata row, dictation sentence, or provenance under the current checks.

The import should preserve word IDs and historical records. Only exact,
unambiguous corrections may be converted automatically. The remaining
morphology part meanings and family evidence need reviewed source data before
the full dictionary can be published. The 14-word pilot is complete; it does
not resolve these wider review findings.
