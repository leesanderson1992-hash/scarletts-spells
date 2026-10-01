# Adult-writing context resolver current-state audit — 2026-10-01

## Scope and evidence boundary

This is a source and local-regression audit of branch
`experiment/ai-context-benchmark` at application commit
`09086e15d54073f167160bda325c360a5599b145`.

It updates the implementation picture after the historical 2026-09-30 website
receipt. It does not replace that receipt, assert a V10 Production deployment,
assert that later migrations are in the Production ledger, or authorise AI
activation. Historical proof identities remain historical facts.

The worktree was clean at the initial source review. Subsequent local documentation
and regression/notice edits are not Production evidence. No Production
configuration, migration, provider policy, provider request, account, or writing
record was changed during this audit.

## Implemented in the current source

- Luna passage scanning uses up to three non-overlapping 3,000 UTF-16-character
  windows, with each text window capped at 4,000 UTF-8 bytes and each complete
  request capped at 16,000 bytes.
- The provider request supplies immutable request-local indexed words. Luna
  returns an index, observed word and correction; the server retains and checks
  the exact source span. It does not accept model-calculated offsets.
- The current runtime is `CONTEXT_SHADOW_DISPATCH_V10`, with a 15-second
  full-body deadline, 50-second worker budget, zero automatic retries and
  `max_requests_per_submission=32`.
- The combined Review table supports yellow spelling and blue context findings,
  Save/Confirmed after reload, dismiss/restore, exact source-location links and
  short returned-context Details excerpts.
- Returned context repair cards are rendered inline with the returned answer,
  display a bounded original excerpt with the target word emphasised, and retain
  the retry as a fresh submission.
- A parent-confirmed contextual `concept_gap`, `fragile_knowledge`, or
  `transfer_failure` creates or links a learning item and a Golden Nugget after
  a child response. The prompted retry is `REPAIR_ONLY`; it does not create
  independent mastery, transfer or reward credit.
- Known governed families may use their assigned active micro-skill. Pairs with
  no matching governed skill are repair-only and enter the Admin contextual
  catalog queue.
- Contextual ADLE handoff reconciliation is implemented in the secured daily
  cron and immediately before guarded Today’s ADLE generation. It creates an
  `adle_learning_items` row only once canonical-word, word-to-skill-support and
  teaching-content requirements pass.

## Public current-source manifest

```json
{
  "model": "gpt-6-luna",
  "runtimeVersion": "CONTEXT_SHADOW_DISPATCH_V10",
  "runtimeFingerprint": "309f7a12e5ec119c5581202e7c1a628828fca317ce58778318c7c20608f535eb",
  "promptFingerprint": "7a50377c7452b274c30ed863d57834889487741b531265dc6d204b3c3af73509",
  "schemaFingerprint": "18b68be7b62ebc1551bfed4e1fbdb85f842cd7dcbdf5ee2216183e4d6ed213e0",
  "configFingerprint": "4cc403626862e63e6987141bde2429e336d2b2aeb498ac2739dfbfa50c2f2c19",
  "timeoutMs": 15000,
  "workerBudgetMs": 50000,
  "retries": 0,
  "passageMaxWindows": 3,
  "maxRequestBytes": 16000
}
```

The branch includes these unverified-for-Production forward migrations:

- `20261001100000_increase_context_request_cap.sql`
- `20261001110000_fix_contextual_learning_item_finalisation.sql`
- `20261001120000_exclude_contextual_finalisation_from_spelling_trigger.sql`

## Confirmed local coverage

The following focused regressions passed on this source revision:

- provider request isolation, one-send behaviour, cost/usage and deadline
  behaviour;
- worker enqueue, lineage, no-resampling, eligibility and redaction behaviour;
- context Save/Confirmed, reload, edit, dismiss/restore and source isolation;
- returned Details excerpts and inline child retry cards;
- contextual Gold exclusion rules; and
- pending contextual-handoff reconciliation.

After the local notice and test-pin repair, `writing:context-ai-regression`,
`writing:context-ai-provider-regression`, `writing:context-shadow-worker-regression`,
`writing:context-feedback-gold-regression`, `writing:context-returned-details-regression`,
`writing:context-returned-child-inline-regression`, script TypeScript checks,
app TypeScript checks, and the Production build passed. The structured lesson
render regression confirms the shared OpenAI notice precedes its submit control.

At 2026-10-01 19:18 UTC, a read-only Vercel lookup resolved the normal website
to READY Production deployment `dpl_7FpnGFtF9Z6o3XjbQWGFxCNRzYPj`. The returned
deployment metadata did not include an application Git SHA. The authenticated
admin operations page showed no pending jobs or unrecorded sends; it showed
one historical passage contract failure among nine provider calls in its
24-hour aggregate. Its disabled-only binding comparison was unavailable, so
this page did not establish current control state, V10 deployment identity,
schema ledger, or an active approval. No new provider request was made.

## Release prerequisites still being closed

1. **Verify the repaired safety-gate regression and submission notice.**
   The stale aggregate prompt/schema expectations and structured-lesson OpenAI
   notice gap have local fixes and passing regressions/build. They still require
   a reviewed release SHA and hosted confirmation before broader activation.

2. **Perform an exact Production release readback before broader activation.**
   Verify the deployed SHA, V10 public fingerprints, the three forward
   migrations, current rate card and policy, ownership restrictions and disabled
   control state. The historical V7 proof cannot establish this later runtime.
   After release, repeat a synthetic website proof through submission, Review,
   Send back and return before enabling ordinary adult scans.

## Follow-on ADLE work, not a context-resolver launch gate

There is no released ADLE lesson for the homophone category. The context
resolver may record the confirmed learning need and pending handoff without
creating an assignment. The following work remains useful, but is not required
to launch adult-writing context Review and retry:

1. **Make contextual handoffs visible in Parent Insights.**
   The current ADLE queue deliberately shows only active route-ready learning
   items. It cannot explain why a parent-confirmed contextual need is missing
   from the list. Add a separate parent-only “Waiting for ADLE content” section
   that reads `writing_context_learning_handoffs` and displays a short status:
   canonical word, word support, teaching content, or existing-item review.
   It must remain separate from the active teaching queue.

2. **Complete the two-word, one-micro-skill hosted flow after content exists.**
   The source reconciles handoffs and invokes the existing guarded lesson
   generator, but the current records do not prove the full hosted sequence of
   two distinct route-ready contextual items for one micro-skill becoming one
   assigned ADLE lesson. Exercise that with synthetic writing only, then verify
   the lesson, completion events and no duplicate assignment.

3. **Curate unmatched pairs deliberately.**
   `loose → lose` remains in the Admin contextual catalog queue because it has
   no governed micro-skill. A catalog decision, canonical support and released
   teaching content are needed before it can ever become an ADLE item. Do not
   create a placeholder skill merely to make it appear in a queue.

## Product semantics to retain

The event order is:

```text
parent confirms learning outcome after child reply
  → Golden Nugget / learning-item evidence
  → contextual handoff
  → route-ready ADLE learning item
  → two distinct items and released content
  → guarded ADLE lesson generation
```

An incorrect retry can support the parent’s concept-gap classification, but it
does not itself manufacture a Gold event or an ADLE lesson. This distinction
prevents a prompted repair from being recorded as independent learning evidence.
