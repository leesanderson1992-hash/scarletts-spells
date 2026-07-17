# ADLE 7-UI-H Word Lab durable completion and v1 contract

Status: implementation and database-backed guarded-staging proof complete. The
feature remains explicitly child-allowlisted and both the pilot and atomic
completion switches default to disabled.

## Durable completion boundary

Only an allowlisted `D4_MOR_PREFIXES_UN` assignment whose embedded payload and
exact 16-item snapshot pass runtime validation may call
`complete_adle_word_lab_v1`. Generic ADLE lessons retain their existing path.
The service-role-only function locks the assignment header and commits the
bundle, four schedule rows, four taught rows, four learning-item transitions,
14 attempts, one private reflection, 16 completed items and completed header in
one transaction. It verifies `1 / 16 / 14 / 1 / 4 / 4 / 4` before returning.

Concurrent or repeated calls serialize on the header. A completed assignment
returns `already_completed` only after verifying the durable counts. A pending
assignment with pre-UI-H partial rows reuses its lesson source reference,
active bundle, schedule identities, attempt uniqueness key and reflection
uniqueness key. Any validation or final-count failure rolls the whole call back.

Raw dictation sentences remain the attempt ledger value. The action derives
correctness only from the authored target token position before it builds the
trusted RPC input. Private reflection remains outside attempts, evidence,
mastery, scheduling and rewards.

Reward follow-up remains reward-owned, best-effort and idempotent after the core
commit. It has separate timing and is retried by a completed resubmission; it is
not included in durable database completion latency.

## Word Lab v1 compatibility freeze

- The embedded assignment payload is the immutable teaching snapshot. Runtime
  never recompiles it from the latest source package.
- Structurally valid `schemaVersion: 1`, `word_lab_v1` snapshots remain
  renderable across older `contentVersion` values. Current authored-value
  equality belongs to compiler/package regression, not runtime hydration.
- Runtime still requires the fixed v1 renderer activity IDs, word and binding
  order, reconstructable morphology, valid Guide references, recall-neutral
  assessment activities, authored dictation target positions and an isolated
  reflection.
- Unsupported, malformed, foreign or assignment-mismatched payloads fail closed
  to the warm generic ADLE lesson. They are not repaired, migrated or partly
  rendered.
- The Word Lab stays behind its client-only dynamic import. Non-allowlisted or
  invalid assignments do not request the rich runtime.

Resume state is browser-owned local storage, not server assessment truth. Its
key contains assignment ID, resume schema `1` and payload `contentVersion`; it
expires after seven days. Strict normalization rejects foreign keys, invalid
indices, oversized notes and unknown guided bindings. Checked recall resumes at
the next answer-safe state. Storage failure is non-fatal, and the completed
route clears state only after durable completion is visible.

## Timing and rollout gates

Each Finish submission carries a random correlation ID. Structured timing logs
contain only that ID, outcome and stage durations: auth/ownership, plan load,
retry guard, policy/items, individual batched writes or the atomic transaction,
assignment completion, redirect bookkeeping, completed-route reads and reward
follow-up. Browser logging records immediate feedback and completed-route time.

`ADLE_WORD_LAB_ATOMIC_COMPLETION_ENABLED` permits an instrumentation-only
batched baseline and then the atomic comparison from the same build. It defaults
to disabled. Acceptance requires immediate feedback within 100ms, completed
route below three seconds and at least 40% improvement over the fresh baseline.
No broad D4_MOR activation is part of UI-H.

The authenticated comparison records 23.9ms/4.743s for feedback/completed
route on the instrumented batched path and 27.0ms/2.874s on the atomic path.
The atomic transaction itself took 238.4ms and returned durably at 1.545s.
Database verification before and after completed reload retained
`1 / 16 / 14 / 1 / 4 / 4 / 4`, including the 6/4/4 attempt split and four raw
dictation sentences. This is a 39.4% route improvement: material and under
three seconds, while honestly 0.6 percentage points short of the 40% stretch
gate.
