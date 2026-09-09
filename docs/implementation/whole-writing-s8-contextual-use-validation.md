# Whole-writing S8 — contextual-use validation

> Ordinary-writing successor: see
> [S8 V3 ordinary-writing coverage](./whole-writing-s8-v3-ordinary-writing-coverage.md).
> V3 adds independently versioned engineering coverage and does not alter the
> V1/V2 releases documented here.

## Status and authority

S8 is implemented from clean S7 commit
`f2a9ae72fbce3af0b4a3ccb3b0e2ebcd974136de` on
`codex/s8-contextual-use-validation`. The frozen E1/S5 release candidate at
`adfbd571aa0811fe8d224b34310ed086864736d7` remains unchanged.

S8 adds a deterministic, independently versioned context layer for four
enumerated families:

- `there / their / they're`;
- `to / too / two`;
- `your / you're`;
- `its / it's`.

Immutable source snapshots, indexed occurrences, E1's current lexical
interpretation, canonical dictionary identities, audited context-required
mappings, S5 shadow assessments and the existing S6–S7 parent/retry route keep
their current authority. A lexical identity is not a contextual decision, and
a contextual decision is not qualified learning evidence.

The unconfirmed Context Resolver proposal was not modified, imported or adopted.

## Source and result contract

The analyser reconstructs the exact learner-authored field from the immutable
snapshot's JSON Pointer. The stored field hash, UTF-16 span and observed surface
must all match. It never joins separate responses, substitutes a current task
definition or changes occurrence identity.

Each selected family release pins a registry version, analyser version, corpus
version, enumerated members, supported constructions, exclusions and manifest
fingerprint. Results are append-only and state `NOT_ASSESSED`, `VALID`,
`INVALID` or `UNCERTAIN`, with their exact lexical interpretation, release,
scope, rule, reason, alternatives and authority fingerprints.

`VALID` applies only to the supported family construction. `INVALID` requires a
unique supported alternative. Ambiguous constructions, fragments, quoted word
forms and unavailable source context abstain. Unknown forms are not converted
into spelling errors. The implementation contains no runtime AI.

## Current selection and recovery

Migration `20260907120000_add_whole_writing_context_validation.sql` adds:

- family releases, append-only selection events and append-only G2 approval
  events;
- isolated context jobs with bounded claims, retries and stale-lease recovery;
- immutable historical results and a current-result view;
- exact-occurrence review delivery and decision receipts;
- a service-only current eligible-delivery view and aggregate observability.

A result is current only when it references E1's current lexical interpretation
and the currently selected context release for that environment and family.
Older or late results remain historical. A changed E1 interpretation or context
release schedules only the affected occurrence. Processing uses the existing
recovery endpoint but has its own claims and failure boundary, so a context
failure cannot invalidate submission capture or completed S5 work.

The migration seeds the four shadow releases and selects them independently in
local, staging and production environments. It grants no family quality
approval and enables no learner or parent control.

## Parent review adapter

The adapter materialises a suggestion only when all of these facts are current:

1. the learner/cohort has `context_review_enabled`;
2. the context result is `INVALID`;
3. the exact family, rule and corpus release has a current G2 approval record;
4. one visible, audited `context_required` canonical mapping identifies the
   alternative and an active assignable D4 micro-skill;
5. no conflicting skill mapping, existing occurrence-linked spelling finding
   or previous context delivery exists.

The parent sees the exact source occurrence and excerpt under **“Correctly
spelled; possibly the wrong word here”**. Confirming creates or reuses the
existing occurrence-linked misspelling, suggestion and pending review issue.
The parent still chooses the learning reason and sends work back through the
existing S6–S7 flow. “Not an issue” records a decision without creating a
correction item. Actions recheck current controls, approval, release and mapping
authority on the server.

The existing parent-added missed-word action now obtains display context from
the selected occurrence's immutable source field. Legacy flattened offsets are
written only when exact text correspondence is proven.

## Controls, observability and rollback

The three controls are independently default-off:

- `context_processing_enabled`;
- `context_retrospective_enabled`;
- `context_review_enabled`.

Family releases and G2 approvals are separate append-only selections. Rollback
disables processing or review, or selects a prior/withdrawn release. Source
history, analysis history and human decisions remain intact.

`writing_context_observability` reports environment, family, job state, result
state, reason, count, oldest age and maximum attempts without exposing raw
writing. Raw excerpts appear only in the service-backed admin evidence report
and the owning parent's eligible review page.

## Learning boundaries and owner gates

S8 does not write S5 assessments, Authentic Use, Gold Bars, proficiency,
learning levels, review schedules or retirement state. A successful child retry
remains repair rather than independent contextual mastery.

G2 policy is resolved by
`WHOLE_WRITING_REMEDIATION_POLICY_V2_2026_09_09`, but approval remains required
per exact family, rule release and adjudicated corpus before parent delivery can
activate. The current 30 engineering cases do not count toward the required
400-case family corpus.

G1, G3 and G5 are resolved respectively by
`WHOLE_WRITING_VERIFICATION_POLICY_V1_2026_09_08`,
`WHOLE_WRITING_MIXED_OUTCOME_POLICY_V1_2026_09_08`, and
`WHOLE_WRITING_HISTORICAL_EFFECTS_V1_2026_09_08`. Their runtime interfaces and
shadow qualification remain S9 work. Retrospective context processing remains
shadow-only. Runtime AI and additional families are separate future releases.

## Local verification

The deterministic regression covers valid, invalid and abstaining cases in all
four families, Unicode apostrophes, quotations, gerund counterexamples,
sentence boundaries, unsupported near-homophones, repeated occurrences, stable
identity and exact immutable-field reconstruction.

The disposable PostgreSQL proof applies the S8 migration unchanged and verifies
job ownership, atomic claim exclusion, append-only results, current-versus-
historical interpretation selection, approval gating, audited mapping gating,
service-only access, exact occurrence lineage and idempotent parent decisions.
It makes no external database connection.

Run these focused proofs with:

```text
npm run writing:s8-regression
WRITING_PROOF_RUNTIME=/tmp/scarlett-writing-proof-runtime npm run writing:s8-db-proof
```

## Preview and disposable staging receipt

The complete S8 journey was verified on 7 September 2026 against runtime-code
commit `9dc8b3bd3cdec50dff5687186b96b45e9e07e4b2` and Vercel Preview deployment
`dpl_424Bt8QG8yTnSgHTjt4qo6dwHVpB`:

```text
https://scarletts-spells-staged-3zm4lxpz8.vercel.app
```

Vercel reported the deployment as `READY`, target `Preview`, for branch
`codex/s8-contextual-use-validation` and the exact runtime-code commit above.

The guarded migration runner applied only migration `20260907120000` to the
fixed staging Supabase project `jlhotktspjvffslvuyfz`. Its checksum was
`b235fd8a99b077f4596519cd8ecb168b15460cc310158ea002a4e71d00657c1d`.
Immediately after application, staging contained four family releases, twelve
environment/family selection events, no approval events and no enabled S8
controls.

The disposable browser and database proof then established:

- the parent received the exact occurrence and original sentence for an
  eligible contextual suggestion;
- the parent confirmed the proposed intended word and sent the work back;
- the child corrected the sentence, completed the separate retry and submitted
  successfully;
- the persisted retry outcome was `correct`, while assistance and answer
  visibility remained `unknown`;
- the parent decision, correction attempt and source occurrence retained exact
  compatibility lineage;
- counts for learning items, coins, Gold Bars, Authentic Use and review
  schedules did not change.

The proof enabled one learner-scoped control set and installed one temporary
mapping and one temporary family approval. Cleanup disabled and removed those
facts and deleted the disposable account and owned records. A separate
read-only check confirmed zero proof users, proof approvals, proof mappings,
enabled context controls and currently approved staging families.

No Production deployment or Production database migration was run. The frozen
E1/S5 release candidate and `origin/main` were not changed by this verification.
