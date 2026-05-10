# Structured Lesson Migration Plan — Scarlett’s Spells

## Purpose

This document replaces ad hoc lesson HTML rescue work with one implementation path.

The current pasted-HTML lesson flow has reached the point where it is no longer a good foundation for:
- safe partial saving
- reliable restore
- field-level parent feedback
- accurate spelling capture
- low-maintenance lesson authoring

The goal of this plan is to move the app to a structured lesson system owned by the platform, then remove the legacy code paths that only exist to support embedded free-form HTML lessons.

Canonical references:
- [docs/contracts/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/modules-model.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- [docs/workflows/mvp-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/mvp-workflow.md:1)
- [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1)

## Current execution status

As of 10 May 2026:

- structured lessons are the only active lesson authoring path
- structured lessons are the only active child lesson runtime path
- builder, runtime, response, and review layers now exist in dedicated structured-lesson code
- legacy embedded HTML lesson UI and preview branches have already been removed from active child and review surfaces
- the remaining lesson cleanup is now documentation normalization and later schema retirement, not a live HTML-runtime rebuild

Phase 4 clean-house closeout:
- active lesson docs now treat `lesson_schema` as the current lesson contract
- the remaining plain-writing lesson path is explicitly a compatibility-only fallback for lesson/test tasks that still lack `lesson_schema`
- broken or stale HTML-era design references should no longer be treated as active lesson canon
- no schema deletion is part of this phase

---

## Problem statement

The current HTML lesson path works by embedding a whole lesson document in an iframe, scraping its fields back into a hidden form, storing a JSON draft payload, then rebuilding those fields later.

That introduces avoidable fragility:
- lesson save depends on every field having stable `id` or `name`
- restore depends on iframe scraping logic rather than platform state
- parent feedback depends on matching DOM nodes inside custom HTML
- spelling exclusions depend on custom `data-spelling-source="exclude"` tags being remembered in each lesson
- lesson authoring is effectively mini frontend development
- the app carries preview, draft, feedback, and review logic that exists only because lessons are arbitrary documents

This is patchable, but not a strong long-term product structure.

---

## Target architecture

The new lesson model should be:
- schema-authored
- platform-rendered
- field-addressable
- draft-safe
- feedback-safe
- spelling-aware by default

### Architecture verdict

The migration direction is correct, but the current mixed state is not yet the long-term proficient version.

What is already right:
- the app is moving away from pasted HTML lessons
- structured lessons now own rendering, answers, feedback, and quiz scoring
- the parent builder is becoming the primary authoring surface

What still needs to tighten for long-term use:
- `lesson_schema` must become the single canonical lesson contract for all new lessons
- legacy HTML must become a clearly isolated fallback, not a co-equal runtime path
- the lesson engine should separate:
  - schema and model logic
  - renderer logic
  - response and draft orchestration
  - parent review and feedback mapping
- autosave behavior should rely on one normalized structured draft contract, not component-specific compatibility branches

Interpretation rule:
- keep building on the structured system
- stop expanding legacy HTML capabilities
- treat hybrid compatibility code as temporary migration scaffolding

### Core rule

The platform should store:
- lesson structure
- question ids
- child answers
- parent feedback
- spelling-analysis eligibility

It should not need to scrape those back out of a custom iframe document.

### Approved v1 decisions

The accepted implementation direction for v1 is now:
- one canonical branded lesson theme, based on `problem_lesson_paste_ready.html`
- structured lessons are the default path for all new lessons
- legacy HTML remains only as a fallback during migration
- one structured draft record is the source of truth
- “save beside each question” means autosave plus per-question saved-state reassurance
- comprehension is modeled natively, not through custom HTML quiz hooks

This means the migration is no longer just “replace pasted HTML.”
It is now specifically a builder-first structured lesson product track.

### Target lesson shape

Each lesson should be a structured record made of ordered blocks such as:
- `heading`
- `rich_text`
- `callout`
- `question_text`
- `question_textarea`
- `question_choice_single`
- `question_choice_multi`
- `question_table`
- `question_repeatable_interview`
- `comprehension_quiz_group`
- `carry_forward_reference`
- `divider`

Each answerable block should have:
- `block_id`
- `label`
- `input_type`
- `required`
- `exclude_from_spelling`
- optional `feedback_slot`

Future builder feature:
- the parent builder should expose a simple per-block review toggle so a parent can untick a box when that section should not feed spelling review
- this should write the canonical `exclude_from_spelling` setting instead of relying on implicit block-type defaults

Each child response should store:
- `task_id`
- `child_id`
- `status`
- ordered `answers`
- `draft_saved_at`
- `submitted_at`

Each answer should store:
- `block_id`
- `value`
- optional `feedback`

For comprehension quiz answers, `value` should carry:
- per-question selected answers
- per-question correctness
- score
- total questions
- percentage
- understanding band

V1 understanding bands:
- `secure`
- `developing`
- `review_needed`

### Theme rule

The runtime lesson system should use the current problem lesson as the canonical visual reference.

Required inherited styling:
- pink / cream palette
- serif lesson headings
- eyebrow labels
- rounded section cards
- soft form fields
- branded callouts
- progress bar and lesson shell styling
- the current spacing rhythm

Do not:
- parse lesson HTML to derive styles at runtime
- support multiple branded lesson themes in v1

The current KIND lesson remains a migration target for content and quiz behavior, not a second v1 theme system.

### Target-state lesson engine

The durable lesson architecture should resolve into four main layers:

1. `schema/model layer`
- lesson block definitions
- preset definitions
- validation
- answer normalization
- quiz scoring rules

2. `renderer/runtime layer`
- child lesson rendering
- builder preview rendering
- theme tokens and lesson shell components
- no persistence decisions embedded in visual block components

3. `response/state layer`
- structured draft payload builder
- autosave state
- status derivation for `draft`, `submitted`, `returned`, `approved`
- structured spelling-source extraction

4. `review/feedback layer`
- parent-readable answer summaries
- field-level feedback mapping
- question-level quiz feedback mapping
- returned-work payload merge rules

Long-term rule:
- routing pages should compose these layers
- they should not become the place where lesson semantics are reconstructed ad hoc

---

## Delivery principle

Do not try to migrate everything in one jump.

The right rollout is:
1. build the structured renderer
2. support the main block types already used by current lessons
3. author new lessons only in the structured system
4. migrate the highest-use HTML lessons first
5. remove legacy HTML code only after the last live lesson no longer depends on it

### New lesson rule

All newly created lessons should be authored through `lesson_schema`.

`content_html` is now:
- migration fallback
- historical content support
- temporary operational bridge

It is not the long-term authoring model.

Environment rule:
- always verify whether local and deployed are pointed at the same Supabase project before comparing behaviour
- local and deployed must be treated as different environments unless `NEXT_PUBLIC_SUPABASE_URL` is confirmed to match
- do not assume a lesson or task created locally will appear on the deployed site unless both apps are using the same database
- do not assume a lesson or task created on the deployed site will appear locally unless local is using that same database

Testing implication:
- structural migration checks should be run either:
  - against one shared Supabase project on purpose
  - or against one environment at a time
- avoid mixing local UI expectations with deployed database state unless environment parity has been confirmed first

---

## Implementation phases

## Phase 1 — Define the structured lesson contract

Create the canonical internal lesson schema.

Deliverables:
- `lesson schema` type definitions
- `lesson block` type definitions
- `lesson response` type definitions
- explicit `exclude_from_spelling` handling at block level
- explicit `feedback` support at block level

Future extension to record here:
- the builder should let the parent change `exclude_from_spelling` directly for eligible answer blocks, rather than only inheriting the default for that block type

Code direction:
- add a dedicated lesson model module under `lib/lessons/`
- keep this separate from course progress logic and from spelling logic

Done when:
- one schema exists for all future structured lessons
- new lesson authoring no longer depends on free-form HTML conventions

## Phase 2 — Add structured lesson persistence

Replace iframe draft scraping as the source of truth with platform-owned answer storage.

Deliverables:
- lesson response table or structured extension of current draft/submission storage
- autosave-safe answer persistence
- explicit `draft`, `submitted`, `returned`, `approved` lesson states
- server actions for:
  - save draft
  - submit lesson
  - return lesson
  - approve lesson

Important rule:
- draft save must never wipe in-progress answers
- submit must preserve the same answer payload the child just saw on screen

Done when:
- partial work can be reopened exactly as it was left
- returned lessons re-open with the same answers in place
- submit and draft save use the same structured answer source

## Phase 3 — Build the structured lesson renderer

Render lessons from platform blocks instead of embedded document HTML.

Deliverables:
- reusable renderer component
- block components for:
  - headings
  - rich text
  - callouts
  - text questions
  - textarea questions
  - single-choice questions
  - multi-choice questions
  - simple table-entry questions
  - repeatable interview rows
  - comprehension quiz groups
  - carry-forward references

UX requirements:
- auto-save friendly
- mobile safe
- no second “fake submit” path inside the lesson
- all saving/submitting controlled by the platform shell

Branding rule:
- the structured renderer should automatically adopt the current lesson-page visual language
- use the existing lesson HTML look as the design reference, not as the runtime source
- extract the shared brand system into reusable lesson theme tokens and components
- all structured lessons should inherit that theme by default unless a future explicit variation system is introduced

The inherited lesson theme should include:
- the pink / cream palette
- serif lesson headings
- eyebrow labels
- rounded card surfaces
- soft input and table styling
- the current spacing rhythm and callout treatment

Do not:
- parse arbitrary lesson HTML at runtime to discover styling
- let each lesson become its own separate styling system again

Done when:
- a lesson can be completed entirely without iframe scraping
- the child sees one stable save/submit behavior across all structured lessons
- structured lessons visually feel like the current branded lesson pages

Current status note:
- Phase 3 has an explicit failed verification on the current branch state
- the first structured renderer exists in code, but the parent authoring and storage bridge is not finished
- because of that, tested lessons can still be legacy HTML lessons rather than true structured lessons

What the failed verification showed:
- structured lesson rendering looks right: not passed
- save draft keeps fields filled: not passed
- submit works on partially filled work: not passed
- different block types exist in live authoring: not passed

The clearest symptom was:
- stray raw HTML such as `</body>` and `</html>` rendering in the lesson surface
- layout still behaving like pasted document markup instead of platform-owned blocks

Interpretation rule:
- do not treat Phase 3 as visually complete until a task can actually be created, stored, loaded, and rendered through `lesson_schema`

Current checkpoint:
- the structured renderer now supports native comprehension quiz groups
- the child structured lesson path now uses autosave-backed saved-state feedback
- the parent builder now exposes real block controls on the main module task page
- parent review formatting and returned inline feedback have now passed manual verification for builder-created structured lessons
- the first real live migration path now has preset-backed starting templates for:
  - `What Problem Do I Want To Solve?`
  - the first native comprehension founder-story lesson
  - `The Customer`
  - `Customer Research`

Phase 3 is therefore no longer blocked on “basic builder visibility.”
It is now blocked only on migrating real live lessons and proving the same behavior on those migrated lessons.

## Phase 4 — Parent feedback integration

Move parent feedback from generic notes to field-aware response review.

Deliverables:
- parent review form that renders answerable blocks
- feedback attached directly to `block_id`
- returned-work child view that shows feedback next to the relevant question

Important rule:
- the child should not need to decode one large paragraph of returned notes
- feedback must be visible beside the answer it refers to

Done when:
- parent can leave targeted feedback without HTML-specific heuristics
- returned work shows feedback inline beside the right answer

Current checkpoint:
- structured question feedback is now wired through returned drafts for builder-created structured lessons
- parent review should treat structured answers as schema-shaped values, not raw payload ids or JSON blobs

## Phase 5 — Spelling capture integration

Make spelling analysis operate on structured answer data directly.

Deliverables:
- spellcheck input builder for structured lesson answers
- block-level default behavior:
  - child-authored answer blocks included
  - prompt/reference/import blocks excluded
- no lesson-specific manual exclusion tagging for standard structured blocks

Done when:
- AI prompt boxes and copied reference text no longer pollute spelling review
- the system analyses only the answer blocks intended for spelling capture

## Phase 6 — Structured authoring for parents

Replace the `content_html` authoring path for new lessons.

Deliverables:
- parent lesson builder UI
- block add / edit / reorder controls
- block duplicate controls
- compact preview
- structured validation before save
- legacy HTML fallback section clearly separated and labeled as temporary

V1 builder block support must include:
- `heading`
- `rich_text`
- `callout`
- `question_text`
- `question_textarea`
- `question_choice_single`
- `question_choice_multi`
- `comprehension_quiz_group`
- `divider`

Authoring rule:
- parents should configure lesson blocks
- they should not need to write or debug embedded HTML documents

Done when:
- new lessons can be created without using pasted HTML
- lesson setup is simpler and safer than the current raw HTML field
- the builder preview feels recognisably like the branded problem lesson styling

## Phase 7 — Migrate current live lessons

Convert the most-used lessons into structured equivalents.

Initial migration order:
1. `What Problem Do I Want To Solve?`
2. the first builder-created comprehension lesson proving the native quiz path
3. `The Customer`
4. `Customer Research`
5. `Founder Story`
6. `Kind` lesson

Migration rule:
- convert one lesson
- verify save, restore, return, feedback, spelling analysis
- only then move the next one

Done when:
- the live child flow no longer depends on the HTML versions of these lessons

## Manual checkpoints

### Checkpoint A — Builder foundation

Verify in parent mode:
1. creating a new lesson does not begin with raw HTML as the primary path
2. `Add block` is visible
3. heading, intro text, callout, short answer, paragraph answer, single choice, multi choice, and comprehension quiz can all be inserted
4. blocks can be reordered, duplicated, and removed
5. preview resembles the branded problem lesson style

Status:
- passed for builder-created structured lessons
- completed and verified

### Checkpoint B — Child structured save flow

Verify in child mode:
1. heading spacing matches the branded lesson style
2. paragraph input renders correctly
3. typing updates the save state from `Saving...` to `Saved`
4. reloading restores answers
5. partially completed work can still be submitted

Status:
- passed for builder-created structured lessons
- completed and verified

### Checkpoint C — Parent review formatting and returned feedback

Verify in parent review:
1. comprehension quiz answers render as readable score + understanding + selected answers
2. choice answers render as labels, not internal option ids
3. sent-back question feedback appears beside the correct question when reopened by the child

Status:
- passed for builder-created structured lessons
- completed and verified

### Checkpoint D — First migrated live writing lesson

Required next:
1. load the `Problem lesson` structured preset into a real live task
2. open it in child mode
3. save draft, reload, submit, and return it
4. confirm the same structured behavior holds on a real migrated lesson, not only on a newly built structured one

Status:
- passed for live migrated lessons
- `The Customer` and `Customer Research` are now confirmed migrated and working

### Checkpoint E — First migrated live comprehension lesson

Required next:
1. load the `Daniel / KIND comprehension` structured preset into a real live task
2. verify score, understanding band, returned feedback, and spelling exclusions on live migrated content

Status:
- core builder-created comprehension path passed
- live migrated comprehension verification remains the next highest-value child-mode check once the relevant lesson is accessible without module lock blockers

### Checkpoint F — Live HTML dependency cutoff

Required next:
1. confirm there are no remaining live lessons authored through `content_html`
2. remove legacy HTML as an active authoring mode in the parent builder
3. remove legacy HTML as an active child runtime path

Status:
- passed
- there are no remaining live HTML lessons
- structured builder is now the only active lesson authoring path
- child lesson runtime no longer renders legacy HTML lessons as an active path

## Phase 8 — Remove legacy HTML lesson dependencies

Only after structured lessons are live and migrated.

Remove or simplify:
- iframe lesson rendering path
- field scraping logic
- injected-link support that exists only for custom HTML documents
- draft payload rebuild logic for arbitrary DOM nodes
- HTML-specific lesson preview exceptions
- lesson files under `docs/*_paste_ready.html` once they are no longer used live

Possible survivors:
- a legacy read-only preview path for historical submissions
- a temporary fallback viewer for unmigrated archived lessons

Done when:
- lesson runtime no longer depends on arbitrary pasted HTML documents
- the platform owns lesson structure end to end

Current progress:
- live lesson creation has now cut over to structured lessons
- active child runtime has now cut over to structured lessons
- legacy HTML preview branches have now been removed from active child and review surfaces
- unused legacy lesson UI files have now been deleted
- app-layer task types, queries, and lesson runtime no longer treat `content_html` as part of the canonical lesson contract
- create, update, and duplicate task flows no longer write `content_html`
- the Phase 5 destructive cleanup pass now removes `content_html` from `course_tasks`
- remaining legacy work is now limited to optional historical data archival outside the active schema if the product owner wants it

## Success criteria status

### Done
- structured lessons are the only active lesson authoring path
- structured lessons are the only active child lesson runtime path
- parent review uses structured answer data and question-level feedback
- native quiz scoring and understanding bands are live
- multiple real live lessons have been migrated onto `lesson_schema`
- legacy HTML preview helpers and embedded HTML lesson UI have been removed
- app-layer lesson contracts now treat `lesson_schema` as canonical
- task create, update, and duplicate flows no longer preserve or write lesson HTML

### Remaining
- optionally archive historical HTML lesson content outside the active application schema if you want a separate record

Interpretation:
- product and application success criteria are met
- destructive schema cleanup is now complete for `content_html`

Phase 4 interpretation:
- application/runtime normalization is complete enough for the clean-house program
- any remaining legacy lesson surface is compatibility-only rather than a co-equal architecture
- the next lesson-specific cleanup step belongs to schema retirement, not more active runtime migration

---

## Historical minimisation record

This project should not just add the new path. It should shrink the old one as the new path lands.

## Immediate minimisation targets

These were strong candidates for deletion or reduction once structured lessons became live:

### Legacy runtime
- deleted legacy embedded lesson response UI
- deleted HTML iframe prefill, field scraping, and feedback injection branches

### Legacy authoring
- raw `content_html` lesson authoring fields in:
  - [app/courses/components/task-editor-fields.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-editor-fields.tsx:1)
  - [app/courses/[courseId]/modules/[moduleId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/[courseId]/modules/[moduleId]/page.tsx:1)

### Legacy previews
- old HTML-preview exceptions are no longer part of the active child/review runtime path

### Legacy docs and assets
- archived lesson HTML reference files now belong to historical migration material only

## Minimisation rule

Do not delete legacy code before migration.

Do:
1. add the structured replacement
2. move live usage onto it
3. confirm no live task depends on the old path
4. then delete the old path

---

## Proposed delivery order

This is the working sequence for implementation:

1. Create `lib/lessons` schema and response contract
2. Add structured lesson storage
3. Build renderer for core block types
4. Wire `lesson_schema` through storage
5. Build parent lesson authoring UI
6. Make task runtime prefer `lesson_schema` over `content_html`
7. Build parent review against structured blocks
8. Integrate structured spelling extraction
9. Migrate `What Problem Do I Want To Solve?`
10. Verify save / restore / return / feedback / spelling
11. Migrate remaining high-use lessons
12. Remove legacy HTML runtime and authoring code

## Combined roadmap for the next passes

The migration plan and the architecture review combine into this next execution order:

1. finish migrating the first real live structured lessons
2. centralize structured lesson state derivation and payload handling into `lib/lessons`
3. reduce page-level lesson orchestration logic in route files
4. isolate the legacy HTML runtime and authoring path behind explicit fallback boundaries
5. switch new-lesson creation policy fully to `lesson_schema`
6. migrate the remaining live presets and lesson content
7. remove dead legacy lesson code once no live lesson depends on it

The next pass in code should therefore prioritize:
- centralizing structured lesson response initialization
- centralizing effective status derivation for returned work
- reducing route-level branching where lesson semantics are reconstructed

---

## MVP cut line

To stop this becoming a giant rewrite, the first structured lesson MVP should support only the blocks already needed by the current core lessons:
- heading
- rich text
- callout
- text input
- textarea
- simple select / radio / checkbox
- simple table row entry
- repeatable interview rows
- carry-forward link/reference

Do not start with:
- arbitrary custom JS
- arbitrary embedded HTML
- visual free-layout tools
- drag-anything page builders

---

## Manual review points

Manual review is required at these points:

1. After the schema is defined
   - confirm the lesson block set is expressive enough

2. After the first renderer is built
   - confirm the child experience feels simpler than the current HTML lessons
   - this check does not pass merely because a renderer component exists in code
   - it only passes once a real task can be created and loaded through `lesson_schema`

3. After the first lesson migration
   - confirm save, draft restore, parent return, and spelling capture all work

4. Before legacy deletion
   - confirm no active live task still depends on HTML lesson documents

5. Before comparing local and deployed migration results
   - confirm whether local and deployed use the same `NEXT_PUBLIC_SUPABASE_URL`
   - confirm whether the lesson or task being checked was created in local or deployed
   - confirm whether the observed difference is a code issue or an environment mismatch

---

## Detailed manual checklists

Use these checklists at the required manual-stop points. A phase should not be marked as passed unless every relevant item below has been checked.

## Checklist A — After the schema is defined

Goal:
- confirm the structured lesson contract is expressive enough for the live lesson set without recreating free-form HTML dependence

Check:
- can the schema represent:
  - heading
  - intro text
  - callout
  - single-line answer
  - paragraph answer
  - single choice
  - multi choice
  - simple table entry
  - repeatable interview rows
  - carry-forward reference
- does every answerable block have:
  - stable `block_id`
  - label
  - clear answer type
  - spelling inclusion or exclusion rule
  - feedback addressability
- can the response model represent:
  - draft
  - submitted
  - returned
  - approved
- can parent feedback be attached to one precise answer without ambiguity

Manual stop condition:
- stop if one of the current core lessons cannot be represented cleanly without falling back to arbitrary HTML

## Checklist B — After the first renderer is built

Goal:
- confirm the child sees a real structured lesson surface, not a hidden legacy HTML path

Check environment first:
- confirm the task being opened is actually stored with `lesson_schema`
- confirm the runtime is selecting the structured path, not `legacy_html`
- confirm local and deployed are being compared intentionally, not accidentally

Check child UI:
- heading uses the same branded style family as current lesson pages
- spacing between sections feels consistent with the branded lesson pages
- cards/callouts feel like Scarlett’s Spells lesson surfaces, not default browser blocks
- single-line inputs look branded and usable
- paragraph inputs look branded and usable
- no stray raw HTML such as `</body>` or `</html>` is visible
- no iframe-style visual seams are visible

Check lesson behavior:
- save draft does not clear filled answers
- submit does not reject clearly filled answers with “Please write something before submitting.”
- partially filled work can still be saved as draft
- reopening the lesson restores the saved answers

Check block behavior:
- heading block renders properly
- rich text block renders properly
- callout block renders properly
- text question renders and saves
- textarea question renders and saves
- single-choice question renders and saves
- multi-choice question renders and saves
- simple table block renders and saves
- repeatable interview rows render and save

Manual stop condition:
- stop if the lesson being checked is still actually a legacy HTML lesson, because that means the renderer check is not yet valid
- stop if save draft or submit wipes visible answers
- stop if the rendered lesson still behaves like pasted document markup rather than platform-owned blocks

## Checklist C — After the first lesson migration

Goal:
- confirm one real migrated lesson works end to end

Use the first migrated lesson only:
- `What Problem Do I Want To Solve?`

Check child flow:
- open the lesson
- answer some but not all questions
- save draft
- leave the page
- reopen the lesson
- confirm answers are still present
- complete more answers
- submit
- confirm the submitted answers are still the same answers the child just saw

Check parent flow:
- open the matching submission in review
- confirm answers are readable and structured
- add targeted feedback to at least two distinct question blocks
- return the lesson
- reopen as child
- confirm feedback appears beside the relevant questions
- confirm the child’s prior answers are still present

Check spelling behavior:
- confirm only child-authored answer blocks feed the spelling-analysis path
- confirm prompt/reference/import content is not being treated as the child’s spelling output

Manual stop condition:
- stop if returned work reopens blank
- stop if parent feedback is not attached to the right block
- stop if spelling analysis is still polluted by non-answer content

## Checklist D — Before legacy deletion

Goal:
- confirm no active live task still depends on the old HTML lesson runtime

Check:
- list active course tasks still using `content_html`
- list active course tasks already using `lesson_schema`
- confirm no live child-facing lesson required for the current test week depends on the old HTML-only path
- confirm review of historical legacy submissions can still be opened if needed
- confirm migrated lessons are no longer relying on:
  - iframe scraping
  - HTML field prefill
  - HTML feedback injection

Manual stop condition:
- stop if any active lesson required by the live learning flow still depends on the legacy HTML runtime

## Checklist E — Before comparing local and deployed behavior

Goal:
- confirm whether a difference is a real migration bug or just an environment mismatch

Check:
- local `NEXT_PUBLIC_SUPABASE_URL`
- deployed `NEXT_PUBLIC_SUPABASE_URL`
- whether the same lesson/task exists in both environments
- whether the lesson was created locally or on the deployed app
- whether the latest required migration has been applied in that environment

Interpretation:
- if local and deployed point at different Supabase projects, treat them as separate datasets
- if the lesson only exists in one environment, do not treat absence in the other as a migration failure

Manual stop condition:
- stop if environment parity is unknown, because results cannot be trusted yet

---

## Rollout verification

Before treating a structured-lesson issue as a migration bug, verify:
- which environment the lesson was created in
- which environment the lesson is being opened in
- which Supabase project each environment is using
- whether the latest required migrations have been applied in that environment

Before treating Phase 3 as passed, verify:
- the task is actually stored with `lesson_schema`
- the task runtime is loading the structured lesson path, not the legacy HTML path
- the child is seeing platform-rendered blocks rather than pasted document markup

Minimum environment checks:
- local `.env.local`
- Vercel environment variable for `NEXT_PUBLIC_SUPABASE_URL`
- Supabase project ref match or mismatch

If these do not match:
- treat local and deployed as separate datasets
- do not use cross-environment visibility as proof that the lesson migration failed

---

## Success criteria

This migration is complete when:
- children can save partially completed lessons without losing work
- returned lessons reopen with answers still in place
- parent feedback appears next to the relevant questions
- spelling analysis only uses the intended answer fields
- parents can create new lessons without pasting raw HTML
- the legacy embedded HTML runtime is no longer required for active lessons
- dead code created solely to support lesson scraping is removed
