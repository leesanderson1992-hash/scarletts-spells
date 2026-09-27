# Contextual feedback evidence — Stage 0B implementation

Stage 0A was committed separately as `adf6445`. Stage 0B leaves
`writing_context_advisory_control.ai_mode` at `disabled` and `enabled=false` by
default. No provider call, hosted migration, Preview, or rollout is part of
this receipt.

## Immutable lineage

The contextual worker records one completed, versioned detector set after it
has indexed all extracted occurrences. Detector membership is transactional;
an interrupted run cannot claim complete coverage. The existing S6
`writing_known_spelling_batches` and checks supply spelling-detector version
and completion evidence. Exact parent-added spelling rows are marked in their
existing review path; unlinked legacy rows remain reviewable but cannot count
as detector misses.

AI attempts and observations retain Stage 0A provenance. Stage 0B links each
new attempt to the complete detector run and family-registry version, and
records whether a provider request was sent. Parent-to-AI
comparisons bind to the observation referenced by the parent decision, or to
the shadow attempt captured with an independently parent-added case. The
derived view retains historical superseded decisions and marks the current
decision. `NOT_ASSESSED` and missing links never enter accuracy denominators.

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
denominators; they are not population recall. Model reason codes are
model-proposed context labels, not adjudicated context-subtype truth.

New tables hold occurrence references, small canonical word members,
fingerprints, bounded statuses, versions, token counts, and cost estimates.
They do not duplicate paragraphs, provider text, reasoning, or parent notes.
Durable lineage follows the governed snapshot/child deletion lifecycle.
Transport failures are retained only as bounded reason codes in the attempt
fact; this stage adds no raw provider error log. Aggregates contain no learner
prose. A research candidate remains only a pointer until separate consent,
privacy review, additional adjudication, and frozen corpus manifest work is
explicitly approved.

No parent correction rewrites the prompt, fine-tunes the model, changes a
global deterministic rule, or activates a new family. Improvement follows
evidence → aggregate → review → benchmark → governed release.

## Verification and activation

The disposable PostgreSQL proof applies both migrations and covers run
completeness, exact parent-added cases, family rejection, scope ownership,
repair-only and ADLE guards, catalog routing, and spelling misses. TypeScript,
focused lint, AI safety regressions, contextual review regression, free-writing
Gold evidence regression, and learner-evidence regression were run locally.

Stage 1 still requires approved provider treatment of children's writing,
versioned rate-card configuration for cost reporting, migration and RLS
verification in the intended environment, operational monitoring, and a
disposable end-to-end staging proof. Shadow attempts remain service-only.
Stage 2 needs separate approval, parent/child staging proof, and rollback
drill. Stage 3 authority is not implemented.
