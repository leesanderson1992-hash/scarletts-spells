# Admin word-status handoff: final alignment stage

Status: implementation plan, not a new curriculum or release authority. The
current policy owners remain `docs/architecture/adle-authority-map.md` and its
linked contracts. This stage ends before the planned micro-skill refactor and
its lesson-permission decisions.

## Outcome

For one spelling observation and intended canonical word, the admin interfaces
show the same underlying facts and the next action. A reviewer can complete
the exact spelling-to-skill decision and the word's route content from the
Teaching Dictionary workflow. The matching unresolved case then leaves No
Matching Skill without deleting its evidence. Recommended Dictionary Entries
ceases to recommend a word once its canonical dictionary entry exists. ADLE
Requirements and Teaching Dictionary show the same technical, editorial,
release and activation gates. This stage does not grant a new lesson permission
or activate an ADLE release merely because content is complete.

## Current evidence and boundary

- `admin_recommend_dictionary_entries` already derives its list from
  `authentic_use_credits` and excludes words found in
  `canonical_teaching_dictionary_words`. It needs a publication regression,
  not another recommendation authority.
- `spelling_no_matching_skill_queue` is a view of open resolver, catalogue and
  contextual cases. A dictionary entry alone cannot prove which skill explains
  an observed spelling. The `resolve_no_matching_skill_admin` transaction
  already links an approved case and removes it from the open queue.
- `wordRouteStatus` already separates dictionary, relationship, content,
  editorial, release and activation gates. Teaching Dictionary's word
  readiness endpoint and ADLE Requirements use this shared evaluator. The
  Teaching Dictionary list must not invent a simpler readiness answer.
- The word workspace currently loads governed readiness after its main render.
  It must refresh after relevant saves and show an explicit loading/error state;
  a stale positive status must never survive a withdrawal.
- Local, unreleased edits made during this investigation scope the Teaching
  Dictionary list's profile reads to the displayed words, skip an unnecessary
  weak-vowel fingerprint lookup, remove No Matching Skill's separate lesson
  readiness calculation, and link a case to its existing dictionary word.
  These are a first slice, not evidence of production speed improvement.

## Implementation sequence

### 1. Freeze the shared admin decision shape

Keep `wordRouteStatus` as the sole administrative word–skill–route decision.
Expose its blocker codes, role and source IDs through a bounded read endpoint
or repository function. Add a separate exact spelling-case dimension:
`dictionary_missing`, `skill_decision_needed`, `pair_approved`, or
`context_review_needed`. Do not merge the case decision with route readiness.
The same canonical word identity and normalized spelling pair must be used by
the resolver, queue and Teaching Dictionary. Keep child eligibility explicitly
unevaluated in this admin projection.

Expected areas: `lib/teaching-dictionary-manager/word-route-status.ts`,
`route-word-status-service.ts`, the governed word-skill relationship reader,
and a new bounded spelling-case read model. Avoid a persistent status table
unless measured reads justify it.

### 2. Put the exact case decision in the Teaching Dictionary workflow

On a word's page, show open spelling/context cases whose intended canonical
word is this word. For each case show the observed spelling, source, current
classification and proposed skill. A reviewer explicitly approves the exact
pair and skill, or leaves/returns it to No Matching Skill. Reuse the governed
`resolve_no_matching_skill_admin` transaction or an equivalent idempotent
transaction; it must update mapping visibility, case disposition and audit
history together. It must never infer a spelling-pair skill merely from a
word's approved skill relationship. Valid-word contextual choices continue
through their contextual pair authority.

After the transaction, refresh Teaching Dictionary, Canonical Resolver and No
Matching Skill from the same live authority. Closed cases disappear from the
open queue automatically; historical evidence remains available. A dictionary
publication without an exact pair decision changes the case to “word exists;
skill decision needed” and does not hide it.

Expected areas: Teaching Dictionary word workspace and actions; the bounded
case read model; `spelling_no_matching_skill_queue` only if its projected
reason cannot be derived efficiently; existing resolver/no-skill RPCs and
their audit tests. No destructive backfill of old cases.

### 3. Make route blockers agree across pages

Teaching Dictionary word detail and ADLE Requirements consume the same
`WordRouteStatus` result for a word–skill–route pair. The main Teaching
Dictionary list may display a compact status only if it is obtained from a
bounded batch projection of that same evaluator; otherwise it links to the
authoritative detail status. No Matching Skill and Canonical Resolver show
case/mapping state and link to route status instead of calculating a second
lesson answer. Recommended Entries remains a missing-word list.

Word or case mutation invalidates affected word/pair status; route revision
changes invalidate its route/skill scope. Keep current approval, withdrawal,
release-head and child-queue gates live. Do not refresh the full dictionary
for one changed word. Preserve distinct “technical facts complete”,
“editorial approval”, “released”, “active” and “eligible for this child”.

Expected areas: Teaching Dictionary list/detail/readiness endpoint, ADLE
Requirements read model, Canonical Resolver and No Matching Skill pages, and
cache invalidation in their actions.

### 4. Remove slow and redundant reads with measurements

Record request count, returned bytes and server duration for Teaching
Dictionary list load, word detail load, post-save readiness refresh, ADLE
Requirements route/skill view, No Matching Skill and Recommended Entries.
Use the same staging fixture and repeat each action after warm-up. The main
suspects are the Teaching Dictionary detail's many companion reads, full
relationship authority on list filters, preflight refresh after save, and
No Matching Skill's broad option/member reads. Keep SQL paging for lists and
filter before fetching companion rows. Cache immutable releases or small
static catalogues by version; invalidate mutable approvals and route heads on
their write events. Remove duplicate calculations and queries before adding
new cache layers. Evaluate indexes with staging `EXPLAIN` for observed slow
predicates. Set numerical improvement targets from these measurements, not
from an assumed saving.

### 5. Prove the handoff in isolated staging

Use synthetic cases and the disposable staging database. Verify:

1. A newly published canonical word disappears from Recommended Entries on
   the next read, including a word still awaiting content review.
2. A No Matching Skill case with an existing canonical word remains visible
   with “skill decision needed”; publication alone does not invent a mapping.
3. Approving the exact spelling-pair skill from Teaching Dictionary atomically
   closes only that case, makes the intended resolver mapping visible when
   appropriate, and preserves its history and source evidence.
4. A valid-word contextual pair never acquires a token-only spelling mapping.
5. The same word–skill–route fixture yields identical blocker codes and gate
   states on Teaching Dictionary and ADLE Requirements, before and after
   content save, editorial approval, withdrawal and route deactivation.
6. A technically complete word may still await editorial or release approval;
   no new child lesson is admitted merely by resolving admin blockers.
7. Existing child queues, reviews, mastery contributions and completed lesson
   snapshots remain intact when a relationship is withdrawn.
8. The measured changed pages/actions transfer fewer bytes and have no
   significant response-time regression against their recorded staging
   baseline. Record query counts as well as wall time.

## Completion boundary

This stage is complete when the cross-page case/status transitions and staging
proof above pass, the measured admin read-path changes are released, and the
Production pages show the same decisions on readback. The subsequent
micro-skill refactor owns which reviewed candidate roles and family groups a
lesson may use. It may change permissions and publish new route revisions;
this stage does not pre-authorize those choices.
