# Luna synthetic website proof — 2026-09-30

## Authority and release

The owner authorised investigation and repair on the normal Production website
using a test writer and fictional spelling/homophone errors. The owner separately
approved a 15-second full-body provider deadline and 45-second worker budget.
No automatic retry or resend of an ambiguous source was authorised or performed.

- Website: `https://scarletts-spells.vercel.app`.
- Supabase: `wwohrqtunajrbwxyssjf`.
- Vercel: `prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`.
- Indexed-word resolver application: `edc2522e920dd73664e4a97bcebeb9f35398f40b`.
- Its Production deployment: `dpl_BDG6Pq2Eqo5FxhgXQ86dnPJe22Eo`.
- Passage-location UI application: `d1f184f9afdb0ccdbce8a0dfae17dd740ea99c20`.
- Its Production deployment: `dpl_CcThHHFm1y7gSfsU8J8mLhPpAaPK`.
- Runtime: `CONTEXT_SHADOW_DISPATCH_V7`.
- Runtime fingerprint: `a1744e7620e625bbf961eee8652a29b9d1c29b8b2cf23af39a1b312dd57a5baf`.
- Prompt fingerprint: `a0280520a2a2b99efafe3162d9581088c9477d916af682739c7dd07a0550d542`.
- Schema fingerprint: `18b68be7b62ebc1551bfed4e1fbdb85f842cd7dcbdf5ee2216183e4d6ed213e0`.
- Configuration fingerprint: `5830c0db938686a1f7ed4b4fbdd124be3d3a671ee5d908c9390a5b6ac1ccef5e`.
- Rate card: `openai-gpt6-luna-default-20260930`.
- Rate-card fingerprint: `76a726a72596d742f25cf4629d0a379d543e496a0a95d4c985af872ad7f74782`.

No migration was needed. The experimental Git deployment guard remains enabled;
`main` remains the Production branch. These were explicitly authorised manual
releases. Provider credentials were neither retrieved nor changed for these
repairs. Only the required public runtime/prompt/schema/configuration fingerprints
were rebound in the existing sensitive Production environment entries.

## Findings and bounded repairs

The [earlier diagnosis](luna-production-configuration-and-deadline-diagnostic-2026-09-30.md)
records malformed Production rate-card bindings, an eight-second full-body timeout,
and a later `AI_PASSAGE_SPAN` gate rejection. The exact offending provider field
was not retained, so its unavailable raw value is not asserted here.

The passage request originally asked the model to calculate character offsets.
The repair supplies explicit request-local `[index, word]` pairs from verified
immutable authored occurrences. The model selects a word and correction; the
server supplies exact stored UTF-16 coordinates. There is no fuzzy reanchoring.
Wrong words/indexes, duplicate references, altered source/hash/coordinates,
unknown authorship and invalid correction contracts remain fail-closed.

The owner found that native hash links did not visibly identify the exact word.
The initial verification established target existence but did not establish
satisfactory click behavior. The UI repair centers the selected occurrence,
moves focus to it and displays a stronger blue outline. Modified clicks and
native anchor fallback are preserved. This UI release required no new provider
approval or inference: AI was disabled and the previous approval revoked.

## Hosted observations

A fresh registered disposable proof used the ordinary submission/source/detector/
independent-worker/reservation/admission/provider/gate/receipt path. One actual
request completed in 3571 ms: `SCANNED`, seven accepted findings, model
`gpt-6-luna`, default tier, 551 input tokens, 271 output tokens including 101
reasoning tokens, known cost **$0.00019060**. Every finding matched its persisted
source occurrence. Counts in 41 inspected educational/reward tables with a
`child_id` column were zero for this registered proof. It was killed, revoked and
removed before the normal product test. No surviving proof learner was relabelled.

A separate newly created, unregistered synthetic adult writer exercised the
normal adult submission and Review flow under a short-lived `ADULT_RELEASE`
policy. Database source purpose was `REAL_LEARNER`; source capture was stamped
true and `ADULT_SUBMISSION` authority was created by the database. That is a
synthetic product test through the ordinary source classification, not an
assertion of authentic learner use.

Its one request completed in 4317 ms: `SCANNED`, seven findings, verified
`gpt-6-luna`/default tier, 551 input tokens, 313 output tokens including 143
reasoning tokens, zero cached/cache-write tokens, known cost **$0.00021160**.
Stored SHA/runtime/prompt/schema/configuration/card provenance matched the
approved resolver release. Cost is reproducible from the immutable card.

| Observed | Correction | Exact UTF-16 range |
|---|---|---|
| their | there | 23–28 |
| There | Their | 42–47 |
| they're | their | 74–81 |
| Your | You're | 113–117 |
| herd | heard | 165–169 |
| threw | through | 190–195 |
| loose | lose | 222–227 |

Review displayed all seven blue context highlights and matching rows together
with yellow spelling findings, including `freind → friend`. The existing spelling
engine also suggested `waited → wanted`, a false positive outside the Luna repair.
The spelling × action did not visibly settle that row during this proof; it is
an outstanding spelling-review issue, not a successful dismissal claim.

The context × action persisted `DISMISS`; its row became "Not an issue". Undo
persisted `RESTORE`. Reload retained the seven findings. There remained exactly
one attempt and dispatch for this product submission: reload, locating a word
and context dismissal/restoration did not rescan the writing.

## Limits, stops and remaining product work

Concurrency remained one, provider retries zero, request cap four and reserved
UTC-day exposure cap $0.012 for the final temporary tests, counting the two
previous requests. Per-request reservation was $0.003, exceeding the conservative
$0.002024 bound. These temporary safety limits are within the owner's $0.50
shared UTC-day ceiling; they are not measured operating thresholds.

No authentic writing, parent notes, provider bodies/reasoning or credential values
were read into the repository evidence. Provider request bodies include only the
bounded synthetic passage, request-local indexed words, opaque case hash and
fixed prompt/schema controls; database/account identities remain server-only.
Historical raw provider logs/content retention is not disproved by these checks.

The hosted structured-lesson submission screen did not display the OpenAI
retention notice already present in `PreSubmitChecklist`; structured lessons use
a different submit control. That notice gap remains to close before broad adult
activation. This proof does not establish Send back, returned-work classification,
Admin promotion, cross-account/anonymous browser access or a long-passage latency
policy. Existing isolated regressions cover source/authority and failure cases;
those results are not substitutes for unperformed hosted scenarios.

Local passage and worker regressions, app and script TypeScript checks,
`git diff --check` and a changed-file credential-pattern scan passed for the
resolver repair. The passage-location UI passed app TypeScript and diff review;
its actual hosted click results and final cleanup readback follow below.

## Hosted passage-location verification and final boundary

The first tab stalled during reload; browser control was recovered in a fresh tab
of the same browser with the same authenticated owner and synthetic submission.
No new submission, provider call or account change was needed for recovery.
After the deployed UI fix loaded, all seven visible context links were clicked.
For each, the DOM-confirmed focused element was the exact matching source mark,
its word matched the selected row, it was fully visible, and its vertical center
matched the viewport center (measured error zero pixels). The selected mark had
a two-pixel dark blue outline. The retained local screenshot contains only the
synthetic Original writing box. The initial hash-target-only claim has been
superseded by these behavioral checks.

At final readback, controls were false/disabled, policy scope DENY, provider and
adult-submission authority revoked, zero proof registrations, zero pending or
processing context jobs, and zero reserved/sent dispatches. The ordinary product
submission still had its single completed attempt. Four total requests and
$0.012 admitted exposure remain in the shared non-personal ledger, including the
previous UNKNOWN request; known actual cost is $0.00079150. Nothing was refunded
or resent under a new revision.

Because the owner was actively reviewing the passage links, the separate ordinary
synthetic review fixture is intentionally retained for owner inspection, with
its complete source/findings/receipt and revoked authority. It is not an orphan
or an active provider proof. Final deletion of this retained fixture is deferred
until that inspection is finished: delete its designated source snapshot and
then its separate disposable profile through canonical cleanup, verify removal
of fixture-only course/task scaffolding and private jobs/permissions, and retain
the immutable approval/card/policy audit plus non-personal consumption. Do not
claim that final retained-fixture cleanup has already happened.

All registered disposable provider-proof fixtures from this investigation were
removed. No authentic learner work was inspected or submitted to Luna. No broad
adult activation, merge to main, educational/research promotion or provider retry
follows from this receipt.
