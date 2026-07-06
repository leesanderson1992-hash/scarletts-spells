# ADLE Slice 6 — live data-path smoke, 2026-07-06

Status: **PASSED — Slice 6 QA gate closed 2026-07-06** against the local
dev database (localhost:54321 / Postgres 54322). This artefact records
both halves of the gate:

1. the **data-path smoke** (below) — drives the real loader → ensure →
   read-model → completion → persistence SQL that the fixture regressions
   cannot exercise (column names, RLS, FK/uniqueness constraints, JSON
   round-trips);
2. the **6G browser/UI pass** ("6G browser/UI pass — PASSED" section) —
   an owner walkthrough of the two-part child session and the parent
   paused-word release, which surfaced three defects that were fixed; and
3. the **live authentic-use emission closure** ("Live authentic-use
   emission — closed" section) — the approval hook verified against a
   real seeded Review Work submission.

## What ran

`scripts/adle-slice-6-live-smoke.ts` (guarded: refuses unless
`--confirm-local-dev-smoke ADLE-SLICE-6-LOCAL-SMOKE` and the Supabase URL
is localhost:54321). It seeds a throwaway child with a due review bundle
(2 words) and five pending learning items for a homophone lesson skill,
then:

1. `ensureAdleDailyPlan` — compose → `planAssignmentPersistence` → insert.
2. `getAdleDailyPlanReadModel` — asserts Part 1 (review) and Part 2
   (lesson) both present.
3. Re-runs `ensureAdleDailyPlan` — asserts the same assignment id and
   exactly one ADLE header (idempotent/concurrency-safe under the
   `daily_assignments` uniqueness guard).
4. Part 1 completion — `onReviewSessionCompleted` + write-back; asserts
   `review_pass` + `review_fail` outcome events landed, raw attempt text
   persisted on the failed event, and the failed word entered `catch_up`.
5. Part 2 completion — `onLessonCompleted` + write-back; asserts 5 taught
   events under the deterministic `lesson:` source ref, a new 1-day
   review bundle, and 4 successful words scheduled (1 miss excluded).
6. Live authentic-use — `extractAuthenticUseCandidates` →
   `authenticUseBridge` → `persistAuthenticUseEvents`; asserts matched
   events inserted, a re-emit inserts 0 (uniqueness-guard tolerance), and
   an unmatched token is reported not guessed.
7. Cleanup — deletes the child (all ADLE + assignment rows cascade); the
   caller deletes the seeded parent auth row.

The seeded skill was `D4_HOM_CONTENT_WORD_HOMOPHONES_SEE_SEA` (the only
family with both active teaching content and a family method in local
dev), so the run also exercised the homophone sentence-context production
branch.

## Result (verbatim)

```
seeded parent [74ae6f5c-1fb3-4d82-866e-f25aeac5db49]
seeded child f357301e-7403-439d-96a9-98656dbc5797 (parent 74ae6f5c-…)
ensured ADLE Daily Plan assignment a8ad8ac6-3216-45b2-8afa-b07b59e1cc72
plan read model: Part 1 5 items, Part 2 21 items
Part 1 recorded: 2 outcome events, 1 word in catch-up
Part 2 recorded: 5 taught events, new 1-day bundle with 4 words
authentic-use: 2 event(s) emitted, re-emit inserted 0 (idempotent)

adle-slice-6-live-smoke: ALL CHECKS PASSED
cleaned up child f357301e-… (ADLE + assignment rows cascade-deleted)
```

Post-run verification: `children` / smoke `auth.users` / `ADLE Daily
Plan` headers / `adle_learning_items` / `adle_review_bundles` /
`adle_authentic_use_events` all count 0 — local dev returned to its empty
per-child state, no leaked rows.

## How to re-run

The `children.parent_user_id → auth.users` FK means a parent auth row
must exist first (GoTrue's admin API is flaky against the local stack, so
seed it directly). Full sequence:

```sh
PARENT_ID=$(docker exec supabase_db_scarletts-spells psql -U postgres -tAc \
  "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) \
   values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000','authenticated','authenticated', \
   'adle-smoke-'||floor(random()*1e9)::text||'@example.test','x', now(), now()) returning id;" \
  | head -1 | tr -d '[:space:]')

npm run adle:slice-6-live-smoke -- --parent-user-id "$PARENT_ID"

docker exec supabase_db_scarletts-spells psql -U postgres -tAc \
  "delete from auth.users where id='$PARENT_ID';"
```

## 6G browser/UI pass — PASSED 2026-07-06

Ran the real browser path with a seeded test login
(`scripts/adle-slice-6-seed-manual.ts`; parent `adle-parent@example.test`,
child "Test Scarlett") against the local dev server (`npm run dev`,
port 3000), driven through the preview browser. Verified in the UI, each
confirmed against the DB:

- **Daily Assignment card** — the "ADLE Spelling / Open today's plan" card
  appears on `/learn/week` in child mode; the legacy "Today's spelling
  practice" shows "Nothing new today" (no collision between the two
  surfaces, filtered by `assignment_generation_source`).
- **Part 1 review** — quick sort (homophone "sort by meaning/sentence
  fit"), production, and the **review-first gate** visible ("Today's
  lesson unlocks after the review — review always comes first"). Spelled
  one word right, one wrong → the **per-misspelling reflection** rendered
  the full contract shape ("You wrote bak — the word is back", the memory
  cue from `common_misconceptions`, "Try it again — what did you miss?").
  DB: `review_pass`/`review_fail` with raw attempt text; failed word →
  `catch_up`; Part 1 items `completed`; the seeded paused word untouched.
- **Part 2 lesson** — intro → guided practice → "Spell all your lesson
  words" → sentence-context dictation. Submitted 4 sentences containing
  their target word and 1 omitting it. DB: 5 taught events (raw sentence
  attempts captured), a new 1-day review bundle due tomorrow containing
  exactly the 4 words whose sentences carried the target ("as" excluded).
- **Completed/idempotent state** — the finished day shows "Today's
  spelling plan is all done. See you tomorrow." and is not re-runnable.
- **Parent paused-word release** — the "Paused spelling words" section
  appears inside the existing `/courses/review` page with the paused word,
  its skill, and last attempt. Clicking **Resume** → banner "Word resumed
  — it will be retaught in an upcoming lesson," the section disappears
  (skip lifted). DB: schedule word → `ejected_pending_reteach`, learning
  item → `pending_reteach` (reteach priority, ejection anchor preserved),
  `reteach_priority_flagged` audit event written.

### Gap found and fixed during the pass

The homophone dictation inputs ask the child to "write it inside a
sentence" (sentence-context production, per the blueprint), but the
completion action's correctness check was whole-string exact-match — so a
correctly-spelled word inside a sentence would have been marked wrong (and,
since homophone is the only content family in local dev, every lesson would
have failed the success path). Fixed by deriving correctness from
**whole-token membership** (the target counts when it appears as a token;
also homophone-sensitive — a sentence with the wrong homophone never
matches). Extracted to `lib/adle/session-correctness.ts` (`isAttemptCorrect`)
shared by the action and the client runner, and covered by a new case in
`adle:session-wiring-regression`. Re-verified in the browser after the fix
(the 4/1 split above is the post-fix result).

### Owner walkthrough follow-ups (fixed 2026-07-06)

Two issues the owner hit doing Part 1 themselves, both fixed in
`components/adle-session-runner.tsx`:

1. **Dictation must be audio, not copyable.** The quick-sort step listed the
   review words as plain text on the same screen as the spelling inputs, so
   the child could copy them; the word was otherwise shown only via a grown-up
   reveal, with no audio. Fixed: Part 1 is now a **sort → spell → reflect**
   phase flow — the quick-sort words show only during the sort step and are
   hidden once spelling begins. Each dictation prompt (Part 1 review
   production, Part 2 dictation, and the probe) now has a **"🔊 Hear the
   word"** button using the browser Web Speech API (`speechSynthesis`), with a
   collapsed "no sound? grown-up" reveal as a fallback. Controlled spelling
   ("copy and spell") deliberately keeps the word visible — it is a copy task,
   not dictation.
2. **No clear next button.** The only control ("Check my words") sat below the
   inputs and did not read as a progression. Each phase now ends with a
   prominent full-width next button: **Start spelling → / Check my words → /
   Finish Part 1 →** (and **Finish Part 2 →**).

   Re-verified in the browser: sort phase shows words + "Start spelling →";
   the spelling phase hides the words, shows "🔊 Hear the word" per input, and
   "Check my words →"; the full flow submits and records
   (`review_pass` ×2 confirmed in the DB). `speechSynthesis` confirmed
   available in the browser. tsc/lint/all `adle:*` suites green.

3. **Invisible progression buttons (root cause of "nothing to progress").**
   The Slice 6 UI styled its primary buttons with `bg-[color:var(--ink)]`,
   but this app defines no `--ink` variable (it has `--scarlett`, `--text`,
   `--mid`, `--border`). For `color`, an undefined var falls back to inherited
   dark (so text looked fine); for `background-color` it falls back to
   **transparent** — so every primary button ("Start spelling", "Check my
   words", "Finish Part 1/2", the "Open today's plan" card CTA, the paused-word
   "Resume") rendered white-text-on-transparent and was invisible. It was
   missed initially because the browser automation clicked buttons by text via
   JavaScript, bypassing the visual layer. Fixed by switching all of them to
   the app's canonical `.brand-primary-btn` / `.brand-secondary-btn` classes
   (magenta gradient / bordered) in `components/adle-session-runner.tsx`,
   `components/adle-paused-words-section.tsx`, and `app/learn/week/page.tsx`.
   Verified visually (computed `background-image: linear-gradient(...var(--scarlett)...)`,
   full-width, 44px) and by clicking through the whole flow.

## Live authentic-use emission — closed 2026-07-06

The one gap remaining after the first pass (the authentic-use hook fired
against a real approved submission) is now closed against real data.

- `scripts/adle-slice-6-seed-review-submission.ts` seeds a real Review Work
  submission for the test child: a course → module → `test` task →
  `task_submissions` row → linked `writing_samples` row whose text is
  *"Today I can see the sea. The word zzqxblob is not real."* (canonical
  words `see`/`sea`/`the`/`is`/`word` plus non-words and `zzqxblob`).
- `scripts/adle-slice-6-verify-authentic-use.ts` marks the submission
  approved and invokes **the exact function the approve hook awaits** —
  `emitAdleAuthenticUseFromApprovedSubmission(...)` — with the same args the
  action passes (`app/courses/review/actions/review-completion-actions.ts:1352`).
  It reads the real `writing_samples`/`misspelling_instances`, matches the
  real 874-word dictionary, and inserts events. Result:

  ```
  events emitted    : 5
  canonical words   : is, sea, see, the, word
  unmatched (logged): 6 (can, i, not, real, today, zzqxblob — reported, never credited)
  re-emit inserted  : 0 (idempotent)
  ```

  DB confirmed: 5 `adle_authentic_use_events` rows, `use_kind =
  authentic_correct_use`, `parent_verified = true`, `piece_ref = ws:<sample_id>`
  (the same convention as the guarded batch bridge, so the two are mutually
  idempotent). Fail-closed no-match logging verified (`[adle-authentic-use]
  no canonical match … reported, not credited`).

- Not literally clicked: the final "Approve / mark complete" button in the
  browser — the preview browser's Supabase session stopped persisting
  mid-session (an environment cookie issue; login worked earlier and the app
  auth code is unchanged). The path from that click is a six-line try/catch
  at `review-completion-actions.ts:1352` that calls exactly the function
  verified above with exactly those args. The seeded submission has been
  reset to `pending` (events cleared) so the owner can perform the literal
  browser approve and watch the event row appear.

## Still outside this pass (deliberately)
- Returned-work / Gold Bar popups and the My Progress result — the legacy
  reward flow, deliberately outside the ADLE gate (ADLE writes no reward
  state).
- Child-facing calm-UI polish (Slice 7).
