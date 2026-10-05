# First-submission authentic use

Status: deployed to Production; enabled only for the named Test-child canary.
Policy: `FIRST_SUBMISSION_AUTHENTIC_USE_V1_2026_10_05`.

## Evidence and finalisation

`extractWholeWriting` with the opt-in authentic-use extraction mode indexes eligible lesson responses and the captured child
review summary using immutable snapshots, field hashes, UTF-16 positions and
stable occurrence IDs. It keeps case-normalised word forms, normalises curly
apostrophes, and preserves distinctions such as `its` / `it's`. No dictionary
membership is required. Explicit copied, dictated, fixed-answer and spelling
exclusion metadata is honoured, including nested columns/questions. Unknown
authorship is excluded, retained in the source and surfaced for manual review.
Raw lesson text captured by this feature carries authenticated capture provenance.
The existing default extractor, immutable occurrence version and AI scan inputs
remain unchanged. Extra summary fields require manual review when existing
analysis has not covered them.

The candidate calculator reuses resolver/misspelling records, unified writing
issues, passage AI findings, contextual observations and parent decisions.
Confirmed errors exclude observed and confirmed intended spellings throughout
the submission. Unresolved findings exclude affected observed words. Dismissed
findings do not exclude them. Coverage is checked against the existing passage
window fingerprints; missing coverage or unfinished spelling processing requires
an explicit manual-review checkbox. Every first review also requires a whole-piece
parent confirmation. Manual review does not clear unresolved findings or infer
authorship for unknown fields.

The first submission identity is the earliest submission for parent × child ×
task; retries join the same chain. A unique child × chain × word constraint
enforces the credit cap across fields. The default-off migration does not index
historical submissions. A service-only canary operation attaches submissions
for one explicitly controlled child, and the writing date must still meet that
child's activation cutoff before a credit can be minted.

The service prepares a review with a PostgreSQL facts fingerprint. The
authenticated parent action checks ownership, locks the review inputs, checks
that fingerprint again, and atomically saves the review, credits, two consumer
jobs and parent action. Approval delegates to the existing reason-draft
transaction. Failure rolls back all these writes. Parent action audit events
record finalisation, duplicate suppression and retry suppression. Late analyser
results cannot change finalised credits.

Isolated supplied-word copies/lists are excluded from candidates; supplied
words must occur alongside the child's own writing. Existing context analysis
and parent confirmation still determine whether that use is correct.

Supplied target spellings count in original writing, with `supplied_spelling`
retained on the credit. Original snapshot metadata retains assistance and
authorship information. The downstream event stores parent-verified context,
original writing time, policy and credit identity. The future evidence adapter
treats supplied spelling as scaffolded.

## Consumers and displays

Each credit has independent gold and proficiency receipts with pending,
processing, delivered, ineligible and failed states. Claims use skip-locked
leases; expired leases are recovered. Failure uses bounded exponential retry.
Consumer flags can stop delivery without discarding evidence. The existing
authenticated internal submission-recovery endpoint runs recovery independently
of submission and context recovery; no additional AI call occurs.

The reward-owned consumer locks the Word Treasure. Only original writing strictly
after Forge entry advances it. The fifth eligible use writes one Golden Bar event
and one bar-ledger entry in the same transaction as its delivery receipt. The
stable treasure identity links the award and ledger; the credit ID links the
authentic-use event. Existing bar awards cannot be paid again. Coin conversion
rules are unchanged. Enabled cohorts cannot emit overlapping legacy course/sample
uses; unrelated prompted ADLE practice remains intact.

The proficiency consumer projects mapped credits to existing ADLE authentic-use
storage, then calls the released `PROFICIENCY_POLICY_V1` calculation through the
composer-facts loader. Published positive relationships provide all eligible
word-to-skill links. Breadth/state credit, dictionary and child-band gates,
global complexity bands, allocation targets and bottom-up level gates remain.
Reports retain source credit IDs, policy, input fingerprint, prior saved report
(null for an initial report), and the new report. This does not release the
approved target levelling maths. The existing pilot child-band profile remains
the loader default; callers can supply its existing override.

Identity reconciliation only attaches a unique active en-GB dictionary identity
using the true display spelling. Unmapped credits remain saved. Once mapped,
their proficiency jobs can run. A rotating cohort refresh reads each child's own
history and recalculates after published relationship changes without reopening
gold receipts. It also records downward changes when a relationship is removed
from an otherwise reportable skill. Reports and health are exposed through
parent-scoped security-invoker views; Insights displays saved reports for both
parent and child modes. Reward history and balances use their existing records.

Enabled-cohort proficiency reads paginate retained evidence and dictionary
facts, including histories beyond the default PostgREST row limit.

Delivery is bounded (up to 100 jobs and 10 cohort refreshes per run), with one
calculation per child per batch. Large submissions can leave pending updates
until another recovery run. The current deployment's existing recovery cadence
is retained; verify and tune that cadence before cohort rollout.

## Verification

Run from the repository root:

```sh
npm run writing:authentic-use-regression
npm run writing:authentic-use-db-proof
npx tsc --noEmit
npm run typecheck:scripts
```

The database proof creates a separate PostgreSQL 16 cluster in tmpfs within
`atria-pm-postgres`, creates a UTF-8 proof database, and destroys it afterwards.
It never connects to the container's existing database. Another PG16 Alpine
container can be selected with `--container=NAME`. The fixture uses the real
reward-table constraints but deliberately stubs the existing approval delegate;
it proves this migration's transaction boundary, not a complete hosted review UI.

Candidate regressions cover all-word deduplication across answers and summary,
positions, supplied spellings, exclusions, confirmed intended forms, unresolved
and dismissed findings, manual fallback and independent consumer failures. The
database proof covers replay/retry, stale preparation, ownership, rollback,
post-Forge timing, fifth-use reward writes, independent retry, unmapped history,
multiple/future skill outcomes and service-only delivery permissions. Existing
proficiency/evidence/reward and context regressions remain required.

Production project `wwohrqtunajrbwxyssjf` is the only current hosted database.
Canary operations are pinned to child
`2498bb47-0b09-47c9-bfc1-18f95b52d35c`; the operator refuses another project or
child. The production schema preflight compiles the exact migration in a rolled
back transaction. It must report zero controls, chains and credits before apply.

## Production canary and restricted release

Run the operator with the production pooler environment loaded:

```sh
npm run writing:authentic-use-production-canary -- status
```

The mutation commands require their printed exact confirmation argument. They
are deliberately separate so the schema can remain inert until matching
application code is deployed.

1. Apply `20261005120000_add_first_submission_authentic_use.sql` with
   `apply-schema`. This creates no controls, submission chains or awards, and
   verifies that existing submission and reward row counts did not change.
2. Deploy the matching application code before activating the child. Set the
   named child to `shadow` with both consumers disabled and a current activation
   cutoff. This is the first point at which that child's existing submissions
   are attached to stable chains. Compare saved previews with manually reviewed
   all-word expectations. Legacy reward behaviour remains during shadow; new
   credits are not minted.
3. Use fresh tasks after setting the named child to `enabled` with both consumer
   flags on and the production ADLE route environment configured. Exercise lesson answers and child summary, both parent actions, mixed
   errors, unresolved/dismissed suggestions, supplied target sentences and retries.
4. Prove five post-Forge uses, a pre-Forge piece verified afterwards, failed gold
   delivery, failed proficiency delivery, unmapped words and future positive
   mappings. Reload parent/child Insights and reward history; check credits,
   consumer receipts, skill reports and ledger totals against the writing.
5. Verify the existing completion/reason-draft path and ordinary ADLE practice
   remain usable. Complete the named disposable flow and its reload/replay checks.
6. Keep all other children absent from `authentic_use_controls`. Expand only
   through an explicitly reviewed child list and individual activation cutoffs.
   Keep the target levelling model disabled.

Monitor `authentic_use_delivery_health`, failed receipts, expired leases,
recovery `refreshFailures`, and `authentic_use_review_action_events` duplicate/retry
outcomes. Repeated mapping/read failures remain failed receipts rather than
silent success. Disable each consumer separately for investigation; retain source
credits. Requeue only its failed receipts, respecting original writing dates.

## Production canary receipt — 5 October 2026

The default-off schema compiled in a rolled-back production transaction before
application. Applying it created zero controls, chains and credits. The matching
application was then deployed before the named child was attached.

Shadow proof used a fresh, labelled lesson fixture after the activation cutoff.
It indexed 17 unique words across the answer and child review summary, required
manual review because no passage AI scan was present, and finalised Send back
with zero credits or deliveries. Replaying that action produced one duplicate
suppression event; a retry joined the same chain and produced one retry
suppression event. Neither created reward evidence.

Enabled proof used a second fresh, labelled lesson fixture with task coin and
bar rewards disabled. Send back created 21 credits and 42 independent delivery
receipts. Delivery completed with no failures or open receipts:

- Gold: 1 delivered to an existing post-Forge Word Treasure; 20 explicitly
  ineligible with `NO_WORD_TREASURE`.
- Proficiency: 15 delivered; 6 retained as `WORD_UNMAPPED`.
- All 21 credit IDs reached a terminal outcome in both consumers.
- Fifteen ADLE authentic-use events and eight released-policy microskill
  calculations were saved. Existing gates correctly kept progress and levels
  unchanged for this evidence set.
- No Golden Bar ledger entry or coin conversion was created.

All other children remain outside `authentic_use_controls` and therefore stay
on the previous production path.
