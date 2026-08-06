# Dynamic Prefix RE/PRE production durability audit — 2026-08-06

Initial audit: `2026-08-06T08:51:39Z`

Completion re-audit: `2026-08-06T09:07:07Z`

Repository source: `1e7bb21bf4d6570c478be201e7ac22092a28760f`

Assignment: `c5e661bc-8d10-44f5-8108-2df467299adb`

This was a read-only production audit. It did not alter the assignment, its
items, attempts, reflection, evidence, learning items, schedules, rewards, or
canonical-intake state.

## Assignment identity

- Route: `dynamic_prefix_word_lab` / `v2`.
- Profile: `D4_MOR_PREFIXES_RE_PRE`.
- Authentic targets: `rebuild`, `replay`, `preview`.
- Transfer word: `predict`.
- Persisted assignment items: 16.
- Unique positions: 16 (`1` through `16`).
- Generation source: `adle_composer_v1`.

## Child-facing observations

The human acceptance session reported that:

- the Meaning Sort incorrect feedback was selected-prefix-relative and safe;
- a correct target plus an incorrect non-target Dictation word was correctly
  distinguished on Reflection;
- the Cleaver incorrect-feedback test was accidentally omitted and remains a
  required check in the next natural Prefix lesson;
- the first child-facing flow reached Reflection, but no final completion
  submission reached production;
- the final completion control was subsequently pressed again and did reach
  the guarded production action.

These observations remain useful visual/interaction evidence, but they do not
replace the durable completion gate below.

## Durable production result

The re-audit proves one complete atomic production result:

- assignment status: `completed`;
- assignment items: 16 `completed`, 0 incomplete, 16 unique positions;
- durable attempt events: 14, comprising six guided bindings, four controlled
  spelling attempts and four Dictation attempts;
- duplicate attempt keys: 0;
- private Reflection rows: 1 with non-empty child text;
- taught-history events: one each for `rebuild`, `replay`, `preview`, and
  transfer word `predict`;
- lesson evidence: one `0.75` `lesson_production` entry for each of the four
  words under `evidence_policy_v1_2026-07-04`;
- same-session Cover Check/Dictation double-credit: 0;
- resulting word state: `active` for all four words, with no slipped flag;
- authentic learning items: all three moved to `awaiting_review_outcome`;
- review bundle: one active interval-zero bundle, next due `2026-08-07`;
- review schedules: exactly `rebuild`, `replay`, and `preview`;
- `predict`: no learning item, bundle membership, or schedule;
- Forge: the three authentic target treasures moved once from Golden Nugget
  to `in_forge`; `predict` received no transfer-only reward transition.

`preview` had an incorrect controlled spelling attempt and a correct final
Dictation target. Its authoritative final production was canonical, so it
received one taught event and one lesson evidence entry, not two. The other
three words had correct controlled and Dictation attempts and were likewise
session-capped to one evidence entry each.

No duplicate assignment for the child/date exists. No learner history was
backfilled or rewritten by the audit.

Production request logs for the reported completion window
(`2026-08-06T08:15:00Z`–`08:30:00Z`) contain three successful `GET` requests
for `/learn/week/adle` and the expected explicit Prefix V2 route-resolution
event. They contain no `POST`/Server Action request for the route. The atomic
completion handler therefore did not receive a final submission in that
window; this was not a database transaction that committed partially. The
later explicit press produced one `POST /learn/week/adle` at
`2026-08-06T09:07:01.619Z`, returned the expected `303`, and produced the
atomic rows above. The completed route then rendered successfully from Ready
deployment `dpl_8PLLNBAiys2by7wqzhLUDhb21sPi`.

The non-target sentence slip remains a client-derived Reflection fact. The
durable attempt ledger records the authoritative target token, and the private
Reflection table records the child's reflection text; it does not create a
second raw-sentence or context-slip store. The human UI observation therefore
proves presentation and target/context separation, while the durable ledger
proves that target evidence was not reduced.

Two storage outliers remain visible:

- `daily_assignments.session_completed_at` is null even though status and all
  16 items are completed; `updated_at` records the durable completion time;
- proficiency breadth remains fail-closed where governed generic support or
  banding approval is absent/in-review. The evidence entries and active word
  states still exist independently of breadth eligibility.

## Decision

The assignment completion, attempt capture, taught/evidence pricing,
authentic-only scheduling, transfer isolation, and Forge side effects pass the
durable audit. The initial apparent blockage was an unsubmitted final form,
not a failed completion transaction.

Current status remains:

```text
CONTROLLED_END_TO_END_PREFIX_TRIGGER_PROVED
CONTROLLED_END_TO_END_PREFIX_LIFECYCLE_AUDIT_REQUIRED
```

## Carry-forward gates

1. Perform the omitted Cleaver incorrect-feedback check in the next natural
   Prefix lesson.
2. Verify the separately observed due-review omission: the Dynamic Prefix V2
   assignment projection currently clears Part One even when a review bundle
   is due.
3. Decide whether the nullable `session_completed_at` field should be populated
   by the atomic Word Lab completion path or formally retired from this read
   contract.

## Reflection presentation amendment

The requested child-facing order is being implemented prospectively as:

1. Today we studied.
2. Reflection Time.
3. Task instructions.
4. Target-prefix meaning prompt.
5. Mistakes box.
6. Reflection box.

The accepted refinement also suppresses the legacy MeaningCards summary in
Prefix Reflection, so the former `NOT`/`REVERSE` boxes do not appear beneath
the Reflection input. Dynamic Affix retains its existing results presentation.

This presentation correction does not mutate or reinterpret the immutable
production assignment audited above.
