# Adult-writing context resolver Production release receipt — 2026-10-01

## Authority and limits

The owner instructed completion of the remaining adult-writing release work and
confirmed on 2026-10-01 that all 16 existing learner profiles are synthetic and
that real writers will be adults. The 12 profiles with under-18 dates of birth
and four without dates are **not** evidence that the app enforces adult age.
There is no database age predicate on `REAL_LEARNER` capture or admission.
The current release is for owner-managed adult use; enrolling a real minor
requires stopping this standard-retention scope and reviewing the applicable
provider guidance. The app contains no public sign-up route in this release.

The owner accepts standard OpenAI API retention, not ZDR, and previously
confirmed organisation `org-Cdi9fOZ1EH05TjTTO2OpKz1D`, project
`proj_TiflcYqhzQJXxKpHauXKFRs8`, a project-scoped key named Scarlett Spells,
and disabled voluntary data sharing. Those provider account statements are
owner attestations. The OpenAI dashboard was not authenticated for an
independent key-version/settings readback during this release. No key value,
learner identity, submitted prose or provider body is retained here.

The writer-facing OpenAI notice was verified on the hosted structured lesson
before submission. It states that writing excerpts may go to OpenAI, account
details are omitted, and API safety logs may be retained for up to 30 days.
`store:false` is set by the provider adapter and does not mean zero retention.

## Frozen application and Production preflight

- Branch application SHA deployed from a clean checkout:
  `8c4f5bd8f50bccf7afd6aa8f3fe0cc4e8bb20f68`.
- Vercel project `prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`; Production deployment
  `dpl_XbxFJyGf9miJjcmMwXMngFh6rnM6` was READY and aliased to
  `https://scarletts-spells.vercel.app` at the final lookup.
- Supabase project `wwohrqtunajrbwxyssjf`. The three 2026-10-01 forward
  migration versions were in the 147-entry local/remote ledger comparison.
  No migration was applied in this release turn.
- Runtime `CONTEXT_SHADOW_DISPATCH_V10`, runtime fingerprint
  `309f7a12e5ec119c5581202e7c1a628828fca317ce58778318c7c20608f535eb`,
  prompt `7a50377c7452b274c30ed863d57834889487741b531265dc6d204b3c3af73509`,
  schema `18b68be7b62ebc1551bfed4e1fbdb85f842cd7dcbdf5ee2216183e4d6ed213e0`,
  configuration `4cc403626862e63e6987141bde2429e336d2b2aeb498ac2739dfbfa50c2f2c19`.
- The Production-only sensitive `CONTEXT_AI_DEPLOYMENT_SHA` binding was updated
  to the deployed application SHA before deployment. Vercel metadata showed
  `OPENAI_API_KEY` and the context identity variables as encrypted and
  Production-only. No credential was added to Preview or the browser.
- Official current Luna default-tier pricing was compared with the immutable
  card `openai-gpt6-luna-default-20260930`, fingerprint
  `76a726a72596d742f25cf4629d0a379d543e496a0a95d4c985af872ad7f74782`.
  The card remained unchanged.

The previous approval expired and named an earlier application SHA. The
control was set false/disabled before the new deployment. The proof used a
separate 60-minute standard-retention approval and policy revision. It was
revoked after the proof. A planned transition paused shadow processing before
the final immutable approval and policy revision were created.

## Fresh synthetic website proof

An unused, owner-owned synthetic lesson was submitted through the normal
structured lesson form after the V10 deployment. Its fictional passage
included multiple deliberately wrong homophones and one misspelling. The
database stamped an ordinary `REAL_LEARNER` source under the adult-release
policy; this was **not** the isolated disposable-provider-proof pathway.

The first submission produced one completed job, one finished dispatch and
one settled genuine `gpt-6-luna` default-tier attempt. The reviewer saw three
blue context spans at their exact source locations and one spelling row.
All three context corrections were saved, remained Confirmed after reload,
and the occurrence link focused the corresponding passage span. Send back
created four inline retry cards beside the restored answer, each context
card showing a bounded original excerpt.

The synthetic writer corrected the answer and all four retry fields, then
submitted again. This created a fresh submission, job, dispatch and settled
genuine attempt. The new Review page displayed the original issue, correction
and retry for each item without projecting old blue highlights onto the new
writing. Context Details remained available. The reviewer confirmed
`Checking only` for the three context items and recorded it for the spelling
item, then marked the submission approved. The four issues had no learning
classification and no contextual ADLE handoff. No Golden Nugget or ADLE
lesson was claimed from this fictional check.

Both proof attempts returned `gpt-6-luna`, service tier `default`, `KNOWN`
billing, no cached-input/cache-write tokens and no operational failure. Their
known calculated costs were $0.00010910 and $0.00007970. Neither was retried
or resampled. No provider response body is included in this receipt.

## Final readback and release state

At the final 2026-10-01 UTC readback the singleton was `enabled=false`,
`ai_mode=shadow`. The final policy was `ADULT_RELEASE` / `REAL_LEARNER`, revision
`755d989e-a8a8-4bf8-a74d-abe6bf3305c4`, with concurrency one, 32 requests
per UTC day, $0.50 reserved spend per UTC day and $0.0031 per-request
reservation. The approval is bound to the deployed SHA, Production project,
`/v1/responses`, `gpt-6-luna`, standard retention and the V10 fingerprints;
it expires at `2026-10-31 20:04:23 UTC`. The database execution-ready predicate
returned true. The proof approval was revoked.

The shared Production counter read 10 reserved requests and $0.031 reserved
for 2026-10-01, including eight earlier requests. There were zero open jobs,
zero open dispatches and zero unrecorded sends. Durable consumption and
immutable approval, policy and rate-card history were retained. The final
normal website alias still resolved to the READY V10 deployment.

## Operation and follow-on work

Stop via the existing canonical fail-stop function for a privacy, identity,
cost, provenance, threshold, visibility or learning-mutation failure; read back
false/disabled and account for already admitted work without resend. The
daily request and spend reservations are shared Production capacity, not a
per-user database quota. That equals the owner's per-account intent only while
one account uses the product. The approval expires after 30 days and must be
renewed from current evidence if adult scans should continue.

The disabled-only admin binding diagnostic still compares against the old
revoked failed-proof approval, so its deployment-SHA rejection is historical
and not the active release predicate. The successful hosted reservation,
admission and two settled attempts under the new approval provide the active
binding evidence. Repairing that diagnostic remains follow-on operator UX.

There is no released homophone ADLE lesson. Contextual handoff visibility and
the two-word lesson assignment proof are follow-on ADLE work, not prerequisites
for this adult-writing Review and retry release. An independently verified
OpenAI key-version/settings readback remains desirable; this receipt separates
the owner's attestation from observed Vercel scope and successful provider
transport.
