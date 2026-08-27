# ADLE Phase E legacy convergence audit

Status: E0 frozen baseline. No Production mutation is authorised by this
document or its tooling.

## Source and safety boundary

- Baseline commit: `70b25b0be16dffb2f5f165ea3b03e338aa92d202`.
- The audit command enters a repeatable-read, read-only database transaction
  and rolls it back.
- The genuine learner is supplied explicitly; the tool does not infer identity
  from a name.
- Audit output contains counts and SHA-256 digests, not authentic writing or
  other learner content.

## Frozen Production findings

- Production contained no immutable lesson snapshot rows at the Phase E audit.
- Existing specialist and metadata-free generic assignments therefore remain
  protected historical read/completion dependencies.
- The old Daily spelling practice materializer had produced 157 headers and no
  assignment items. The rows remain historical data; only forward creation is
  in E1 scope.
- Fixed-`un` v1 and closed-compound v1 had no persisted Production payloads.
- The genuine learner used per-word Review authority. A separate protected
  fixture-shaped learner still used bundle-era Review authority, so that
  compatibility remains out of E0-E3 scope.

## Commands

```sh
npm run adle:phase-e:no-legacy-writes
npm run adle:phase-e:production-audit -- --genuine-child-id <verified-uuid>
```

The Production command additionally requires `ADLE_PHASE_E_PRODUCTION_HOST`
to acknowledge the database host and a supported Production database URL. The
connection username must contain the pinned Production project reference.

## Protected invariants

Before and after E0-E3, compare the aggregate digest and per-table digests for
schedules, learning items, taught history, Review sessions/encounters/outcomes,
repair attempts, Memory Cues, authentic-use evidence, assignments, Word
Treasures, spelling rewards, and coin events. Any difference must be explained
by separately recorded genuine learner activity or the release stops.
