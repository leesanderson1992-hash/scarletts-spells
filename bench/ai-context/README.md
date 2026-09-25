# AI contextual-analysis calibration — experimental only

This isolated benchmark uses only the project-authored, human-labelled frozen G2 corpus. It never reads V3 ordinary-writing or V4 fresh-holdout learner prose. No application code, frozen V4 analyser, database, feature flag, or deployment is involved.

## Fixed evidence and task

`calibration-subset.json` lists every exact case ID and locks the candidate and human-gold files by SHA-256. Selection is deterministic: for each of four families, 20 unprotected VALID cases, 20 unprotected INVALID cases, and four protected UNCERTAIN cases for each of fragment, quotation, gerund, run-on, and task-dependent. This is 240 distinct cases, each sent once at `none`, `low`, and `medium`: 720 planned requests. The API receives source text, family members, and the authoritative UTF-16 focus. It receives no gold answer or protected tag.

`prompt.txt` is the complete system prompt. `response.schema.json` is the strict output contract. `calibration.config.json` fixes the model and all request settings except reasoning effort. The focus field is an integrity echo; the model is not discovering an error span. A different, later benchmark would need to withhold the focus span to measure discovery.

The JSON response must contain `case_id`, `decision`, `focus`, `observed_form`, `expected_form`, and `reason_category`. A focus boundary or focus-text mismatch is malformed. On INVALID, `expected_form` must be a different canonical member of the supplied family; otherwise it must be null.

## Offline verification and future execution

```sh
node bench/ai-context/build-subset.mjs
node bench/ai-context/calibrate.mjs verify
node --test bench/ai-context/calibrate.test.mjs
```

These commands make no API calls. `verify` checks source hashes and response-request byte sizes. The runner has a separate `execute` command that requires both `OPENAI_API_KEY` and `AI_CONTEXT_CALIBRATION_APPROVED` set to the subset fingerprint. Do not use it before explicit approval of this calibration. No environment file or run output is tracked by Git. `store:false` is requested, and explicit-only prompt caching has no cache breakpoint.

Each completed response is appended under ignored `runs/` with requested and returned model/tier, prompt/schema/config hashes, case and gold fingerprints, raw structured text, parsed result, expected result, latency, provider usage, total output tokens, reasoning tokens, cached input tokens, and calculated USD charge. Reasoning tokens are a subset of total output tokens, and are charged once within that total. Any response lacking usable accounting stops the runner. The provider invoice remains authoritative if pricing or usage metadata differs.

The offline scorer reports three-way accuracy, INVALID precision/recall, false-positive and false-negative rates, VALID→INVALID, UNCERTAIN→INVALID, protected UNCERTAIN→INVALID, wrong alternatives, protected abstention by tag, malformed/refusal rate, latency, token usage, and cost, overall and by family. Calibration results are separate from the later 1,600-case primary benchmark and do not enter its denominators.

The effort recommendation will be returned for approval after calibration. Safety comparisons are predeclared: any extra unsafe INVALID, protected abstention failure, wrong alternative, or malformed/refusal is material. For recall, a deficit of more than two of 80 INVALID cases overall or more than one of 20 in any family is material. Among efforts within those limits, choose the lowest measured cost; no effort is selected automatically if safety results are poor.

## Separate Batch transport (not submitted)

`batch-calibrate.mjs` reuses `requestFor` without changing the locked prompt, schema, subset, gold or scorer. The recommended Batch design runs all 720 evaluations afresh, giving one internally consistent Batch calibration. The existing 234 metered synchronous results remain in ignored `runs/`; Batch input, manifest, state, raw output and results are confined to ignored `batch/`. A SHA-256 sidecar records the preserved synchronous file without rewriting its rows. No synchronous row enters Batch scoring.

Local-only commands:

```sh
node bench/ai-context/batch-calibrate.mjs prepare
node bench/ai-context/batch-calibrate.mjs verify
node --test bench/ai-context/calibrate.test.mjs bench/ai-context/batch-calibrate.test.mjs
```

The generated JSONL has deterministic `ai-context-cal-v1__<case-id>__<effort>` identifiers and `/v1/responses` bodies exactly equal to synchronous request bodies. It contains only project-authored synthetic G2 text, no tools, and `store:false`. `prepare` and `verify` make no OpenAI API calls. The input SHA-256 is the explicit approval fingerprint for later `upload` and `submit` commands; those commands also require a local API key. Do not run them before separate Batch submission approval.

Published Tier-1 GPT-6 Luna Batch queue limit: 5,000,000 queued input/prompt tokens. The local preflight is 720 requests, 2,027,571 JSONL bytes, and a conservative queued-input estimate of 2,670,111 tokens (all 1,950,111 request-body UTF-8 bytes plus 1,000 tokens of allowance per request). This is deliberately above the approximately 351,222 prompt tokens projected from the 234 completed synchronous responses, but is not a provider token count. Both estimates are below the documented 5,000,000-token limit. Output-token capacity and cost are accounted for separately; output tokens are not part of the queued-input-token limit. Before submission, the operator must attest a live available queue capacity of at least the conservative estimate through `AI_CONTEXT_BATCH_AVAILABLE_QUEUE_TOKENS`; otherwise `submit` fails closed. Other pending Batch jobs or a project-specific limit may reduce availability. No automatic split is allowed.

Batch pricing uses $0.05 per million uncached input tokens, $0.005 cached input, $0.0625 cache-write input, and $0.25 total output tokens including reasoning. On the partial synchronous sample, illustrative Batch cost for 720 requests is approximately $0.046. The deliberately conservative billing envelope is $0.818640 (the approved 10,000-input-token allowance per request, all charged at the cache-write rate, and 1,474,560 output tokens at the configured cap); with existing synchronous spend of $0.029849, the combined envelope is $0.848489, below the $2.00 experimental stop. This is a planning envelope, not an enforced provider-side hard cap. Actual Batch usage and pricing must be accounted for from each result; the provider invoice remains authoritative.

After approval, lifecycle commands are `upload`, `submit`, `status`, `collect`, and `score`. Upload creates a local exclusive state claim before any network action. Submit requires a separately exclusive claim before creating a job, and records the Batch ID immediately on success. A crash or ambiguous network result leaves the claim in place and **does not automatically resubmit**; reconcile it manually with the provider. `status` only polls a recorded ID. `collect` requires a completed Batch with 720 successful request counts, retrieves output and any error file, rejects nonempty errors, missing/duplicate/unexpected custom IDs, bad model/tier/usage, and changed fingerprints. It scores only after the full output is present and validated. Provider errors are reduced to status/type/code in terminal output; credentials and request text are never printed. File contents and results remain local and Git-ignored.

Official references: https://developers.openai.com/api/docs/guides/batch ; https://developers.openai.com/api/docs/models/gpt-6-luna ; https://developers.openai.com/api/docs/pricing

## Cost envelope

OpenAI's published GPT-6 Luna Standard rates are $0.10 per million input tokens, $0.01 per million cached input tokens, $0.125 per million cache-write tokens, and $0.50 per million total output tokens. With 720 requests, a deliberately generous allowance of 10,000 input tokens and the configured 2,048-total-output-token cap per request gives $1.63728 even if every input token incurred the cache-write rate. The local spending stop is $2.00. This is a planning envelope, not a measured bill: actual input and reasoning-token distributions will be known only after responses. If pricing, model, tier, or usage differs, stop and review before proceeding.

Source: https://developers.openai.com/api/docs/models/gpt-6-luna
