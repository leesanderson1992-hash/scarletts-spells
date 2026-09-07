# E1 — mass enrichment operations

E1 is an operations layer over the Teaching Dictionary, Phase B, S4 and the
whole-writing shadow store. It does not create a canonical identity, relationship,
evidence, publication or learning authority. The implementation began from clean
commit `33532b9`; the concurrent Context Resolver and S5 worktree was not adopted.

## Inventory and routing

`writing:enrichment-inventory` reads completed whole-writing interpretations and
produces `WRITING_ENRICHMENT_INVENTORY_V1`. It counts each occurrence once, keeps
distinct-submission breadth, and builds dialect-aware keys for five gap types:

- unresolved, inactive or ambiguous identity demand, routed to the existing
  Teaching Dictionary release process;
- observed active canonical words with no admitted Phase B pair, routed to S4;
- existing source or S4 candidate pairs excluded from authority;
- active skills with zero admitted Phase B pairs;
- spelling/confusion mappings blocked by identity, approval or visibility.

The public report removes occurrence and submission membership. The optional
private selection is a service-only operational output. Reads paginate in blocks
of 500 and fail the run if any required source fails. Pilot selection is limited
to 25 active, observed relationship gaps ordered by occurrence count, submission
count and stable key. `--identity-demand-csv` emits normalized aggregate demand
for the existing workbook process; it never supplies canonical IDs.

## Durable operations and controls

Migration `20260906160000_add_writing_enrichment_operations.sql` adds immutable
inventory runs, entries, private membership and generation attempts. A derived
view combines attempts with S4 review/publication receipts. It does not copy S4
status into an E1 queue row.

`writing_enrichment_controls` separately gates inventory persistence, generation
and replay by environment. All default to off. `writing_enrichment_cohorts`
requires the exact child and parent for replay. Tables and RPCs are service-only;
authenticated parents and anonymous clients have no access.

Retry keys are immutable receipts. An identical retry returns the original row;
changed contents fail with a conflict. Failed scans cannot replace a completed
inventory. A rejected exact pair remains history and does not resolve a broader
word gap.

Migration `20260906170000_fix_writing_enrichment_published_metrics.sql` ensures
the published count includes only approved members of a published S4 package;
rejected members contribute only to review/rejection metrics.

Migration `20260906180000_allow_unknown_enrichment_gap_skill_keys.sql` permits a
blocked inventory row to retain an unknown skill key as text. Candidate creation
still requires an active catalog skill through the generator and S4 validation.

## Deterministic candidates and S4 reuse

`writing:enrichment-generate` reads the pilot and generates in this fixed order:

1. reviewed morphology with explicit reviewed selector/profile bindings;
2. approved specialist memberships;
3. existing generic support candidates;
4. governed structured spelling transformations;
5. governed confusion mappings and existing homophone support.

Each candidate must name an active word and skill, approved source use, versioned
provenance and a licence reference. Existing Phase B pairs reconcile the gap and
are not republished. Pending exact pairs, duplicate generator output and unchanged
rejection/withdrawal history are suppressed. Reconsideration requires an explicit
new attempt. Free-text morphology or transformation notes are never parsed into
rules. AI remains disabled; every report records zero calls, tokens and cost.

Candidate packages contain at most 25 exact pairs grouped by generator and skill.
The wrapper delegates to S4's package RPC. S4's normal Phase B preview remains the
conflict check, and human pair review and publication remain separate. Rejected
pairs require a reason; optional curator active seconds are stored with the
immutable review. Publication authority is unchanged.

## Authority events and shadow replay

S4 publication, S4 withdrawal and a verified Teaching Dictionary import create
immutable authority-event receipts. Publication records its event in the same
transaction. A withdrawal insertion trigger covers every governed caller. A
dictionary handoff requires an applied import batch, matching commit or folder
hash, and active words linked to that batch.

Discovery scans affected stored occurrences in bounded pages. Scheduling groups
them by existing snapshot and creates ordinary `writing_shadow_runs` under the
existing lease, retry and recovery machinery. The worker detects the E1 scope,
loads only its declared stored occurrences, reuses the identity and Phase B
readers, and pins the authority environment. Persistence verifies exact scope
membership and count before appending interpretations and pending shadow
assessments. Occurrence IDs, spans, source hashes and snapshot time are preserved.

Publication and withdrawal have different event sequences. Current interpretation
selection is per occurrence and prefers the newest authority sequence, so a late
older replay cannot replace a withdrawal and a partial replay cannot hide
unaffected occurrences. An interpretation-insert trigger converges occurrences
that finish after discovery. Another valid Phase B source may keep a relationship
effective after withdrawal.

No reward, remediation, proficiency, retirement, intake or legacy submission job
is called by E1. Resulting assessments remain pending shadow evidence. G1–G5 still
govern every learning consequence.

## Commands

Read a redacted fixture or a live aggregate inventory:

```sh
npm run writing:enrichment-inventory -- --fixture
npm run writing:enrichment-inventory -- --live --environment staging --child CHILD_UUID
```

Preview generation first. Persistence requires enabled E1 controls, an actor and
an immutable inventory key. `--create-packages` also requires S4 review enabled;
packages remain awaiting human review.

```sh
npm run writing:enrichment-generate -- --live --environment staging --child CHILD_UUID
npm run writing:enrichment-generate -- --live --environment staging --child CHILD_UUID \
  --persist --inventory-key KEY --actor ADMIN_UUID
npm run writing:enrichment-generate -- --live --environment staging --child CHILD_UUID \
  --persist --create-packages --inventory-key KEY --package-prefix PREFIX --actor ADMIN_UUID
npm run writing:enrichment-metrics -- --environment staging
```

Production generation is rejected. Production inventory and metrics require an
explicit read-only acknowledgement. No command enables controls.

## Verification and rollback

The local regression covers all five categories, identity states, privacy,
overlap, stale interpretations, 1,001-row pagination, all deterministic methods,
history suppression and 25-pair batching. The disposable PostgreSQL proof applies
the real additive migration and proves controls, RLS, immutable retries, S4 reuse,
publication replay, automatic withdrawal replay, event metrics and per-occurrence
freshness.

Rollback disables the environment controls. Genuine inventory, authority and
evidence receipts remain immutable. Withdraw a published S4 release through S4;
do not delete knowledge or replay learning consequences.

## S5 compatibility contract

E1 and S5 share `writing_shadow_runs`, the worker result, result persistence,
recovery and current interpretation selection. S5 must compose with the E1 scope
validation in `persist_writing_shadow_result` and select current evidence per
occurrence. Selecting one newest batch per snapshot would discard unaffected
occurrences after a partial E1 replay. S5 owns longitudinal queries and display;
E1 owns authority-event discovery and knowledge-enrichment replay. Migration
timestamps must remain unique and both migrations require a combined local proof
before staging.

External source versions and permitted uses still require explicit approval.
Any later offline AI work also requires an owner-selected provider/model, input
policy, retention terms, call/token/cost budget and curator responsibility.

The first [genuine-source staging pilot](whole-writing-e1-genuine-source-pilot.md)
uses a redacted receipt for an existing governed Production mapping and is
awaiting exact-pair human review. No Production writing was copied and
publication/replay remain disabled.
