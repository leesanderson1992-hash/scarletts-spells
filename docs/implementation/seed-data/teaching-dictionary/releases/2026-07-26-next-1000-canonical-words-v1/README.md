# 2026-07-26 Next 1,000 Canonical Words v1

Immutable `canonical_word_batch_v1` release prepared from the approved PR #10
workbook.

> Historical staging evidence only. This package used the original manifest
> fingerprint format and must not be promoted. The production candidate is a
> freshly prepared v2 manifest package created after the immutable-manifest and
> least-privilege hardening work.

```text
package SHA-256:
9235360b150d571614f0631425e8a50a097ef567500c5240a0a904111ef1eb37
```

Contents:

- 1,000 reviewed canonical entries;
- 1,000 pronunciation/technical metadata rows;
- 1,000 reviewed morphology and word-sum decisions;
- 1,000 contextual dictations;
- five approved source records;
- zero support links or micro-skill teaching-content versions.

Three approved repair intentions (`govern`, `governor`, `tall`) are preserved
outside the package because the workbook does not supply the explicit factual
metadata required for a guarded repair. They are not represented as completed
or imported repairs.

The staging receipt records 990 new identities and 10 exact existing
identities refreshed without changing their canonical IDs. The production
split must be calculated independently by production preflight.

Use `docs/operations/teaching-dictionary-release-runbook.md`. Do not edit files
under `package/`; prepare a new release ID for any content change.
