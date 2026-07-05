# ADLE Slice 2: Review Scheduler — Plan

## Status

- Status: `Implemented 2026-07-05 (owner instructed "proceed with
  implementation" and answered all five open questions 2026-07-05). All
  five parts landed with passing regressions. The 2A migration
  20260705150000 is applied to local dev — the local dev DB was found
  rebuilt (baseline + all migrations + Phase 5F import + banding applied
  with exact parity numbers), closing the Slice 1 rebuild precondition —
  and QA-verified with a rolled-back constraint smoke (12/12 checks).
  Hosted/production remains untouched; the owner's preview-branch offer
  was not needed. Decision-log entry
  "2026-07-05 — ADLE Slice 2 implemented".`
- Date: 2026-07-05 (implemented 2026-07-05)
- Policy sources:
  [adle-daily-assignment-and-evidence-blueprint-contract.md](../contracts/adle-daily-assignment-and-evidence-blueprint-contract.md)
  (review model, throttle rule, skip rules, and the 2026-07-04
  formula-package amendment items 5, 6, and 8) and the approved
  [adle-word-complexity-banding-and-formula-numbers-proposal.md](adle-word-complexity-banding-and-formula-numbers-proposal.md)
  (§3.4 throttle predicate, §4 queue-simulation validation, §4b
  optimal-structure simulation — next-day catch-up and the conditional
  112-day check)
- Predecessor:
  [adle-slice-1-dictionary-eligibility-and-banding-plan.md](adle-slice-1-dictionary-eligibility-and-banding-plan.md)
  (implemented 2026-07-05; decision-log entry
  "2026-07-05 — ADLE Slice 1 implemented")
- Roadmap position: second ADLE implementation slice in the Version 3
  roadmap's amended order (dictionary eligibility statuses → **review
  scheduler** → daily assignment composer → evidence engine)
- Deployment method (per `docs/operations/supabase-migration-policy.md`):
  **unique forward migration**, local/dev only, version format
  `YYYYMMDDHHMMSS`. No hosted/production Supabase mutation in this slice.

## Purpose

Give ADLE the per-child review machinery every later slice schedules
against but never owns:

1. **Scheduler state storage** — per-child review bundles and per-word
   schedule state (bundle position, due dates, catch-up ladder state,
   ejection/reteach/parent-pause state, the conditional 112-day-check
   flag), plus an append-only outcome ledger and the taught/probed word
   history.
2. **Pure day-advance logic** — deterministic transitions for pass, fail
   (next-day / +3-day catch-up ladder), ejection, and retirement with the
   conditional 112-day pre-retirement check; "bundles only move forward"
   enforced structurally.
3. **The due-queue read model** — today's due reviews + due catch-up
   retests, the 10-word oldest-first session cap, and the throttle
   predicate `(due review words + due catch-up retests) ≤ 10`, exposed
   for the Slice 3 composer.
4. **The real `TaughtWordHistoryProvider`** backing status 4
   (`review-eligible`) of the Slice 1 eligibility ladder, replacing the
   fail-closed default.

This slice produces no daily assignments, no lesson composition, no
evidence scores or deductions, no proficiency, no rewards, and no child or
parent UI.

## Pinned policy this slice implements (approved 2026-07-04; cited, not re-litigated)

All of the following are owner-approved policy from the blueprint contract
and its formula-package amendment; this plan implements them verbatim:

- **Interval ladder:** 1 / 3 / 7 / 14 / 28 / 56 days,
  bundle-with-catch-up; bundle schedules only move forward; ejection
  replaces demotion (blueprint "Review model").
- **Catch-up timing (amendment item 5):** a failed review word gets its
  first catch-up retest the **next day**, a second at **+3 days** from the
  failed review, then ejection to pending reteach — two chances inside the
  existing 7-day window.
- **Failure pricing boundary (proposal §3.1):** scheduled review failures
  are priced by the catch-up/ejection ladder, never by slippage
  deductions (deductions fire only outside scheduled reviews and belong
  to Slice 4).
- **Session cap:** up to 10 review words per session, processed
  oldest-first; overdue reviews queue and never demote a word (absence
  never demotes; only errors do).
- **Throttle predicate (amendment item 8, proposal §3.4):** a Part 2
  lesson runs only when `(due review words + due catch-up retests) ≤ 10`
  before the session starts; otherwise the day is review-only.
  Review-only days are correct behaviour (~70% of days at steady state
  per proposal §4).
- **Conditional 112-day pre-retirement check (amendment item 6, proposal
  §4b):** a word passing its 56-day review retires immediately only if it
  has an authentic-use event since its 28-day review; otherwise it takes
  one 112-day check first, then retires on a clean pass. Bundles still
  only move forward.
- **Post-reteach failure:** a word that fails again after its reteach
  lesson is flagged for parent review and paused from the queue
  (blueprint "Failed words"; skip reason `word_pending_parent_review`).

These constants are versioned in code as a scheduler policy version
(proposed identifier `review_policy_v1_2026-07-04`), following the
banding-version pattern, so a future pilot-tuned interval set is a new
policy version, not an edit.

## Inputs and preconditions

- Slice 1 is implemented: banding storage migration
  `supabase/migrations/20260705090000_add_adle_dictionary_banding_storage.sql`
  (written, scratch-verified, **not yet applied** — the local dev DB has an
  empty schema), the banding runner
  `scripts/adle-band-teaching-dictionary.py`, and the pure eligibility
  module `lib/adle/dictionary-eligibility.ts` with its fail-closed
  `TaughtWordHistoryProvider` default and passing regressions
  (`npm run adle:banding-regression`,
  `npm run adle:dictionary-eligibility-regression`).
- Dictionary storage exists in source
  (`supabase/migrations/20260629120000_add_canonical_teaching_dictionary_storage.sql`);
  scheduler word references FK to
  `canonical_teaching_dictionary_words(id)`.
- Child identity follows the existing convention: FK to
  `public.children(id)` (as in `child_word_treasures`,
  `supabase/migrations/20260627120000_add_word_treasure_storage.sql`).
- **Local dev DB rebuild remains an open precondition for DB-mode work**
  (Slice 1 closeout): apply `20260629120000` + `20260705090000`, re-run
  the Phase 5F import, then the banding runner's guarded `--apply`. As in
  Slice 1, all Slice 2 regressions are fixture-backed and DB-independent;
  only applying the 2A migration locally depends on the rebuild.
- No composer exists yet, so nothing in production code writes scheduler
  state in this slice; state mutation paths are exercised by
  fixture-backed regressions and (optionally) a guarded local script in
  the `adle-band-teaching-dictionary.py` pattern.

## Design

### 2A. Schema additions (one unique forward migration)

New `adle_`-prefixed tables (the scheduler is child-state, not dictionary
content, so it starts its own family rather than extending
`canonical_teaching_dictionary_*`). All follow the Slice 1 conventions:
`row_status`, timestamps, RLS enabled, service-role-only grants, no
browser paths, and check constraints that make rows self-explaining.

`adle_review_bundles` — one row per (child, lesson-cohort) bundle sharing
one schedule:
- `child_id` FK → `children`, `canonical word cohort` via member rows
- `source_ref` text (which lesson/probe run created it — free text until
  the composer slice owns a lesson identity)
- `interval_index` int (0-based position in the policy ladder
  1/3/7/14/28/56), `next_due_on` date
- `schedule_policy_version` text (e.g. `review_policy_v1_2026-07-04`)
- `bundle_status` (`active` / `completed`), `row_status`
- forward-only enforcement: `interval_index` transitions are append-only
  facts in the outcome ledger; the regression asserts monotonicity, and
  the day-advance module has no decrement path (there is no demotion
  code to call)

`adle_review_schedule_words` — one row per (child, word) currently or
formerly under scheduled review:
- `child_id` FK, `canonical_word_id` FK, `bundle_id` FK
- `membership_status`:
  `scheduled` / `catch_up` / `ejected_pending_reteach` /
  `paused_parent_review` / `awaiting_112_check` / `retired`
- catch-up state: `catch_up_stage` int (0 = none, 1 = first retest
  pending, 2 = second retest pending), `next_retest_due_on` date,
  `failed_review_on` date (the anchor for +1/+3)
- `pre_retirement_check_due_on` date (set only when the 56-day pass had
  no qualifying authentic-use event; the word leaves its bundle and
  carries this single word-level check)
- `reteach_cycle_count` int (0 on first ejection; a failure after a
  reteach → `paused_parent_review`)
- `taught_on` date, unique active row per (child, word)

`adle_taught_word_history` — append-only per-child taught/probed events;
the storage truth behind eligibility status 4:
- `child_id`, `canonical_word_id`, `event_kind` (`taught` / `probed`),
  `occurred_on` date, `source_ref` text
- written when a word enters the scheduler (this slice: fixtures/guarded
  script; Slice 3: the composer on lesson/probe completion)

`adle_review_outcome_events` — append-only ledger of scheduler outcomes:
- `child_id`, `canonical_word_id`, `bundle_id`, `event_type`
  (`review_pass` / `review_fail` / `retest_pass` / `retest_fail` /
  `ejected` / `retirement_check_scheduled` / `retirement_check_pass` /
  `retirement_check_fail` / `retired` / `paused_parent_review`),
  `occurred_on`, `interval_index`, `schedule_policy_version`
- this is the audit trail that makes "bundles only move forward"
  verifiable, and the fact stream Slice 4 (evidence engine) will price —
  the scheduler records outcomes, it never computes evidence points

`adle_review_policy_versions` — registry mirroring the banding-version
pattern: `schedule_policy_version` pk, `is_active`, `interval_ladder_days`
int[], `catch_up_offsets_days` int[], `session_cap` int,
`pre_retirement_check_gap_days` int, `formula_reference` text; exactly one
active version; seeded with `review_policy_v1_2026-07-04`
(`{1,3,7,14,28,56}`, `{1,3}`, `10`, `112`).

### 2B. Pure day-advance logic (`lib/adle/review-scheduler.ts`)

Pure, fact-fed, server-only functions in the Slice 1 style: rows in,
transitions out; the current date is always an injected parameter (never
read from the clock), so every transition is deterministic and testable.

Transitions (all emit outcome events alongside the new state):

- **Pass at interval i < 56:** the word is marked passed for the window;
  when the bundle's due session resolves, the bundle advances to
  `interval_index + 1` and `next_due_on` = review completion date + next
  ladder gap (rolling anchor — overdue processing shifts forward, absence
  never demotes; see open question 1).
- **Fail at any scheduled review:** word → `catch_up`, stage 1,
  `next_retest_due_on` = fail date + 1; the bundle continues without
  waiting. Retest pass → word rejoins its bundle's schedule (stage 0).
  Stage-1 retest fail → stage 2, `next_retest_due_on` = fail date + 3.
  Stage-2 fail → `ejected_pending_reteach`: the word leaves the bundle,
  its micro-skill is flagged for reteach priority (a scheduler fact the
  Slice 3 composer reads), and the bundle progresses without it.
- **Post-reteach failure:** a word re-entering review after a reteach
  lesson (`reteach_cycle_count ≥ 1`) that is ejected again →
  `paused_parent_review`; it leaves the due queue entirely until a parent
  action (out of scope here) releases it.
- **Pass at 56 days:** ask the injected `AuthenticUseProvider` (see
  boundary below) whether the word has a qualifying authentic-use event
  since its 28-day review. Yes → `retired`
  (`review_retired` evidence-state transition is Slice 4's read; the
  scheduler records the fact). No → `awaiting_112_check`,
  `pre_retirement_check_due_on` = 56-day pass date + 112; the bundle
  itself completes.
- **112-day check:** clean pass → `retired`. Fail → the standard
  catch-up ladder (scheduled-review failures are always priced by
  catch-up/ejection, proposal §3.1), anchored on the check date.
- **No demotion path exists.** There is no function that lowers
  `interval_index` or re-lengthens a schedule; the only failure exits are
  catch-up, ejection, and parent pause.

`AuthenticUseProvider` is an injected interface exactly like Slice 1's
`TaughtWordHistoryProvider`: `hasAuthenticUseSince(childId, wordId, sinceDate)`.
The default **fails closed in the pedagogically safe direction**: no
provider → no authentic use → the word takes the 112-day check (an extra
~1-response check, per proposal §4b, never a premature retirement). The
real provider is Slice 4 territory (authentic-use events belong to the
evidence engine / writing-engine boundary).

### 2C. Due-queue read model and throttle (`lib/adle/review-due-queue.ts`)

Pure derivations over scheduler rows for an injected `today`:

- `dueReviewWords(state, today)` — words in `scheduled` bundles with
  `next_due_on ≤ today` (overdue included)
- `dueCatchUpRetests(state, today)` — `catch_up` words with
  `next_retest_due_on ≤ today`
- `reviewSessionQueue(state, today)` — the combined due set ordered
  oldest-first by due date (stable tie-break: `taught_on`, then
  `canonical_word_id`), capped at the policy's session cap (10). Words cut
  by the cap simply remain due tomorrow — no state change, no penalty.
- `throttlePredicate(state, today)` — `(due review words + due catch-up
  retests) ≤ 10` computed on the **uncapped** counts before the session
  starts; returns the boolean plus the counts so the composer can emit
  the `review_debt_blocks_lesson` skip reason with evidence. Exactly 10
  → lesson allowed; 11 → review-only.
- Bundle merging for interleaving ("small due bundles are merged at
  session time") is presentation-time composition and stays with the
  Slice 3 composer; the scheduler exposes the ordered due queue with
  bundle and family metadata and does not own session shape.

### 2D. Real `TaughtWordHistoryProvider` (`lib/adle/taught-word-history.ts`)

A fact-fed implementation of the Slice 1 interface: constructed from
`adle_taught_word_history` rows (`taughtWordHistoryProviderFromFacts`),
`wasTaughtOrProbed` returns true iff an active `taught` or `probed` event
exists for the (child, word). The fail-closed default in
`dictionary-eligibility.ts` remains the default; callers opt in by
injecting the real provider. No change to the Slice 1 module's signatures.

### 2E. Regression coverage

`scripts/adle-review-scheduler-regression.ts`, registered as
`npm run adle:review-scheduler-regression` (same tsc-compile-and-run
pattern as `adle:dictionary-eligibility-regression`), fixture-backed and
DB-independent:

- **Interval ladder truth:** a clean run advances 1→3→7→14→28→56 with
  rolling anchors; the emitted event stream matches the ladder exactly.
- **Catch-up timing:** fail on day d → retest due d+1; fail that → retest
  due d+3; pass at either → word rejoins its bundle at the bundle's
  current interval (never a reset schedule); both retests fall inside the
  7-day window.
- **Ejection and parent pause:** second retest fail → ejected +
  reteach-priority fact emitted + bundle progresses without the word;
  ejection after a reteach cycle → `paused_parent_review` and absent from
  every due-queue read.
- **Throttle edge:** 10 due → predicate true (lesson allowed); 11 due →
  false; catch-up retests count in the predicate; the session cap trims
  to 10 oldest-first without mutating the trimmed words.
- **112-day conditionality:** 56-day pass with a qualifying authentic-use
  event → retired immediately; without one → `awaiting_112_check` due at
  +112; clean 112 pass → retired; 112 fail → catch-up ladder, never a
  deduction event.
- **Fail-closed defaults:** default `AuthenticUseProvider` always routes
  through the 112-day check; empty taught history → status 4 stays false
  and the due queue is empty; unknown policy version → refuse, don't
  guess.
- **Forward-only property:** across every fixture scenario (including
  fails, ejections, and merges of overdue days) no bundle's
  `interval_index` ever decreases and no due date ever moves earlier.
- **Determinism:** identical fixture state + injected date produce
  byte-identical transition and event output on repeat runs.
- Slice 1 regression extended: `isReviewEligible` with the real
  fact-backed provider returns true after a `taught`/`probed` event and
  false otherwise (fail-closed default unchanged).

## Implementation order

1. 2A migration written and scratch-verified (apply to local dev only
   after the outstanding Slice 1 rebuild precondition is met and the
   owner approves apply)
2. 2B day-advance module with fixture-backed tests
3. 2C due-queue/throttle read model
4. 2D real taught-history provider + Slice 1 regression extension
5. 2E regression registered in `package.json`; full verification pass
6. Closeout: decision-log entry + status flip in this document

## Acceptance criteria (traceable to the contracts)

- interval ladder, catch-up offsets, session cap, and the 112-day gap are
  read from the versioned policy registry, never hard-coded at call sites
- a failed review word's first retest is due next day and its second at
  +3 days, then ejection — two chances, matching amendment item 5
- no code path lowers a bundle's interval or lengthens a word's schedule
  backward; ejection is the only failure exit from a bundle
  (blueprint acceptance criterion "bundle schedules never move backward")
- scheduled review failures emit catch-up/ejection events only — the
  scheduler has no deduction concept (proposal §3.1 boundary)
- the throttle predicate counts due reviews + due catch-up retests before
  the session and passes at exactly 10 (amendment item 8)
- a 56-day pass retires immediately only with a qualifying authentic-use
  event since the 28-day review; the default provider fails closed into
  the 112-day check (amendment item 6)
- absence never demotes: overdue words queue oldest-first under the cap
  with no state penalty
- eligibility status 4 flips to true only via recorded taught/probed
  history; the Slice 1 fail-closed default remains the default
- the scheduler writes no evidence scores, no learning_items, no reward
  state, and no dictionary rows; outcome events are append-only facts
- all regressions pass fixture-backed with no DB dependency; no
  hosted/production Supabase mutation

## Ownership boundaries (what this slice owns vs reads vs leaves)

| concern | Slice 2 scheduler | Slice 3 composer | Slice 4 evidence engine |
|---|---|---|---|
| bundle/word schedule state, due dates, catch-up state | **owns** | reads | reads |
| taught/probed history | **owns storage**; this slice writes via fixtures/guarded script | writes on lesson/probe completion | reads |
| due queue, cap, throttle predicate | **owns** | reads (drives Part 2 gating + `review_debt_blocks_lesson`) | — |
| session shape, bundle merging, interleaving | — | **owns** | — |
| reteach-priority flag from ejection | **emits fact** | consumes (reteach outranks new) | — |
| learning_item records | — | **owns** (ejected words re-enter as pending learning_items there) | reads |
| evidence weights, recency pricing, deductions | — | — | **owns** (prices the outcome ledger) |
| authentic-use events | reads via injected provider (fail-closed default) | — | **owns real provider** |
| parent-review release of paused words | — | — | parent workflow, later slice |

## Explicit non-goals

- no daily assignment composer, session assembly, or bundle merging
  (Slice 3); no lesson/probe identity model — `source_ref` stays free
  text until the composer owns it
- no evidence weights, recency pricing, slippage deductions, or word
  evidence-state computation (Slice 4); the scheduler records outcome
  facts only
- no real `AuthenticUseProvider` (Slice 4); this slice ships the
  interface and the fail-closed default only
- no child or parent UI, no parent-review release workflow for paused
  words
- no hosted/production Supabase mutation, no `supabase db push`; local
  apply itself waits on the Slice 1 dev-DB rebuild precondition
- no changes to Slice 1 banding, allocation, or eligibility semantics
  beyond injecting the real status 4 provider

## Open questions for the owner — resolved 2026-07-05

1. **Due-date anchor on overdue reviews:** **resolved — rolling anchor
   approved** ("I agree with the plan"). The next due date rolls from the
   actual completion date; a late review only ever moves the schedule
   forward.
2. **112-day gap interpretation:** **resolved — confirmed.** The
   pre-retirement check is due 112 days after the 56-day pass; the gap is
   owned by the policy registry (`pre_retirement_check_gap_days`).
3. **Ejected words and learning_items:** **resolved — split confirmed.**
   The scheduler emits the ejection/reteach-priority facts; learning_item
   re-entry lands in Slice 3 with the store it belongs to.
4. **Catch-up retests inside the 10-word session:** **resolved — one
   oldest-first queue under the one cap of 10**, no reserved slots.
5. **Guarded local mutation script:** **resolved — "QA verified, as you
   deem fit."** QA was delivered as: migration applied to the rebuilt
   local dev DB via `supabase migration up` (the only pending version),
   then a 12-check smoke (tables, RLS, anon/authenticated revoked,
   service-role grants, policy seed values, happy-path inserts, and five
   negative constraint exercises: catch-up state, awaiting-check state,
   unique active (child, word), unknown event type, second active policy
   version) run inside a transaction and rolled back — zero rows remain.
   No permanent seeding script was shipped; real writers arrive with the
   Slice 3 composer.

## Implementation pins recorded at closeout (regression-covered)

Two micro-decisions the pinned policy did not fully specify, documented in
`lib/adle/review-scheduler.ts` and asserted by the regression:

- **A caught-up final pass is not a clean pass.** A word that fails its
  56-day review and recovers via retest always takes the pre-retirement
  check, even with authentic use (fail-closed direction of amendment
  item 6's "retires on a clean pass").
- **One check only.** A word that fails its 112-day check and recovers
  via catch-up retires; the retained check due-date marks the single
  check as taken, so recovery never schedules a second check.
