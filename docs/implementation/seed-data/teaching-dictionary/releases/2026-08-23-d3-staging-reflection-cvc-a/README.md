# D3 staging-only governed Reflection release

This package is a disposable, non-Production Teaching Dictionary release for
the D3 Snapshot v3 staging proof. It supersedes the active staging version of
`D4_PG_CVC_SHORT_VOWELS_SHORT_A` solely to add an explicit governed child-facing
Reflection prompt. It is not a Production curriculum release.

The package is validated through the canonical Teaching Dictionary CSV
validator and released only by
`scripts/release-teaching-dictionary-staging-content.py`, which is pinned to
the staging Supabase project and writes only the content-version, field-review,
and readiness governance records.
