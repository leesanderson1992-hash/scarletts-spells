# Luna Production configuration and deadline diagnosis — 2026-09-30

## Scope and outcome

The owner authorised investigation and repair through the normal Production
website using synthetic writing and disposable profiles. No authentic writing,
parent notes, provider response bodies or credential values were retrieved for
this receipt. The complete combined spelling/context Review proof is **pending**.

Production project identities remain Supabase `wwohrqtunajrbwxyssjf` and Vercel
`prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`. The experimental Git deployment guard remains
in place; `main` remains the Production branch. Deployments below were explicit
Production releases of the diagnostic amendment, not automatic branch deployments.

## Configuration root cause

Diagnostic commit: `5c7b0c17f0b3f54e0c53061ca3cf4300c9a38ae3`.
First diagnostic deployment: `dpl_AmZfv2167mMHwgaFzvEJMcwUkDfZ`.
Scoped server-only pre-reservation diagnostics showed:

- Standard retention acceptance and provider-key presence: true.
- Production environment and deployment SHA format: true.
- Project reference format, model, prompt, schema, configuration, gate and
  runtime fingerprint comparisons: true.
- Rate-card version format and fingerprint format: **false**.
- Rate-card read succeeded, but the selected row was absent.

The first concrete rejection was the identity validator's rate-card environment
format check. The card lookup independently rejected the malformed version.
Underlying environment strings were not retained or printed. There was no
reservation, provider admission, send or consumption for that failed capture.

Only the two existing sensitive **Production** environment bindings were corrected:
`CONTEXT_AI_RATE_CARD_VERSION` and `CONTEXT_AI_RATE_CARD_FINGERPRINT`.
Their expected public values are:

- `openai-gpt6-luna-default-20260930`
- `76a726a72596d742f25cf4629d0a379d543e496a0a95d4c985af872ad7f74782`

The existing immutable card's canonical fingerprint was recomputed successfully.
The same application SHA was redeployed as
`dpl_52MowKCKw1GWPoXNnbKhmxJhMfPj` with the corrected bindings. No provider key,
model, prompt, schema, gate, migration or account permission was changed.

## Reservation-bound correction

A fresh capture passed identity, card and eligibility checks, then safely denied
reservation with `AI_REQUEST_COST_CAP_TOO_SMALL`. The temporary proof limit of
$0.002 was below the database's conservative bound of $0.002024:

`(8000 * greatest(input_rate, cached_input_rate, cache_write_rate) + 2048 * output_rate) / unit_tokens`

No provider send occurred. The next fresh proof used a $0.003 per-request
reservation, $0.006 UTC-day cap, two-request cap and concurrency one. These are
synthetic proof limits within the owner's $0.50 shared daily ceiling; they are
not measured operational thresholds. Each failed approval was revoked and each
fixture was removed before the next capture.

## Genuine provider observation

The final fresh proof passed reservation and admission and invoked the pinned
Responses adapter **once**. Its outcome was operational `NOT_ASSESSED`,
`AI_PROVIDER_TIMEOUT`, with latency 8003 ms. Transport began at
`2026-09-30T20:11:45.272Z`; headers were received at
`2026-09-30T20:11:53.261Z`. The body was not normalized before the full-body
eight-second deadline. This establishes a deadline failure; it does not prove
why the provider took that long or whether it finished remotely.

No returned model, tier, usage or calculated cost was established. Billing is
UNKNOWN, not zero. No retry or resampling of this source occurred. The canonical
stop restored `enabled=false`, `ai_mode=disabled`; cleanup revoked the proof
approval/permission and reset policy to `DENY`, with `FOUR_FAMILY` proof default.
Designated synthetic snapshots were removed and the separate disposable profile
was deleted through the site's canonical Delete child action.

Final readback found zero remaining proof registrations, private jobs,
dispatches and attempts, and no surviving designated test profile. The durable
non-personal Production ledger retained one reserved/admitted request, $0.003
reserved/admitted exposure and zero **known** actual cost. Fixture deletion did
not refund request or exposure capacity. Immutable card/provider/policy audit and
failure history remain retained.

## Owner-approved latency amendment

The owner approved the change from the prior explicit eight-second deadline.
The code-only amendment sets a 15-second full-body
provider deadline and 45-second worker budget; all worker admission budget
checks use the same constants. Runtime identity becomes
`CONTEXT_SHADOW_DISPATCH_V6`, fingerprint
`e1cb38de9c501ab65ee9f0183cacf8ea2a35190fc0b09ed2f0a08ea1d9e5118a`.
The existing claim lease and internal route duration are 60 seconds. The 45-second
budget begins after preliminary database work, so neither lease survival nor
hosted completion is asserted by the constant alone: final admission still
rechecks the live claim, and a fresh website proof is required.

There is no migration, changed request payload, prompt, schema, safety gate,
pricing, retry, provider endpoint, concurrency or accounting rule in this proposal.
A focused mocked response after 8.5 seconds exercises the former failure boundary;
hanging body and private barrier tests still enforce the new finite deadline.
Local verification passed: provider regression, shadow worker regression,
`npm run typecheck:scripts`, `npx tsc --noEmit` and `git diff --check`.
Release identity and hosted proof results will be recorded in a follow-up receipt.

## Remaining website proof

Registered provider-proof findings are intentionally excluded from normal Review
and educational outputs. After an isolated successful provider proof, a **new**
unregistered synthetic adult profile must exercise the normal adult submission
path under a short-lived owner-approved `ADULT_RELEASE` policy. Do not relabel a
surviving registered proof learner or weaken proof isolation. Verify the combined
Review table, yellow spelling and blue context spans, exact passage links, dismiss
and correction behavior, then reload without another send. Finish with canonical
disablement and fixture cleanup while retaining non-personal consumption.

## Follow-up: genuine response and indexed source references

The approved deadline amendment was released at application
`aeb5381676bd16d2b985dfb7a1fecf3f826786b0`, deployment
`dpl_G9F1phy4LrdVcfCjAAzLWcMu95ne`. A fresh registered proof invoked Luna once
and returned in 7791 ms. Model `gpt-6-luna`, default tier, 298 input tokens,
719 output tokens (including 500 reasoning tokens), and cost $0.00038930 were
verified. The deterministic gate rejected the response with `AI_PASSAGE_SPAN`.
There were no accepted findings or educational changes. The exact offending
provider field was not retained; this receipt does not assert its unavailable
raw value. The response contract required model-calculated character offsets,
which are inappropriate as the product's source-addressing mechanism.

The bounded repair replaces model-counted offsets with explicit request-local
`[word_index, observed_word]` pairs from verified immutable authored occurrences.
Luna returns that index, the exact observed word and a single-word correction.
The server validates the index/word and derives coordinates from the persisted
occurrence. There is no fuzzy matching, nearest-span fallback or duplicate-word
search. Corrupt source/hash/coordinates, duplicate references, unknown authorship,
wrong observed words and invalid substitutions fail closed. No database identity
is included in the index pairs. Request/output size bounds remain unchanged;
a word list that exceeds the fixed request-byte cap cannot be sent.

The four-family request and safety gate remain unchanged. Passage prompt/schema,
configuration and runtime fingerprints change; a new approval bound to the new
release is required. No migration or accounting/authority/provider retry change
is needed. Focused regressions cover repeated words, astral Unicode, later-window
global spans, old-offset rejection, corrupt source and minimal payload. The full
worker regression repeats independent admission, failure stops and no resend.

This fixture was canonically killed/revoked/removed. The shared durable ledger
then retained two admitted requests and $0.006 exposure, with $0.00038930 known
actual cost; the first timed-out request still has UNKNOWN billing. Fresh proof
limits must count both historical requests, rather than resetting capacity under
a new policy revision. Subsequent website evidence is recorded separately.
