# ADLE Slice 6: Live Session Surface and Completion Wiring — Plan

## Status

- Status: `COMPLETE 2026-07-06 (local/dev). All Slice 6 paths verified
  against the real database and through an owner browser walkthrough:
  the generated ADLE Daily Plan card, the two-part child session (review
  quick-sort → audio dictation → per-misspelling reflection; lesson
  intro → guided → production → dictation/probe) with the review-first
  gate, completion wiring (pass/fail + raw attempt text, catch-up,
  new 1-day bundle, taught events), live authentic-use emission on
  Review Work approval (5 events for canonical words, non-words logged
  not credited, idempotent — verified via the exact hook function
  emitAdleAuthenticUseFromApprovedSubmission against a real seeded
  submission), and paused-word Resume/Retire in the existing review
  page. Three walkthrough fixes applied: token-membership correctness
  for sentence-context production (shared lib/adle/session-correctness.ts),
  audio dictation + phased sort→spell→reflect flow so words aren't
  copyable, and switching invisible bg-[color:var(--ink)] buttons to the
  app's brand-primary/secondary button classes. All ten adle:* suites
  green; project tsc --noEmit clean; new files lint clean; NO migration.
  QA artefact: docs/implementation/qa/adle-slice-6-live-smoke-2026-07-06.md.
  Known scope caveats (not defects): the UI is a functional-forms harness
  (calm/interactive UI is Slice 7); and the manual-QA lesson uses a
  synthetic word↔skill pairing because local dev has no approved,
  content-complete skill (real word selection needs approved dictionary
  mappings — content curation, upstream of ADLE). Next: Slice 7.`
- Previous status: `Implemented 2026-07-06 + live data-path smoke PASSED;
  owner 6G 3.7B BROWSER/UI pass still pending. Landed the lib/adle/loaders/
  DB boundary, the child session route app/learn/week/adle/, the
  approveSubmissionReviewImpl authentic-use hook, the paused-word release
  action + section, and two new regressions; all ten adle:* suites green,
  tsc/lint clean, no migration. (The full implementation detail lives in
  the decision-log entries below.)`
- Previous status: `Owner-approved 2026-07-06 — all seven open questions
  approved as recommended (new /learn/week/adle route; part-level
  session state, no migration; approveSubmissionReviewImpl-only hook
  with log-only no-match; resume+retire release verbs with re-map via
  existing candidate mapping and no release audit event; 3+-wrong
  reopen as next-day reteach; notYetSecureSkillKeys wired now; 6G
  3.7B scope split). Implementation proceeding; no migration
  authorized or required.`
- Previous status: `Draft for owner review (2026-07-06). No
  implementation, migration, import, or Supabase mutation authorized.
  Seven open questions for the owner with recommendations. Recommended
  shape needs NO migration and no new storage.`

## Purpose

Slices 1–5 built the whole ADLE engine as pure, fixture-tested modules:
banded dictionary (1), review scheduler (2), daily-assignment composer
with completion helpers and the persistence planner (3), evidence engine
with the fail-closed authentic-use bridge (4), and micro-skill
proficiency (5). Nothing in `app/` calls any of it. Every completion
helper is capture-only: it persists raw attempt text and emits
scheduler/learning-item transitions, but no live surface triggers it.

Slice 6 puts a real child and parent in front of the engine:

1. A live plan generation entry point — the composed two-part day is
   persisted as a real "ADLE Daily Plan" assignment a child can open.
2. A functional child session surface rendering the contract's review
   session shape (quick sort → production → reflection → 3+-wrong
   reopen) and lesson flow (intro → guided on 2–3 words → production of
   all 5), capturing raw attempt text per produced word.
3. Completion wiring — the Slice 3 helpers (`onLessonCompleted`,
   `onProbeCompleted`, `onReviewSessionCompleted`,
   `pauseItemsForParentReview`) called from real server actions, their
   outputs persisted.
4. Live authentic-use emission from the Review Work approval action,
   deferred here explicitly by Slice 4 open-question-3.
5. A release path for `paused_parent_review` words — today words can
   enter that state (second reteach failure) but never leave it — inside
   the existing parent Review Work surface.
6. The Phase 3.7B browser signoff (ADLE-mapped subset) as the QA gate,
   recorded in a committed evidence artefact.

This slice wires; it never re-prices, re-schedules, or alters a
transition. Completion semantics stay owned by Slices 2–4.

## What already exists (verified 2026-07-06; re-verify before pinning)

- `lib/adle/composer-completions.ts` — `onLessonCompleted(policy,
  params)` → `{bundle, scheduleWords, taughtEvents (with attemptText),
  itemTransitions}`; `onProbeCompleted(params)` → `{probeRun,
  probedEvents, itemIntakes, candidateQueueRoutes}`;
  `onReviewSessionCompleted(policy, params)` (optional
  `AuthenticUseProvider`) → `{updatedBundles, updatedScheduleWords,
  outcomeEvents (attemptText on production types), itemIntakes,
  unmappedEjections, reopenMicroSkillKeys, pausedForParentReview}`;
  `pauseItemsForParentReview(items, childId, pausedWordIds)`. All pure,
  fact-fed with injected dates, idempotent per (child, day, source_ref).
  Grep confirms zero callers in `app/` — only
  `scripts/adle-composer-regression.ts`.
- `lib/adle/assignment-persistence.ts` — `planAssignmentPersistence`
  emits `{action: insert|noop, noopReason, header ("ADLE Daily Plan",
  source `adle_composer_v1`), items (metadata carries
  `adleLearningItemRef`, `planDate`, `sectionKey`, `microSkillKey`,
  `canonicalWordId`, `expectedEvidenceKind`; `learning_item_id` stays
  null per the Slice 3 pin), learningItemIntakes}`. Idempotent per
  (child, day) via the header uniqueness guard. No live caller.
- No live loader exists anywhere that assembles composer or
  completion-helper facts from the DB — only fixture regressions and the
  Slice 4 guarded scripts. The loader layer is new Slice 6 machinery.
- App surfaces: `app/assignments/page.tsx` and `app/practice/page.tsx`
  are pure redirects (child → `/learn/week`, parent → `/dashboard`);
  `app/review/page.tsx` is a static placeholder. The real child surface
  is `/learn/week`. The legacy daily-practice read model
  (`lib/writing-practice/daily-spelling-practice-read-model.ts`) filters
  `assignment_generation_source = "learning_items"`, so ADLE plans are
  invisible to it. The legacy completion path
  (`completeDailySpellingPracticeAction` →
  `completeDailySpellingPracticeItems`) calls
  `moveGoldenNuggetIntoForgeFromDailyAssignmentItem` per item — a Word
  Treasure write that must never fire for ADLE items.
- `app/courses/review/actions/review-completion-actions.ts` —
  `approveSubmissionReviewImpl` (~line 1226) is the single place where
  `parent_review_status` becomes `"approved"` (line 1328), after
  enforcing all-spelling-issues-resolved and final classification. That
  write is the "parent-verified finalised writing becomes truth" moment.
  `recordReviewWorkVerificationAction` (stage 7d) is per-word
  verification mid-flow; `returnSubmissionToChild` is explicitly
  not-yet-truth.
- `lib/adle/authentic-use.ts` — pure TS
  `authenticUseBridge(candidates, activeWordIdByNormalisedWord,
  verifiedAtIso)` with fail-closed normalised-word matching already
  ships from Slice 4. The Python script
  (`scripts/adle-authentic-use-bridge.py`, localhost + confirmation
  token guards) is the batch/audit path; live emission does not need it.
- Paused words: `paused_parent_review` exists in both status enums
  (`adle_review_schedule_words.membership_status`, migration
  `20260705150000` lines 97–100; `adle_learning_items.item_status`).
  Words enter via `resolveCatchUpRetest` second-stage failure with
  `reteachCycleCount >= 1` (`lib/adle/review-scheduler.ts` ~line 471)
  and `pauseItemForParentReview` (`lib/adle/learning-items.ts`). No
  release/exit function exists anywhere. `ejected_pending_reteach`
  (scheduler line 496) and `retired` also exist in the enum — a release
  path needs no schema change.
- Local dev: migrations applied through `20260705210000`; all per-child
  ADLE tables empty; 874 words banded under `banding_v1.1_2026-07-04`;
  all eight `adle:*` regressions green at Slice 5 closeout (commit
  `1222a07`). Slice 4 guarded scripts authorized for DB mode but never
  run (no live writing data).
- Content: `adle_family_methods` (8) and `adle_activity_templates` (32)
  registry rows carry `activity_key`, child-facing title, phases,
  routes, evidence kind/strength, and skip rules per the instructional
  activity registry contract.

If local dev drifts from this inventory, stop and re-verify (migration
policy stop conditions).

## Pinned policy this slice implements (approved 2026-07-04/05; cited, not re-litigated)

- Two-part day: review always first; lesson only when due reviews +
  retests ≤ 10 (throttle). Review debt defers new teaching; review-only
  days are correct, not failure (blueprint contract, daily assignment
  structure).
- Review session shape: parameterised quick sort (activation only, weak
  evidence) → production (dictation or must-use free writing; homophone
  words require sentence-context production) → reflection per
  misspelling (what I wrote → target → try again → what did I miss →
  one memory cue from `common_misconceptions`) → 3+ words wrong in one
  session reopens/links the micro-skill lesson.
- Lesson flow: short read-only intro → family-specific guided sequence
  on 2–3 of the 5 words → production of ALL 5 → successful words enter a
  1-day review bundle.
- Time budget ~20 minutes/~25 responses; trim guided repetitions first,
  then intro; production tasks and error reflection are never cut. A
  diagnostic probe replaces the lesson's dictation, never additional.
- Skip rules fail closed, minimum vocabulary including
  `review_debt_blocks_lesson`, `insufficient_real_learning_items`,
  `probe_cap_reached`, `no_diagnostic_eligible_words`,
  `word_pending_parent_review`.
- Word Treasure boundary: ADLE emits events (word attempted, lesson
  started, authentic use verified); the reward contract consumes them.
  ADLE never writes reward state.
- Slice 3 persistence pins (consumed, not revisited): ADLE
  `assignment_items` keep legacy `learning_item_id` null with linkage in
  `metadata.adleLearningItemRef`; `stretch_selection` is a
  `source_kind` enum value; assignment creation writes nothing else —
  scheduler writes happen at completion, not composition.
- Slice 4 pins: `adle_authentic_use_events` populated only by
  fail-closed normalised-word matching against
  `canonical_teaching_dictionary_words.normalised_word`; no match or
  ambiguity → no event, reported, never guessed; unverified suggestions
  never create evidence (Review Work guardrail); nothing is credited
  automatically from unreviewed text. Live emission from the Review Work
  completion action was explicitly deferred to this slice
  (Slice 4 open-question-3 resolution).
- Slice 5 pin: `notYetSecureSkillKeys` is an additive, fail-open,
  caller-computed composer fact with the actionability guard; the
  composer itself is untouched by this slice.
- Parent gates reuse the existing Review Work flow — no new parallel
  review surfaces (targeted-writing-practice contract).

## Design

### 6A. Plan generation entry point (lazy ensure-today's-plan)

No cron, no bulk generation (Slice 8). On first load of the ADLE session
page for (child, today):

1. `loadDailyPlanFacts` (6B) assembles all composer facts.
2. `composeDailyPlan` composes the two-part day (pure, injected date).
3. `planAssignmentPersistence` plans the writes; the action inserts the
   header + items + stretch learning-item intakes only when
   `action === "insert"`. The `existing_active_plan` noop makes repeat
   and concurrent loads safe under the existing header uniqueness guard
   (re-verify during implementation that the guard covers child + date +
   source; if two simultaneous first visits race, the second insert must
   conflict-noop).
4. Composer skip reasons are structured-logged at generation time and
   recorded in the QA artefact. Parent-facing skip surfacing ("why no
   lesson today") is Slice 7 provenance work.
5. `empty_plan` noop renders an explicit "nothing to practise today"
   state, mirroring the legacy page's state-copy pattern — never a
   broken runner.

### 6B. Loader layer (`lib/adle/loaders/`)

New directory holding the DB boundary; `lib/adle/*.ts` stays pure. Each
loader takes a Supabase client parameter (the
`daily-spelling-practice-read-model` precedent).

- `lib/adle/loaders/rows.ts` — pure row→fact mappers (schedule word row
  → `ScheduleWordFact`, template row → activity template fact, learning
  item row → `LearningItemFact`, …). No client import; exercised by the
  regression against fixture rows.
- `lib/adle/loaders/composer-facts-loader.ts` — one atomic
  `loadDailyPlanFacts(supabase, childId, today)` returning the full
  composer fact set for one (child, day): bundles, schedule words,
  review word facts, family methods, activity templates, teaching
  content, learning items, banded dictionary facts, taught-history
  provider over `adle_taught_word_history`, probe runs/caps, previous
  lesson family key — plus the Slice 5 inputs needed to derive
  `notYetSecureSkillKeys` (6B-i below). One loader for composition
  rather than per-concern modules: the composer needs all facts
  atomically for one day; splitting invites partial/inconsistent loads.
  Private per-table functions keep it readable.
- `lib/adle/loaders/session-completion-loader.ts` — completion-time
  reads (current bundles, schedule words, learning items,
  micro-skill-by-word map) and write-back of helper outputs: inserts of
  taught history, outcome events, probe runs, bundles; updates of
  schedule words and learning items. All inserts are
  on-conflict-do-nothing keyed by the helpers' deterministic source
  refs, so replays are no-ops.

6B-i. `notYetSecureSkillKeys` (open question 6): recommend wiring now.
The loader is being written in this slice anyway; the derivation is one
extra evidence query plus a pure `micro-skill-proficiency` call; the
parameter is fail-open (absent set → today's behaviour) and cold-start
safe (branch (b) never fires while no skill has learning items).
Deferring means reopening this loader in Slice 7 for zero risk
reduction. No composer change either way.

### 6C. Child session surface (`app/learn/week/adle/`)

New route, deliberately NOT a source-switch inside the legacy viewer:
the legacy read model/action pair is hard-wired to `learning_items` and
the Golden-Nugget forge write, and the ADLE session shape shares almost
nothing with the one-word-at-a-time legacy flow. Isolation removes any
path from ADLE items to `moveGoldenNuggetIntoForge*`.

- `app/learn/week/adle/page.tsx` — server component: ensure-today's-plan
  (6A), load the plan's items grouped by `metadata.sectionKey`, render
  the runner or the empty/completed states.
- `components/adle-session-runner.tsx` — client component, functional
  forms only (Slice 7 owns calm-UI polish): plain section headings; quick
  sort as radio/plain buttons per word; production as text inputs
  (sentence-context input for homophone-flagged words); the reflection
  loop per misspelling as stacked fields (what I wrote / target shown /
  try again / what did I miss) with the memory cue as static text;
  lesson intro as static text; guided sequence steps as simple prompts +
  inputs; "Finish Part 1" / "Finish Part 2" submits.
- `app/learn/week/adle/actions.ts` — the two part-completion server
  actions (6D) plus the ensure-plan path.
- Entry card: a small "ADLE Daily Plan" card on `app/learn/week/page.tsx`
  shown when today's `daily_assignments` row with
  `assignment_generation_source = 'adle_composer_v1'` exists (or will be
  generated on click-through), linking to `/learn/week/adle`. Legacy and
  ADLE assignments may coexist on the same day; both surfaces filter by
  generation source, so verify no card/redirect collision.

3+-wrong reopen handling (open question 5): `onReviewSessionCompleted`
returns `reopenMicroSkillKeys`. Recommend for this slice: persist the
resulting reteach demand so the NEXT day's composer schedules the
reteach lesson, and show one neutral child-facing line ("we'll come back
to this one"). A same-session lesson reopen is a large UI scope better
matched to Slice 7's session work; the contract wording
("reopen/link the micro-skill lesson") supports the link reading.
Flagged for owner confirmation.

### 6D. Session and attempt state (part-level; no migration)

- One server action per part: `completeAdleReviewPartAction` and
  `completeAdleLessonPartAction`. Each submits all of that part's
  attempts atomically, loads completion facts (6B), runs the Slice 3
  helpers (`onReviewSessionCompleted` for Part 1;
  `onLessonCompleted` — and `onProbeCompleted` on probe days — for
  Part 2), persists all outputs in one transaction, and marks that
  part's `assignment_items` rows `completed`.
- Resume granularity is the part: refresh mid-part loses in-part answers
  (client state only — acceptable for a ~10-minute part in the local
  3.7B gate); refresh between parts resumes cleanly because Part 1 items
  read `completed`.
- Double-submit / crash-after-write safety: the helpers' deterministic
  source refs (e.g. `review:{child}:{planDate}`,
  `lesson:{child}:{planDate}:{skill}`) + on-conflict-do-nothing make
  replays no-ops; the action also short-circuits ("already recorded")
  when the part's items are already `completed`.
- `planDate` flows from the assignment row through the form into
  completion params — never recomputed as "today" at submit time, so a
  session finished after midnight still writes to its own day and keeps
  the idempotence keys stable.
- Rejected alternative: a session-state table for interim keystrokes is
  a migration serving no Slice 6 goal, and Slice 7 may change the
  interaction shape anyway (open question 2).

### 6E. Live authentic-use emission (`approveSubmissionReviewImpl` hook)

- Hook point: inside `approveSubmissionReviewImpl`
  (`app/courses/review/actions/review-completion-actions.ts`),
  immediately after the `parent_review_status: "approved"` update
  succeeds — the only action that guarantees all spelling issues
  resolved and classification finalised, i.e. the Slice 4 definition of
  parent-verified truth. Stage-7d per-word verification and
  `returnSubmissionToChild` are explicitly not hooks.
  `confirmSubmissionPositiveEvidence` as a second hook is presented as
  an owner option (open question 3), not silently added.
- Mechanics: new pure `extractAuthenticUseCandidates(submissionFacts)`
  in `lib/adle/authentic-use.ts` (correctly-used words from the approved
  piece, `pieceParentReviewed: true`, piece/source refs from the
  submission id); the action loads `activeWordIdByNormalisedWord` from
  `canonical_teaching_dictionary_words` and calls the existing
  `authenticUseBridge`; resulting events insert into
  `adle_authentic_use_events` under the existing (child, word, piece,
  kind) uniqueness guard.
- Fail closed on no-match: one structured server log line per unmatched
  candidate (submission id + observed word). No new table, no metadata
  write — the guarded bridge script can re-derive the full unmatched
  report from the same truth at any time, so persisting it would be a
  redundant migration (open question 3).
- Failure isolation: the emission is wrapped in try/catch and can never
  block or fail the approval; missed events remain recoverable via the
  idempotent batch bridge.
- The Python bridge and its corpus preview scan remain the batch/audit
  backstop exactly as Slice 4 left them; nothing in this slice
  auto-credits unreviewed text.

### 6F. Paused-word release (inside the existing parent Review Work surface)

Pure helpers (new functions in existing modules — the transitions stay
owned by the modules that own the states):

- `lib/adle/learning-items.ts`:
  - `resumeItemFromParentReview(item, releasedOn)` → `itemStatus:
    "pending_reteach"` with reteach priority and `releasedOn` recorded
    so reteach ordering works.
  - `retireItemFromParentReview(item)` → row retired (recommend
    `rowStatus: "retired"` so the item never re-enters selectability or
    skill clustering).
- `lib/adle/review-scheduler.ts`:
  - `releasePausedScheduleWord(word, decision)` — resume →
    `membership_status: "ejected_pending_reteach"` (existing status; the
    composer's normal reteach path then re-teaches the word and
    `onLessonCompleted` creates fresh schedule rows exactly as for any
    ejection — no new scheduling semantics); retire →
    `membership_status: "retired"`.

Server action: `app/courses/review/actions/adle-paused-words-actions.ts`
with a `releaseAdlePausedWord` action (decision: `resume` | `retire`),
re-exported from `app/courses/review/actions.ts` like the other impls.

Parent visibility: a "Paused spelling words" section rendered inside the
existing `app/courses/review/page.tsx`, listing active
`paused_parent_review` schedule words joined to their learning items and
source attempt text, with Resume / Retire buttons. This reuses the
existing Review Work surface per the contract — no parallel surface.

Re-map (word actually belongs to a different skill, or was mis-mapped):
modelled as retire + the EXISTING candidate-mapping flow
(`captureSubmissionSpellingCandidateMapping` → verified-misspelling
intake), not a bespoke re-map action — a release action must not invent
dictionary or skill truth (open question 4).

The `word_pending_parent_review` composer skip lifts automatically once
the item and schedule word leave paused status; no composer change.

Release audit: an `adle_review_outcome_events` row per release would be
tidy, but the `event_type` check constraint may not include a release
type. Recommend shipping WITHOUT it (the status changes are the audit);
if the owner wants the event, it is a flagged optional unique-forward
migration applied only after owner approval (open question 4).

### 6G. Phase 3.7B gate mapping and QA artefact

The roadmap Phase 3.7B checklist (~line 922) was written for the legacy
Word-Treasure daily assignment flow. Mapping for this slice's gate
(open question 7):

Applies verbatim to ADLE (the Slice 6 QA gate):

- generated "ADLE Daily Plan" card appears on `/learn/week` for a child
  with due data;
- child completes Part 1 (quick sort → production → reflection loop)
  and Part 2 (intro → guided → production of all 5), including one probe
  day where the probe replaces the lesson dictation;
- data lands correctly: part items `completed`; taught history, outcome
  events, new 1-day bundle, schedule-word transitions, and learning-item
  transitions all present with raw attempt text; double-submit is a
  no-op;
- parent approves a Review Work submission containing a taught word →
  `adle_authentic_use_events` row appears; an unmatched word is logged,
  never guessed;
- a paused word appears in the parent section; resume returns it to the
  reteach queue and the `word_pending_parent_review` skip lifts on the
  next composed day; retire removes it permanently.

Legacy/Word-Treasure only (NOT the ADLE gate; runs against the legacy
flow or defers): returned-work popup, Gold Bar popup language, and the
My Progress (`child_word_treasures`) result — all driven by the writing
engine + reward contract, which ADLE never writes by design. Visual
copy and child-facing ergonomics checks move to Slice 7 with the calm
UI.

Evidence artefact (slice-track QA convention): committed
`docs/implementation/qa/adle-slice-6-browser-pass-<date>.md` following
the dated report-sample convention — step-by-step browser transcript,
SQL spot-check outputs, screenshot references, and residual gaps routed
to Slice 7/8.

### 6H. Regression coverage

Fixture-backed, DB-independent, registered as `npm run adle:*`:

- `adle:session-wiring-regression`
  (`scripts/adle-session-wiring-regression.ts`) — fixture rows →
  `loaders/rows.ts` mappers → `composeDailyPlan` →
  `planAssignmentPersistence` → simulated child outcomes →
  `onReviewSessionCompleted` / `onLessonCompleted` / `onProbeCompleted`,
  asserting the full round-trip output set byte-deterministically,
  including replay idempotence (same source refs → identical outputs)
  and the empty-day noop.
- `adle:paused-release-regression`
  (`scripts/adle-paused-release-regression.ts`) — pause via a
  second-reteach-failure fixture → assert the composer skip
  `word_pending_parent_review` → `resumeItemFromParentReview` +
  `releasePausedScheduleWord` → assert the word re-enters reteach demand
  and the skip lifts; retire path asserts permanent exit.
- Extend the Slice 4 evidence regression with
  `extractAuthenticUseCandidates` cases: matched, unmatched
  (fail-closed, no event), empty-after-normalise, dedupe within a piece.

All existing `adle:*` suites must stay green (composer regression
byte-identical unless a fixture legitimately gains loader coverage).

## Implementation order

1. Owner reviews this plan; open questions resolved; status flips to
   `Owner-approved`.
2. Pure helpers: `resumeItemFromParentReview` /
   `retireItemFromParentReview` (`lib/adle/learning-items.ts`),
   `releasePausedScheduleWord` (`lib/adle/review-scheduler.ts`),
   `extractAuthenticUseCandidates` (`lib/adle/authentic-use.ts`).
3. Loaders: `lib/adle/loaders/rows.ts`, `composer-facts-loader.ts`
   (including `notYetSecureSkillKeys` derivation if approved),
   `session-completion-loader.ts`.
4. Server actions: `app/learn/week/adle/actions.ts` (ensure-plan + two
   part-completion actions); authentic-use hook inside
   `approveSubmissionReviewImpl`;
   `app/courses/review/actions/adle-paused-words-actions.ts` +
   re-export.
5. UI: `components/adle-session-runner.tsx`,
   `app/learn/week/adle/page.tsx`, plan card on
   `app/learn/week/page.tsx`, paused-words section in
   `app/courses/review/page.tsx`.
6. Regressions: the two new scripts + package.json entries; full
   `adle:*` suite green; typecheck/lint clean.
7. Owner QA gate: execute the 6G ADLE-mapped browser checklist locally;
   commit the dated browser-pass artefact.
8. Closeout: decision-log entries, roadmap slice-track row updated,
   memory updated.

## Acceptance criteria (traceable to the contracts)

- A child can open a generated ADLE Daily Plan and complete a full
  two-part day in the browser; review always precedes the lesson; a
  lesson appears only under the ≤10 throttle; skip reasons fail closed
  and are logged (blueprint daily-assignment structure and skip rules).
- Production and reflection are always rendered — never trimmed;
  homophone-flagged words get sentence-context production (blueprint
  time-budget/trim and production rules).
- Part completion invokes only the Slice 3 helpers with injected
  `planDate`; every taught/outcome/probe record lands with raw attempt
  text; replaying a completed part changes nothing (Slice 3 idempotence
  contract).
- No code path from ADLE items reaches any Word Treasure write; ADLE
  emits events only (Word Treasure boundary).
- Approving a Review Work submission emits `adle_authentic_use_events`
  rows only for exact normalised-word matches on parent-verified
  writing; no-match is logged and never guessed; emission failure never
  blocks approval; unverified suggestions never create evidence
  (Slice 4 bridge semantics and Review Work guardrail).
- A paused word is visible to the parent inside the existing Review Work
  surface; resume routes it through the normal reteach path
  (`ejected_pending_reteach`); retire removes it permanently; the
  `word_pending_parent_review` skip lifts automatically after release;
  no new parallel review surface exists (targeted-writing-practice
  contract).
- The 6G ADLE-mapped 3.7B checklist passes in a real browser and the
  dated evidence artefact is committed.
- No migration lands (unless the owner opts into the release-audit
  event, which would be a flagged unique-forward migration approved
  first). All new inserts are append-only under existing uniqueness
  guards.

## Ownership boundaries (what this slice owns vs reads vs leaves)

- Owns: the loader layer (`lib/adle/loaders/`), the ADLE session route
  and runner, the part-completion and ensure-plan actions, the
  authentic-use approval hook, the paused-word release helpers/action/
  section, and the two new regressions.
- Reads (never alters): composer/scheduler/completion/evidence/
  proficiency semantics (Slices 2–5); the Slice 3 persistence pins; the
  activity/family registry content; the Review Work workflow shape.
- Leaves alone: Word Treasure state (events only), the legacy
  `learning_items` daily-practice flow (coexists, filtered by
  generation source), the guarded batch scripts (unchanged backstop),
  all `*_POLICY_V*` constants.

## Explicit non-goals

- Calm/small-child UI polish, parent "why this appeared today"
  provenance surfacing, proficiency dashboard, ADLE→Word Treasure event
  consumption (Slice 7).
- Bulk dictionary population, hosted/production migrations, cron/batch
  plan generation, pilot tuning (Slice 8).
- Any change to pricing, scheduling transitions, proficiency, or the
  composer (including `notYetSecureSkillKeys` semantics — wiring only).
- Same-session micro-skill lesson reopen UI (recommended: next-day
  reteach; see open question 5).
- A session-state table or any interim-keystroke persistence.
- A persisted no-match report table (log-only; batch bridge re-derives).
- Automatic crediting of unreviewed writing (future slice with its own
  quality rules, per Slice 4).
- Gold Bar / returned-work popups for ADLE items.

## Open questions for the owner (recommendations included)

1. Session route: new `app/learn/week/adle/` with its own runner
   (recommended — zero risk of the legacy Golden-Nugget side effect;
   the shapes share almost nothing) vs a source-switch inside the
   legacy practice surface.
2. Session state: part-level resume with no migration (recommended —
   mid-part refresh loses at most ~10 minutes in local dev; idempotent
   source refs cover crash-retry) vs an interim session-state table
   (flagged migration).
3. Authentic-use: hook `approveSubmissionReviewImpl` only (recommended —
   the single parent-verified-truth moment) vs also
   `confirmSubmissionPositiveEvidence`; and no-match reporting as
   structured logs only (recommended — the guarded bridge re-derives the
   full report) vs a persisted report table (flagged migration).
4. Paused-word release verbs: resume + retire, with re-map expressed as
   retire + the existing candidate-mapping flow (recommended — release
   actions must not invent mapping truth) vs a dedicated re-map action;
   and ship without a release outcome-event (recommended) vs add one
   via a flagged unique-forward migration.
5. 3+-wrong reopen: persist reteach demand for the next composed day
   with one neutral child-facing line (recommended — contract "reopen/
   link" reading; same-session reopen is Slice 7-scale UI) vs
   same-session lesson reopen in this slice.
6. `notYetSecureSkillKeys`: derive in the new composer-facts loader now
   (recommended — fail-open, cold-start-safe, loader is being written
   anyway) vs leave dormant until Slice 7's proficiency loaders.
7. 3.7B gate scope: adopt the 6G mapping (recommended — ADLE browser
   path verbatim; returned-work/Gold Bar/My Progress stay with the
   legacy reward flow; ergonomics to Slice 7) vs running the full
   legacy checklist against ADLE items.

## Handoff notes for the implementing session

- Re-verify the inventory in "What already exists" before writing
  anything — especially the `approveSubmissionReviewImpl` approved-write
  (~line 1328) and the schedule-word status enum
  (`ejected_pending_reteach` / `retired` present). If local dev has
  drifted, stop per the migration policy stop conditions.
- `planDate` discipline: thread the assignment row's date through forms
  into every helper call; never call "today" at submit time.
- Verify the `daily_assignments` uniqueness guard covers concurrent
  first-visit generation (child + date + source conflict-noop) before
  relying on lazy ensure.
- Check the `adle_review_outcome_events.event_type` constraint before
  deciding the release-audit event question in code; do not migrate
  without owner approval.
- Keep the authentic-use hook non-blocking (try/catch + structured log);
  after the browser pass, run the guarded bridge script in dry-run to
  confirm it reports the live-emitted events as already-present
  (idempotence cross-check) — a good QA-artefact line item.
- Confirm nothing in the new route imports from
  `lib/writing-practice/daily-spelling-practice-completion.ts`; grep for
  `moveGoldenNuggetIntoForge` in the final diff (must be untouched).
- Empty-day, review-only-day, and probe-day states all need explicit
  copy in the runner — plain language is fine; Slice 7 rewrites it.
- QA gate mirrors Slices 3–5: hands-on owner pass over the 6G checklist,
  dated committed artefact, decision-log entry + regression evidence at
  closeout.

## Decision-log entry (recorded 2026-07-06, drafting stage)

2026-07-06 — ADLE Slice 6 plan drafted

- `docs/implementation/adle-slice-6-live-session-plan.md` drafted: lazy
  ensure-today's-plan generation, new `lib/adle/loaders/` DB boundary
  (composer facts incl. optional `notYetSecureSkillKeys`, completion
  reads/write-back), new functional-forms child session route
  `app/learn/week/adle/` (calm UI deferred to Slice 7), part-level
  completion actions wiring the Slice 3 helpers with idempotent replay,
  live authentic-use emission hooked in `approveSubmissionReviewImpl`
  reusing the Slice 4 fail-closed bridge (log-only no-match,
  never blocking approval), paused-word release (resume via
  `ejected_pending_reteach` / retire) inside the existing Review Work
  surface, an ADLE-mapped Phase 3.7B browser QA gate with a committed
  dated evidence artefact, and two new regressions
  (`adle:session-wiring-regression`, `adle:paused-release-regression`).
  Recommended shape needs NO migration and no new storage. Seven open
  questions for the owner with recommendations.
- Status: `Draft for owner review`. No implementation, migration,
  import, or Supabase mutation authorized.

2026-07-06 — ADLE Slice 6 plan approved

- Owner approved all seven open questions as recommended: new
  `app/learn/week/adle/` route; part-level session state with no
  migration; `approveSubmissionReviewImpl`-only authentic-use hook with
  log-only no-match reporting; resume + retire release verbs (re-map via
  the existing candidate-mapping flow, no release audit event);
  3+-wrong reopen handled as next-day reteach with neutral child copy;
  `notYetSecureSkillKeys` wired now in the composer-facts loader; the
  6G ADLE-mapped Phase 3.7B gate scope. Status flipped to
  `Owner-approved 2026-07-06`. Implementation proceeds per the
  implementation order; no migration required.

2026-07-06 — ADLE Slice 6 implemented (owner QA gate pending)

- Landed per the approved implementation order, no migration:
  - Pure helpers: `resumeItemFromParentReview`,
    `retireItemFromParentReview`, `reopenItemsForMicroSkills`
    (`lib/adle/learning-items.ts`); `releasePausedScheduleWord`
    (`lib/adle/review-scheduler.ts`, resume →
    `ejected_pending_reteach`, retire → `retired`, existing ledger
    event types only); `extractAuthenticUseCandidates`
    (`lib/adle/authentic-use.ts`, bridge tokenisation/exclusion parity
    with the guarded script).
  - Loader layer `lib/adle/loaders/`: `rows.ts` (pure row→fact
    mappers), `composer-facts-loader.ts` (`loadDailyPlanFacts` +
    `loadActiveReviewPolicy`, wiring `notYetSecureSkillKeys` from the
    proficiency read model; `ADLE_PILOT_CHILD_BAND` pin),
    `session-completion-loader.ts` (idempotent write-back +
    `persistAuthenticUseEvents` tolerating the uniqueness guard),
    `daily-plan-surface.ts` (lazy `ensureAdleDailyPlan` + read model),
    `authentic-use-live-emission.ts`.
  - Composer: `DailyPlanFacts.notYetSecureSkillKeys` threaded into the
    skill-selection facts (fail-open pin; composer logic untouched).
  - Child surface: `app/learn/week/adle/page.tsx` + `actions.ts`
    (part-level `completeAdleReviewPartAction` /
    `completeAdleLessonPartAction`, `planDate` from the row, crash-retry
    short-circuits), `components/adle-session-runner.tsx` (functional
    forms), plan card on `app/learn/week/page.tsx` (child mode).
  - Live authentic-use hook inside `approveSubmissionReviewImpl` after
    the approved-status write, wrapped in try/catch so it never blocks
    approval; log-only no-match.
  - Paused-word release: `adle-paused-words-actions.ts` +
    `releaseAdlePausedWord` re-export;
    `components/adle-paused-words-section.tsx` inside the existing
    `app/courses/review/page.tsx` (no parallel surface).
  - Regressions: `adle:session-wiring-regression`,
    `adle:paused-release-regression`; extended the evidence regression
    with `extractAuthenticUseCandidates`. All ten `adle:*` suites green;
    `tsc -p tsconfig.json --noEmit` clean; new files lint clean.
  - Guard checks: no migration at/after `20260705210000`; no ADLE
    session path reaches `moveGoldenNuggetIntoForge*` or any reward
    state; ADLE writes only `adle_*` + `daily_assignments` /
    `assignment_items`.
- Deferred edge (local/dev, unlikely in practice, flagged): if a word
  were both ejected this session and a selectable item of a 3+-wrong
  skill, the intake-then-reopen write ordering could interact; no
  realistic scenario overlaps (a reviewed word has no selectable item).
- Status: `Implemented 2026-07-06, owner QA gate pending`. Next: the 6G
  ADLE-mapped Phase 3.7B browser pass over live per-child data, its
  committed dated artefact (`docs/implementation/qa/`), and closeout.

2026-07-06 — ADLE Slice 6 live data-path smoke passed

- Ran a guarded live smoke (`scripts/adle-slice-6-live-smoke.ts`,
  `npm run adle:slice-6-live-smoke`) against local dev: seeded a
  throwaway child (2-word due review bundle + five pending homophone
  lesson items) and drove the real code paths —
  `ensureAdleDailyPlan` (compose→persist), `getAdleDailyPlanReadModel`
  (Part 1 + Part 2 present), idempotent re-ensure (one header),
  `onReviewSessionCompleted` write-back (pass+fail outcome events, raw
  attempt text, failed word → catch_up), `onLessonCompleted` write-back
  (5 taught events, new 1-day bundle, 4 words scheduled), and live
  authentic-use (`extractAuthenticUseCandidates` → `authenticUseBridge`
  → `persistAuthenticUseEvents`, matched events + idempotent re-emit +
  unmatched-reported). Child deleted; all ADLE/assignment rows
  cascade-cleaned; zero leaked rows verified. Validates the loader/
  persistence SQL the fixture regressions cannot (columns, RLS, FK/
  uniqueness, JSON round-trips). Artefact:
  `docs/implementation/qa/adle-slice-6-live-smoke-2026-07-06.md`.
- Note (environment): Docker Desktop dropped mid-session; after relaunch
  Postgres ran a full data-directory fsync recovery (~2–3 min) before
  accepting connections — ADLE seed data (874 banded words, 8 families,
  32 templates) survived intact.
- Still pending: the human 6G browser/UI click-through (child two-part
  session, parent approval popups, paused Resume/Retire), then closeout.

2026-07-06 — ADLE Slice 6 6G browser/UI pass passed (+ correctness fix)

- Ran the real browser path with a seeded test login
  (`scripts/adle-slice-6-seed-manual.ts` — parent adle-parent@example.test,
  child "Test Scarlett") against `npm run dev`, driven through the preview
  browser. Verified in the UI and cross-checked in the DB: the ADLE Daily
  Plan card on `/learn/week` (no legacy collision); Part 1 review with the
  visible review-first gate and the per-misspelling reflection (memory cue
  from `common_misconceptions`), pass/fail + raw attempt text, failed word
  → catch_up; Part 2 lesson (intro/guided/production/sentence-context
  dictation) → 5 taught events, new 1-day bundle with the correct words;
  completed/idempotent done-state; parent paused-word Resume in the
  existing Review Work page → `ejected_pending_reteach` + audit event,
  skip lifted. Artefact updated:
  `docs/implementation/qa/adle-slice-6-live-smoke-2026-07-06.md`.
- Gap found and fixed (exactly what the 6G pass is for): the completion
  action's correctness check was whole-string exact-match, which would
  mark a correctly-spelled homophone written inside its required sentence
  as wrong (and homophone is the only content family in local dev).
  Changed to whole-token membership (homophone-sensitive), extracted to
  the shared pure `lib/adle/session-correctness.ts` (`isAttemptCorrect`,
  imported by both the action and the client runner), and covered by a
  new `adle:session-wiring-regression` case. tsc/lint/all `adle:*` suites
  green; re-verified in the browser post-fix.
- Remaining before closeout: parent-approval live authentic-use emission
  in-browser (needs the full writing-submission flow; its SQL was
  validated by the data-path smoke) and any Slice 7 calm-UI polish.

2026-07-06 — ADLE Slice 6 owner walkthrough follow-ups

- Two issues the owner hit in Part 1, both fixed in
  `components/adle-session-runner.tsx` (functional, not calm-UI polish):
  (1) dictation was copyable/silent — the quick-sort step listed the
  words as text beside the spelling inputs, and there was no audio. Part 1
  is now a sort → spell → reflect phase flow (quick-sort words show only in
  the sort step, then hidden), and every dictation prompt (review
  production, lesson dictation, probe) has a "🔊 Hear the word" button via
  the Web Speech API with a collapsed grown-up fallback; controlled
  spelling stays a visible copy task by design. (2) the progression control
  was unclear — each phase now ends with a prominent full-width next button
  (Start spelling → / Check my words → / Finish Part 1 → / Finish Part 2 →).
  Re-verified in the browser (phased flow hides words, audio buttons
  present, full flow submits; review_pass ×2 confirmed in DB);
  tsc/lint/all adle:* green. Artefact updated.
2026-07-06 — ADLE Slice 6 authentic-use gap closed

- Closed the one outstanding gap (live authentic-use emission on parent
  approval) against real data. New guarded scripts:
  `adle-slice-6-seed-review-submission.ts` seeds a real course/module/test-
  task/`task_submissions`/`writing_samples` chain for the test child;
  `adle-slice-6-verify-authentic-use.ts` marks it approved and invokes the
  exact function the approve hook awaits
  (`emitAdleAuthenticUseFromApprovedSubmission`, called at
  `review-completion-actions.ts:1352`) with the same args. Result: 5
  `adle_authentic_use_events` rows (is/sea/see/the/word),
  `parent_verified=true`, `piece_ref=ws:<sample_id>`; 6 non-dictionary tokens
  (incl. `zzqxblob`) logged as unmatched and never credited; re-emit inserts
  0 (idempotent). DB-confirmed.
- Not literally browser-clicked (the "Approve" button): the preview browser's
  Supabase session stopped persisting mid-session (environment cookie issue,
  not the app — login worked earlier and the auth code is unchanged). The
  call site is a six-line try/catch that passes exactly the verified args;
  the seeded submission was reset to `pending` so the owner can do the
  literal approve in-browser.

- Third fix (root cause of the owner's "nothing to progress"): the Slice 6
  primary buttons used `bg-[color:var(--ink)]`, but this app defines no
  `--ink` var — for background it falls back to transparent, so the
  buttons were invisible white-on-white (text-colour usages fall back to
  inherited dark, so only backgrounds broke). Missed at first because the
  browser automation clicked by text, not pixels. Switched all primary/
  secondary buttons to the app's `.brand-primary-btn` / `.brand-secondary-btn`
  classes (adle-session-runner, adle-paused-words-section, learn/week card);
  verified the gradient renders and the full flow clicks through.
