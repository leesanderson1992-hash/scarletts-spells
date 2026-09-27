# AI contextual advisory safety gate — Stage 0 implementation

This branch adds an API-backed advisory route behind the existing parent
contextual review. The default database `ai_mode` is `disabled`; the existing
`enabled` switch remains false by default. This receipt records code and local
verification only. No hosted migration, learner-text API call, Preview,
production enablement, or Stage 1/2 approval occurred.

The frozen prompt and schema are copied without changes. Their application
hashes are asserted against the research hashes in the safety-gate regression.
The repeatability aggregate receipt is tracked separately. Raw case-level
provider output stays in the ignored research run area.

## Runtime boundary

- `disabled`: no AI call. If the existing global review switch is deliberately
  enabled with AI disabled, the pre-existing frozen V4 advisory path remains
  selected; it is still subject to its separate hosting gate.
- `shadow`: snapshot capture and service-only attempt rows are allowed while
  `enabled=false`. The parent review read model and child view see no AI result.
- `parent_advisory`: requires `enabled=true`. An AI attempt can project an
  immutable advisory observation, but only an authenticated parent decision
  can create the existing contextual repair issue and governed learning need.
- `disable_writing_context_advisory` atomically sets `enabled=false` and
  `ai_mode='disabled'`. Existing facts remain durable.

Only verified learner-authored paragraphs of at most 600 UTF-16 units are sent.
Unknown authorship, bad span/hash, overlong paragraphs, provider failure, and
contract failure become `NOT_ASSESSED`. The provider receives no learner ID,
name, task instructions, or complete multi-paragraph submission. The adapter
requires `OPENAI_API_KEY` and an exact
`CONTEXT_AI_PROVIDER_RETENTION_APPROVED=approved` setting, sends `store:false`,
and never logs raw source or output. This environment setting records that the
operator has separately confirmed the provider's retention terms and approved
their use for children's writing; it does not itself establish those terms.
The worker indexes extracted occurrences even when none belongs to the four
AI families, so later exact parent feedback can refer to the original span.
Attempt facts retain requested and returned model identities, full input and
cached-input token counts, and any declared decision as untrusted telemetry.
Cost is estimated only when a named rate card and all three input, cached-input,
and output rates are configured; otherwise it remains unavailable.

## Activation prerequisites

Before Stage 1, approve the provider retention posture, apply and verify the
additive migration in the intended environment, set the shadow mode while
review remains off, and run a disposable staging end-to-end proof. Record
availability, latency, cost, coverage, contract failures, gate failures, and
decision distributions. Before Stage 2, review those operational results,
prove the parent/child decision and repair flow plus rollback, then explicitly
authorise `parent_advisory` with the existing review switch on. Stage 3 has no
implementation or implied authority.
