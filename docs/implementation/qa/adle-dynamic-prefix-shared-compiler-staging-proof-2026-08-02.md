# Dynamic Prefix V2 shared compiler migration — staging proof

Date: 2026-08-02

Scope: disposable staging proof only; no production database mutation or
deployment

## Decision

The four approved Dynamic Prefix V2 profiles passed the guarded compiler
authority sequence `shadow` → `enforced_parity` → `shared_authoritative` on the
normal assignment-writer path. Their public V2 payloads, persisted plans,
bindings, item counts, learner runtime and completion effects remained exact.

`D4_MOR_PREFIXES_UN` was not synthesised, mutated, invoked through the proof
writer, or counted as migration evidence. It remains explicitly
`legacy_pending_exact_source`. The legacy compiler is retained.

## Pinned identities and source

- Runtime proof commit: `3abe87c6686eca35eb1f78c75f8b0153a1a3d658`.
- Supabase staging project: `jlhotktspjvffslvuyfz`.
- Vercel staging project: `scarletts-spells-staged` /
  `prj_oJkffstOtacc4juYloXajHpjJUha`.
- Production Supabase `wwohrqtunajrbwxyssjf` and production Vercel project
  `scarletts-spells` / `prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl` were explicitly
  rejected before credentials or writes.
- The preflight found exactly four migrated profiles, 28 active approved
  members, 28 canonical words, 28 metadata rows and 28 eligible dictation rows
  covering all 28 approved words.
- The protected dictionary fingerprint before and after the proof was
  `c9b231b879123536833af14e777150ba2c1394e63a5b44e25039043c7bd67a0c`.

No schema migration, RPC, Teaching Dictionary row, profile row, Common Word
Lab activation, Generic Snapshot V2 activation or Dynamic Affix writer change
was part of this proof.

## Mode deployments and writer proof

| Mode | Preview deployment | Writer result | Legacy compiler |
|---|---|---|---|
| `shadow` | `dpl_2hn8U7YmnNLbnJucq8Tx74RzJuCV` — `https://scarletts-spells-staged-jrh4vncef.vercel.app` | Four exact assignments: `16 / 16 / 16 / 18` | Invoked four times for comparison |
| `enforced_parity` | `dpl_6XTQGVfKeUiKHnafemtruLxzFQ9a` — `https://scarletts-spells-staged-bh7od5da2.vercel.app` | Four exact assignments: `16 / 16 / 16 / 18` | Invoked four times; all parity checks matched |
| `shared_authoritative` | `dpl_Db8GBHVRPRVgv2wPK4PX44eZsTZb` — `https://scarletts-spells-staged-28glkyqkk.vercel.app` | Four exact assignments: `16 / 16 / 16 / 18` | Zero invocations; comparison and legacy duration both zero |

Each mode emitted four redacted, low-cardinality decision events. Shadow and
enforced parity recorded four matches and positive legacy durations. Shared
authority recorded `parity=not_run`, `legacyMs=0` and `compareMs=0` for all
four profiles. Shadow and enforced assignments were reset to zero assignment
and item residue before the next mode.

The deterministic fingerprints were identical across all three modes:

| Profile | Payload fingerprint | Source fingerprint | Lesson fingerprint |
|---|---|---|---|
| `D4_MOR_PREFIXES_DIS_MIS` | `c1e5517d3afa434dae4469165203b859434f8dd2150112306cd78c63c77e42df` | `362dc7eb2ab505ac197243e12a940bf633429fc5f5a1a1260c1eaa9702289efc` | `78e9d105e3820798ec79977b9ec4465fb71ef7560d7b583638b008351f8dd469` |
| `D4_MOR_PREFIXES_IN_IM_IL_IR` | `5c95d2cba29034372e197556f085c88b7393734b6dd82d0150aa59be718e791c` | `055733c209d4873072d858e101e45022d9b5c2f2991ff29c056737d1d21c74a5` | `8b443ba561a4445ce31d6f42ef0b68af7a126f07a7e6263a8a5e59ef9f845685` |
| `D4_MOR_PREFIXES_RE_PRE` | `932b6cae80ec9a4aab2a2ad2c5e04ad1059483ec1333ff2bb90055fbdabf3d28` | `fa4c15d00e508703fb7cf80d981d0862e32a7c8f688262610b7710f635a574bb` | `28d726aa36a0666184566194916769c2960932d4cdf3b3b4b7bc14dddf631bd1` |
| `D4_MOR_PREFIXES_SUB_INTER_SUPER` | `08fb8f7f12f2a455c24da7df03908449e28c8dbc07267fc179729797d01defeb` | `024171eca18cc4dc2fd9517da4bc67756fd59a4d7023b6ca66e2e41efbdd3f7d` | `e60e27bb3a0c0728bc079e7585461540c1a560fa9cc76ddf23d972e2d234746c` |

## Learner lifecycle and persistence

Two representative shared-authoritative lessons were completed through the
authenticated child route:

- `D4_MOR_PREFIXES_DIS_MIS`: 16 assignment items and 14 learner attempts;
- `D4_MOR_PREFIXES_SUB_INTER_SUPER`: 18 assignment items and 16 learner
  attempts.

Both saved the instructed reflection, one taught-history event and one active
next-day schedule, and both handled an absent optional Word Treasure row
gracefully. The 16-item run reloaded after its first controlled spelling and
resumed on the next word. The 18-item run was deliberately recovered after a
browser interruption and resumed at the fourth controlled word, proving that
completed items were persisted independently. Both finished with a completion
trace, rendered the all-done state and retained the saved reflection.

## Deployment rollback and forward restoration

Baseline commit `1f78d5e67f6d225dd128b37b29b796a0ee2384d4` was deployed only as Preview
`dpl_DDaf38ivUADLm29ymucvbXVTyzXi` at
`https://scarletts-spells-staged-17l0ol7mr.vercel.app`, explicitly linked to
the pinned staging project. It opened a `D4_MOR_PREFIXES_RE_PRE` assignment
created by the shared-authoritative writer, completed all 16 activities,
persisted the reflection and rendered the all-done state.

Returning to shared-authoritative deployment
`dpl_Db8GBHVRPRVgv2wPK4PX44eZsTZb` immediately rendered the same completed
assignment and reflection. The detached rollback worktree was then removed;
`git worktree list` contained only the primary repository.

## Cleanup audit

The proof harness deleted the disposable identities, children, learning rows,
assignments and items, attempts, reflections, taught history, schedules and
generated reward references. The exact-fixture residue audit returned zero.
The profile/dictionary audit returned unchanged with the same protected
fingerprint, and a fresh post-cleanup preflight again found `4 / 28 / 28 / 28`
profile/member/metadata/dictation coverage and no normal-path `un-` profile.
Ignored credential/state files were removed.

## Final local verification

- ESLint, application TypeScript, script TypeScript and the production Next.js
  build passed on the final tree.
- The semantic production baseline passed all 31 regressions. Focused suites
  also passed the exhaustive 112 migrated-profile/authentic-position cases,
  three authority modes, mutation and fingerprint blockers, assignment
  plan/binding/count zero-write gates, Prefix V2 history/runtime, Dynamic Affix
  V3, Common Word Lab, composable lesson, completion, evidence, scheduler and
  reward behavior.
- The isolated compiler benchmark used 50 warmups and 500 decisions per
  profile/mode combination. Against gates of p95 ≤ 10 ms, p99 ≤ 20 ms and heap
  delta ≤ 5 MB per decision, the worst observed values were p95 5.212 ms, p99
  18.104 ms and 0.030 MB per decision.
- All 12 generated architecture inventory files regenerated cleanly; the drift
  and documentation regressions passed.
- The baseline-to-final diff contains no Supabase migration, Teaching
  Dictionary content, Dynamic Affix writer, Common Word Lab, or package-lock
  change.

## Production boundary

No production database or Vercel deployment was read through proof
credentials, mutated, deployed or promoted. Production rollout remains a
separate decision requiring explicit written authorization and every gate in
`adle-dynamic-prefix-shared-compiler-production-rollout-checklist.md`.
