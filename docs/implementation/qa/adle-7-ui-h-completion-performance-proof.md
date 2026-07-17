# ADLE 7-UI-H completion performance proof

Status: implementation and authenticated guarded-staging proof complete. The
atomic path is materially faster and preserves the durable contract. The
stretch gate is recorded as a narrow miss: 2.874s is below three seconds, but
the 39.4% improvement is 0.6 percentage points short of the 40% target.

## Safety boundary

- Branch baseline: `adec626` on `review/adle-7-ui-g-word-lab`; no reset, commit,
  push or merge performed.
- Target database remains staging project `jlhotktspjvffslvuyfz`; production
  learner data is prohibited.
- Pilot and atomic completion default disabled. Activation requires both the
  existing child allowlist and a valid Word Lab v1 assignment snapshot.
- The two retained disposable staging fixtures and private preview access must
  not be cleaned up by UI-H.

## Evidence table

| Measurement | Historic UI-G | Fresh instrumented batched | Atomic UI-H |
|---|---:|---:|---:|
| Finish → immediate feedback | Immediate; not instrumented | 23.9ms | 27.0ms |
| Finish → completed route | ~7.4s after batching | 4,743ms | 2,874ms |
| Finish → durable call returned | Not separated | 3,280.8ms | 1,544.6ms |
| Context/auth/ownership | Not separated | 1,032.2ms | 874.7ms |
| Plan/read-model load | Not separated | 357.6ms | 151.3ms |
| Retry guard | Not separated | 126.0ms | 135.3ms |
| Policy/learning-item reads | Not separated | 316.2ms | 141.3ms |
| Attempts | Not separated | 159.1ms | Included in atomic call |
| Lesson/schedule/taught/learning | Not separated | 1,083.9ms | Included in atomic call |
| Reflection | Not separated | 146.4ms | Included in atomic call |
| Assignment items/header | Not separated | 359.2ms | Included in atomic call |
| Atomic durable transaction | N/A | N/A | 238.4ms |
| Completed-route reads | Not separated | 315.6ms | 330.3ms |
| Reward follow-up | Deferred; not separated | 378.6ms | 136.8ms |

The fresh comparison therefore improves the child-visible route by 1,869ms
(39.4%) and the server durable-return boundary by 1,736.2ms (52.9%). Feedback
remains well inside 100ms. This is a material performance pass, but not a claim
that the explicit 40% stretch gate passed.

## Local verification recorded 2026-07-17

Passed: application and script TypeScript, targeted ESLint, production build,
D4_MOR content/schema, approved package, primitives, guided pilot, bundle,
attempt capture, session wiring, composer persistence, evidence, proficiency,
reward bridge, session celebration, reflection recall-gate, paused release and
the UI-H completion contract regression. The production Word Lab chunk is
42,564 bytes raw / 11,952 bytes gzip against the 153,600-byte budget.

The expanded database-backed atomic regression covers success, resubmission,
concurrency, private-reflection isolation and forced late rollback, but was not
run locally because the Docker/Supabase local daemon was unavailable. This is a
recorded blocker, not a pass.

## Staging deployment recorded 2026-07-17

- The uncommitted instrumentation build deployed successfully to the private
  `scarletts-spells-staged` Preview. The local ignored Vercel project pointer was
  restored to `scarletts-spells` immediately afterward.
- Preview Supabase URLs resolve to staging project `jlhotktspjvffslvuyfz`.
  Credentials and pilot values remain write-only Vercel Sensitive variables;
  no value was printed, copied or moved outside Vercel.
- `ADLE_WORD_LAB_ATOMIC_COMPLETION_ENABLED` was first disabled for the true
  batched baseline and then enabled only on Preview branch
  `review/adle-7-ui-g-word-lab` for the comparison.
- `20260717120000_add_adle_word_lab_atomic_completion_rpc.sql` was applied only
  to staging through the authenticated Supabase SQL editor. Verification
  returned `function_exists=true`, `service_role_execute=true`,
  `authenticated_execute=false` and `anon_execute=false`.
- Final review corrected the RPC attempt-envelope predicates to fail on any
  ownership/binding mismatch (rather than only a wholly invalid row) and added
  final 6/4/4 split verification. The corrected staging definition reports
  both checks present, while execute remains service-role only. Existing proof
  rows were valid and therefore unaffected.
- Authenticated timing used only the two retained disposable allowlisted QA
  children. The baseline trace was
  `a93a20a8-6f7a-44f6-b0ee-68c3b0937427`; the accepted atomic trace was
  `8eabf875-cec9-4cab-8ab0-c3fe0858bda4`.

## Durable staging verification

Both the baseline and atomic completion returned exactly one completed header,
16 completed items, 14 attempts (6 guided, 4 controlled, 4 dictation), one
private reflection, four active learning items, four taught rows and four
active schedule rows. All four dictation attempts retained raw sentences.
Completed-route reload left the same counts unchanged. The database-backed
regression additionally covers completed resubmission, concurrent submission,
forced late rollback, ownership rejection, malformed counts and pre-UI-H
partial recovery.
The disposable child had no eligible Golden Nuggets, so reward follow-up
correctly wrote zero reward events; grouping both atomic assignments by the
reward idempotency identity returned zero duplicate keys. Evidence pricing has
no persisted priced-event ledger; its attempt/evidence inputs are the 14
idempotent attempt rows verified above, and the focused evidence and reward
bridge regressions both pass.

An evidence-led experiment parallelised the two post-auth ownership reads. A
fresh unused-date run measured 12.7ms feedback, 3,694ms completed route and
401.5ms atomic transaction, while context/ownership remained 847.2ms. Because
it produced no stable stage reduction, that code change was rejected and is
not in the final working tree. The run still verified
`1 / 16 / 14 / 1 / 4 / 4 / 4`; it is retained as staging-variance evidence,
not substituted for the accepted like-for-like comparison.

The admin-only `adleDate` proof parameter is intentionally omitted by the
normal completion redirect. This can display the current-date completed route
after an unused-date QA completion, although the submitted assignment ID and
database rows are correct. Production learner navigation does not use this QA
override; changing redirect semantics is outside UI-H.

## Production migration record — 2026-07-17

After the local UI-H commit `87d304a`, production project
`wwohrqtunajrbwxyssjf` passed the ledger preflight: version `20260717120000`
was absent and the RPC did not exist. The three reviewed migration statements
and one matching three-statement ledger entry were then applied in one SQL
transaction. Post-release verification returned exactly one ledger row,
`SECURITY DEFINER=true`, controlled search path, `service_role_execute=true`,
`authenticated_execute=false`, `anon_execute=false`, and both fail-closed
attempt-binding and final 6/4/4 checks present. No application deployment,
feature activation, allowlist change, production learner query or production
learner write occurred.
