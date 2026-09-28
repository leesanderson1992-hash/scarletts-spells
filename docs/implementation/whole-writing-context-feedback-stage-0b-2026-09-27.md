# Contextual feedback evidence — Stage 0B implementation

Stage 0A was committed separately as `adf6445`. Stage 0B leaves
`writing_context_advisory_control.ai_mode` at `disabled` and `enabled=false` by
default. No provider call, hosted migration, Preview, or rollout is part of
this receipt.

## Corrective audit history — 2026-09-28

The initial Stage 0B implementation was committed as `0e65731` and `a1fe63e`.
A subsequent audit returned `STAGE_0B_FIX_REQUIRED`: partial spelling replay
scopes could count unassessed misses; detector identity could drift from the
reviewed AI attempt; research pointers blocked source deletion; superseded
misses remained in current recall; and comparable AI denominators were not
explicit. Those findings were real defects in the initial implementation.

The bounded corrective pass adds
`20260928120000_correct_context_feedback_evidence.sql`. The earlier committed
migrations and commits remain unchanged. No hosted migration state was queried
or changed. Corrections below describe the corrective tree, which remains
uncommitted pending review. They do not imply that the initial commits already
implemented them correctly.

## Immutable lineage

The contextual worker records one completed, versioned detector set after it
has indexed all extracted occurrences. Detector membership is transactional;
an interrupted run cannot claim complete coverage. The existing S6
`writing_known_spelling_batches` and immutable checks supply spelling-detector
version, explicit assessed-occurrence membership, and completion evidence.
A spelling miss requires a completed run, a complete batch of checks, and a
check for that exact learner occurrence with disposition `NO_MAPPING` or
`ABSTAINED`. Check-count equality validates the declared batch, not full-snapshot
coverage. Partial replays can contribute only for their own checked occurrences;
same-snapshot occurrences outside that set are not comparable. Exact
parent-added spelling rows remain on their existing review path. Unlinked
legacy rows and interrupted/incomplete runs cannot contribute misses.

AI attempts and observations retain Stage 0A provenance. Stage 0B links each
new attempt to the complete detector run and family-registry version, and
records whether a provider request was sent. Parent-to-AI
comparisons bind to the exact observation submitted by the parent, including
a historical observation that passes occurrence/ownership/family validation.
An invalid submitted identity is rejected; it never silently becomes null.
The observation's attempt supplies detector and registry identity. A parent-added
case binds its shadow attempt once; its decision and detector link use that
same attempt. A newer attempt or detector run cannot replace this relationship.
New decisions explicitly retain the attempt link. Existing immutable decisions
are not backfilled or rewritten: historical comparisons derive AI detector
identity from the original linked attempt and report missing provenance as
missing, rather than inventing it from a newer run.

The derived view retains superseded decisions and marks the current decision.
Current contextual recall counts a parent-added miss only while its current
parent decision is `INVALID`. Superseding it with `EXCLUDED`, `VALID`, or
`UNCERTAIN` removes that current miss; the original decision and historical
`PARENT_ADDED_MISS` classification remain reconstructable.

## Parent truth and educational effects

The parent contextual addition action checks ownership, immutable field hash,
exact observed span, Unicode boundaries, and learner authorship. A known
four-family correction creates the existing append-only contextual parent
decision and repair issue even while the AI switch is off. A new pair creates
a learner/event-scoped parent case and repair issue, plus a distinct source
in the existing `No matching skill` Admin workflow. The legacy
`contextual_advisory_v4` issue tag remains a repair-workflow discriminator;
`feedback_origin=parent_added` identifies human provenance.

Unknown-family child retries can be parent-classified through a dedicated
repair-only transaction. Database guards prevent those cases from creating
contextual ADLE handoffs or ADLE items. The four governed families retain
their existing microskill and handoff checks. None of the new metrics or
research-candidate facts writes learning, rewards, proficiency, retirement,
or authentic-use evidence. Existing contextual word exclusions and prompted
repair exclusions continue to govern Gold and authentic-use paths. Because
free-writing Gold candidates are currently word-level, the confirmation path
conservatively excludes both members of a parent-added contextual pair in the
same submission, including candidates detected before the parent action.

## Analytics and privacy

Admin aggregates separate candidate routing, known-spelling detection,
AI-versus-parent classification, and provider operations. Routing exclusion
is distinct from a parent marking a valid family word correct. Recall values
are reviewed-scope proxies over complete detector runs, with visible
denominators; they are not population recall. AI aggregates expose:

- total reviewed: all current parent decisions, including missing AI evidence;
- comparable: decisive parent `VALID`/`INVALID` truth paired with gate-passed
  AI `VALID`, `INVALID`, or linguistic `UNCERTAIN`;
- excluded: parent `EXCLUDED` outcomes;
- unresolved: non-decisive parent outcomes with otherwise assessable AI evidence;
- not comparable: missing AI evidence or operational `NOT_ASSESSED`, except
  cases already classified as excluded;
- operational `NOT_ASSESSED`: a separate diagnostic count, which may overlap
  an excluded outcome and never enters comparable.

Comparable, excluded, unresolved, and not comparable partition total reviewed.
Linguistic abstentions resolved by the parent remain visible within comparable;
they are not converted into operational failures. The UI currently reports
counts, not an AI accuracy percentage. Any future AI agreement/accuracy rate
must declare its numerator and intended comparable denominator; total reviewed
is coverage, never that denominator. Recall is confirmed / (confirmed + exact
misses); reviewed false-positive rate is rejected / (confirmed + rejected).
Model reason codes are
model-proposed context labels, not adjudicated context-subtype truth.

New tables hold occurrence references, small canonical word members,
fingerprints, bounded statuses, versions, token counts, and cost estimates.
They do not duplicate paragraphs, provider text, reasoning, or parent notes.
Research-candidate foreign keys cascade when their parent decision or
parent-added case is deleted through the governed snapshot/occurrence lifecycle.
The candidate is removed, not retained as an orphaned benchmark truth. Existing
learning-handoff lifecycle restrictions remain unchanged. Durable lineage follows
its governed source while that source exists.
Transport failures are retained only as bounded reason codes in the attempt
fact; this stage adds no raw provider error log. Aggregates contain no learner
prose. A research candidate remains only a pointer until separate consent,
privacy review, additional adjudication, and frozen corpus manifest work is
explicitly approved.

No parent correction rewrites the prompt, fine-tunes the model, changes a
global deterministic rule, or activates a new family. Improvement follows
evidence → aggregate → review → benchmark → governed release.

## Verification and activation

The disposable PostgreSQL proof applies the frozen Stage 0A and Stage 0B
migrations followed by the additive correction. It covers run
completeness, exact parent-added cases, family rejection, scope ownership,
repair-only and ADLE guards, catalog routing, and spelling misses. TypeScript,
focused lint, AI safety regressions, contextual review regression, free-writing
Gold evidence regression, and learner-evidence regression were run locally.
The corrective proof additionally covers the one-occurrence partial-batch
counterexample, full and incomplete assessed scopes, old-observation/new-run
lineage, fixed shadow binding, historical supersession, known/unknown promoted
snapshot deletion, current miss removal, and explicit denominator buckets.
A separate mocked action-link regression proves historical observation
preservation and rejection of foreign identities. The Gold regression also
proves that a pair exclusion does not carry into a future submission.

Corrective validation on 2026-09-28: the disposable database proof (all five
defect regressions, plus unchanged-fact historical lineage), app TypeScript,
script typecheck, focused ESLint, AI safety-gate, mocked provider-boundary,
disabled/no-call, contextual advisory, historical observation-link, Stage 0B
Gold, free-writing evidence, learner-evidence, S7 exact/repeated occurrence,
and `git diff --check` checks all passed. Unknown-family handoff/item rejection
and repair-only finalisation were re-proved after applying the corrective
migration locally. The disposable control finished disabled.

The database harness uses a disposable reduced schema with relevant source
foreign keys; it is not a full migration-history or browser staging proof.
Provider-boundary tests use mocked transport. No authentic learner writing,
provider call, benchmark run, hosted migration, or activation is part of them.

Stage 1 still requires approved provider treatment of children's writing,
versioned rate-card configuration for cost reporting, migration and RLS
verification in the intended environment, operational monitoring, and a
disposable end-to-end staging proof. Shadow attempts remain service-only.
Stage 2 needs separate approval, parent/child staging proof, and rollback
drill. Stage 3 authority is not implemented.
