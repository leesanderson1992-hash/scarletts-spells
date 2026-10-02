# Full-G2 primary synthetic Batch design — 2026-09-26

The calibration receipt authorises `gpt-6-luna` at `reasoning.effort=low`
for one fresh, 1,600-request Batch. This is development research on the full
project-authored G2 corpus, **not** an unseen holdout or learner-writing trial.
It has no production or educational-policy authority.

`primary-batch.mjs` reads the eight candidate/gold files locked by
`calibration-subset.json`, verifies their SHA-256 values and the G2 package
fingerprint, and includes each of the four families exactly once: 400 cases per
family, with 150 gold VALID, 150 gold INVALID and 100 gold UNCERTAIN. It calls
the existing `requestFor(row, "low")`; the overlap test confirms byte-equivalent
request bodies for all 240 calibration cases. Those cases are **sent again**;
no calibration response is substituted into the primary result set. The
prompt, schema, request settings, `store:false`, focus-span integrity and
semantic-contract scoring policy are unchanged.

The generated ignored input has SHA-256
`93557ffe39b89f3759b959b819d887bccf2f5de6f6944099b73d0eab56c10728`,
4,503,658 bytes and 1,600 unique `custom_id` values. The full-corpus manifest
fingerprint is
`89bf7283a26c1d0b61b8eb75cf0e180ca47f12580bd42968d6b0d12719a97401`.
The input and manifest live only in the ignored `primary-batch/` run area.

## Queue and cost preflight

OpenAI documentation currently lists a 5,000,000 queued **input/prompt-token**
Tier-1 limit for GPT-6 Luna. It is not an output-token cap. The calibration's
240 `low` responses reported 116,129 input tokens for 649,717 serialized
request-body bytes. Scaling that measured ratio to this Batch's 4,327,258
request-body bytes gives an estimated 773,445 queued input tokens. Taking
**three times the maximum individual calibration token/byte ratio** gives a
conservative empirical estimate of 2,351,805 tokens. This is an estimate,
not a guaranteed tokenizer bound; the provider can reject the Batch if other
jobs consume queue capacity. The earlier coarse byte-plus-1,000-per-request
quantity is 5,927,258. It is preserved in the manifest for transparency, but
counts UTF-8 bytes as if tokens and is not a measured token quantity. No
calculation was reduced merely to appear under the queue limit.

The usage-based Batch cost estimate is $0.11704, including an output-token
estimate derived from calibration `low` usage. A deliberately high spending
preflight uses 10,000 input tokens and the request cap of 2,048 total output
tokens per case, charging all input at the cache-write rate; it yields $1.81920.
Together with prior calculated synchronous and calibration Batch spend
($0.07636305), this is below the existing $2.00 local stop. Actual charges
will require returned usage, including reasoning tokens; neither estimate is
an invoice.

Sources: [GPT-6 Luna model limits and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Batch API queue semantics](https://developers.openai.com/api/docs/guides/batch),
[input-token queue accounting](https://developers.openai.com/api/docs/guides/rate-limits).

## Fail-closed submission

The upload command requires an exact input-SHA approval and claims ignored
local state before network activity. A failed or ambiguous upload must be
reconciled by listing plausible files and downloading one unique candidate for
exact SHA-256 and byte comparison; it must not be retried automatically.
Submission similarly requires a verified file, an explicit documented Tier-1
queue-limit attestation, and a one-use local claim before the create request.
This does not claim to know the project's live remaining queue capacity; the
provider may reject the Batch if other jobs are queued. An ambiguous
Batch creation must be reconciled remotely, not retried. After one creation,
retrieve status once; do not collect or score in the submission turn.

Future output validation must preserve the frozen distinction: manifest,
case-identity, fingerprint and focus-echo failures block scoring; parseable
semantic `MODEL_CONTRACT_VIOLATION` outputs stay raw, count as unsuccessful
outcomes in their denominators, and retain their declared decision in the
ordinary three-way confusion and safety counts. Calibration and primary
results remain in separate ignored run areas.
