# Adult-writing context resolver

Status: the Production synthetic website proof passed for passage-wide Luna
findings alongside spelling, including there/their/they're and confusables.
The owner-approved 15-second provider deadline, indexed source-word contract and
exact-occurrence focus/scroll repair are released. AI finishes disabled with
policy scope DENY; this is not broad adult activation. See the
[website receipt](qa/luna-synthetic-website-proof-2026-09-30.md) for exact application
identities, costs, verification limits, remaining notice/spelling-review issues
and the deliberately retained synthetic review fixture. Historical Stage 1A/1B
receipts retain their original release identities.

## Product path

This release is for adult-authored fictional writing. `child_id` and
`parent_user_id` remain internal account/ownership names and visible Child/Parent
wording remains for launch. The Luna request contains a bounded writing excerpt,
an opaque case hash and the structured-output schema; it contains no account ID,
parent note or task metadata. Internal account labels are not sent to OpenAI.
If the product later serves minors, review actual use against the provider's
[under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance).

Submission writes the immutable source; spelling processing remains independent.
The context worker indexes authored occurrences and scans at most three non-overlapping
3,000 UTF-16-character windows per submission. Work that exceeds those bounds,
cannot be proven authored, or fails source/hash/occurrence checks receives no
partial Luna scan. The reviewer can still use Add word manually. A structured
Luna receives the bounded passage plus an ordered list of its authored words.
Each complete request, including indexed words, prompt and schema, must also fit
the 16,000-byte request cap. Three text windows do not by themselves
establish that a submission fits that separate bound.
It returns a zero-based request-local word index, observed word and correction;
the server validates that reference against the immutable source occurrence and
uses the stored UTF-16 span. The model never calculates character coordinates.
Duplicate references, mismatched words, source/hash failures and invalid
corrections reject the whole response. Spelling highlights remain yellow; validated context
findings appear blue and link from the combined Review table to the exact answer.
Save records the reviewer’s correction and shows Confirmed, including after
reload. The correction stays editable before send-back. The reviewer may dismiss
with × or restore the suggestion. Non-dismissed
findings become pending repair issues when Send back is pressed. The existing
returned-work Review table shows context and spelling retries in the same Word,
Correction, Retry, Source, Status, Reason, Learning route and Actions columns.
Returned context Details reconstructs a short excerpt around the exact original
occurrence from its saved source, after ownership, task, hash and span checks.
The retry remains a separate submission and its writing is not marked with
historical findings.
Choosing a context reason saves an editable draft; confirming the outcome is a
separate action against the original occurrence and the writer's retry. A governed
family can use only its active assigned microskill. Other context pairs remain
repair only and enter the existing No matching skill Admin queue. A prompted
retry alone does not create mastery or reward credit.

A definite HTTP 429/5xx response may offer one explicit, separately budgeted
Try again action. Successful windows are not rescanned. A timeout, ambiguous
send, missing receipt, identity/cache mismatch or source failure cannot be
retried through that action. No transport retry is automatic.

## Disposable passage proof

The private `proof_scan_kind` policy field defaults to `FOUR_FAMILY`, retaining
the original Stage 1B fault-proof route. `PASSAGE` is allowed only with
`DISPOSABLE_BOOTSTRAP` and `DISPOSABLE_PROVIDER_PROOF`. The database stamps
proof-source classification from a prior operator-owned registration; the
worker repeats the policy check and reservation/admission repeat the registered
source, owner and task checks. A proof-only passage scan can therefore use the
same worker and provider adapter as adult writing while ordinary sources remain
outside the proof policy. A proof 429/5xx is an operational bootstrap failure
and stops processing; the adult-only explicit Try again action is unavailable
to a disposable source. The canonical stop leaves AI disabled and retains the
immutable audit and non-personal consumption records. A later policy reset
must set `proof_scan_kind=FOUR_FAMILY` along with `dispatch_scope=DENY`.

## Provider and privacy basis

This adult release uses **standard OpenAI API retention**, not ZDR. New provider
approval rows state `retention_mode=STANDARD_API` and `zdr_verified=false`;
historical ZDR rows retain their original truth. Standard API data is not used
for model training without an opt-in. `store:false` avoids ordinary saved
Responses state, but standard abuse-monitoring logs may contain customer content
for up to 30 days, subject to documented exceptions. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

The owner records the actual OpenAI organisation/project, project-scoped key
version reference, disabled voluntary data sharing, contractual/retention
acceptance and a dated source for the genuine Luna default-tier rate card.
Secret values never enter the repository, Preview, browser, API output or logs.
The server-only request uses `/v1/responses`, `gpt-6-luna`, default tier,
`store:false`, no tools/background mode, explicit cache mode, one HTTP send,
a 15-second full-body deadline and 50-second worker budget and no automatic retry.
The three-window limit, 16,000-byte request cap and worker budget are a local amendment awaiting release;
the historical website proof above establishes the previous two-window runtime.
The amended runtime is `CONTEXT_SHADOW_DISPATCH_V8` and requires matching configuration
and runtime fingerprints in the deployment and its approval/policy before activation.
Deployment method: unique forward migration
`20261001100000_increase_context_request_cap.sql`, followed by matching application
and configuration release while AI remains disabled. The migration aligns the
dispatch constraint and conservative cost reservation with the larger request;
existing spend caps must cover that bound before any new admission.
The [model page](https://developers.openai.com/api/docs/models/gpt-6-luna)
lists Responses and structured-output support; the [pricing page](https://developers.openai.com/api/docs/pricing)
is the rate-card source, not the isolated test fixture.

The writer sees a conditional OpenAI disclosure before submitting. The release
assumes all active writers are adults and the submitted text is fiction. Authored
text may itself contain personal details; account metadata is omitted from the
request, but this is not a claim that every excerpt contains no personal data.

## Owner release control

The single owner configures the private `ADULT_RELEASE` policy with
`dispatch_scope=REAL_LEARNER`, a current immutable provider approval and rate
card, an expiry, `max_concurrent=1`, and a shared Production daily spend cap no
greater than **$0.50 UTC**. The request-count cap cannot exceed the number of
whole per-request reservations that fit under that daily cap. The per-request
reservation must cover the worst-case 16,000-byte request, 2,048 output tokens
and the highest input/cache rate on the signed card. Reservation and final
admission repeat identity, ownership, source and budget checks. The database
records the adult submission authority automatically; the reviewer has no
separate guardian approval task. Revocation remains effective and cannot be
recreated silently for the same policy version.

The forward migration creates no approval, credential, card, fixture or active
policy and finishes false/disabled. For release: verify exact SHA and migration
hash, apply the additive migration with AI disabled, deploy that exact SHA,
read back schema/control and access restrictions, configure server-only
credentials and owner-signed policy, complete a synthetic website proof, then
activate `ai_mode=shadow` for the adult scope. Stop via the canonical kill
switch for leakage, duplicate send, accounting loss, model/tier/cache mismatch,
budget breach, ownership failure or broken review/return behavior. Preserve
durable consumption and immutable approval/card/policy history. No automatic
application down migration or unreviewed provider request is a recovery step.
