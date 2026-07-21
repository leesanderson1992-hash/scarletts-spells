# ADLE 7-UI-G payload and composer gaps

The normal ADLE composer remains unchanged. The explicit guarded
`--experience d4-mor-un` generator supplies these pilot-only fields:

| Field | Source | Live requirement |
|---|---|---|
| `schemaVersion`, `experience`, `experienceProfile`, `contentVersion` | pilot compiler | Required; invalid or absent falls back |
| complete morphology parts, joins, spans and split points | approved D4_MOR v1 fixture | Required |
| base/derived meanings and `not`/`reverse` effects | ratified pilot data | Required |
| Guide persona, beats, states and branches | ratified pilot data | Required |
| `pilotActivityId` item bindings | pilot plan builder | Required |
| fixed `un-`/`re-`/`pre-` choices and alternate outcomes | ratified pilot data | Required |
| four dictation sentences and target token positions | ratified pilot data | Required |
| recall visibility and evidence modes | pilot compiler | Required |

No field is silently invented by the live renderer. Missing required fields
disable the rich experience and retain the current warm shell. General
morphology selection and emission remain deferred.

## Runtime and persistence hardening

- Activation now requires the exact 16-item pilot snapshot: two intro rows,
  six guided rows, four controlled-spelling rows and four dictation rows. Each
  binding must match its section, template, canonical word and target word.
- The payload validator checks Guide states and references, activity types,
  word reconstruction, ordered joins, recall visibility, evidence modes,
  authored dictation targets and the complete binding order.
- Local resume rejects malformed, stale or foreign state. Checked recall
  screens resume at the next unresolved item so a reload cannot reopen an
  answer-bearing comparison.
- The guarded generator persists the header, 16 items and stretch intakes via
  the service-role-only `persist_adle_composed_daily_plan_v1` RPC. Duplicate,
  concurrent and forced item/intake failure cases are regression-covered; a
  failed call leaves no partial assignment.
- The normal composer, scheduler, evidence pricing and reward contracts remain
  unchanged. The gate still defaults to disabled and requires an explicit
  child allowlist.

## Engineering verification on 2026-07-14

Passed: application and script typechecks, targeted ESLint, production build,
Git whitespace validation, D4_MOR schema/package/primitives/guided-pilot
regressions, atomic persistence regression, and the adjacent registry,
composer, session, attempt, evidence, reward, recall-gate and paused-release
regressions. The local migration applied successfully.

A disposable local parent/child and three disposable dictionary rows were
created, all seven canonical pilot words were verified, and the guarded
generator created the expected assignment. After repairing the local in-app
browser bootstrap, the authenticated `/learn/week/adle` route was completed
without substituting another browser controller.

The live run exercised discovery, split/rebuild, a wrong meaning choice,
truthful `retidy` feedback, all four controlled spellings and all four complete
dictation sentences. Accessibility-tree inspection confirmed named native
controls, disabled-state semantics, labelled inputs, progress navigation and
answer-free covered recall. A narrow responsive viewport had no horizontal
overflow. Reloading a checked controlled word advanced to word 2, and
reloading checked dictation advanced to sentence 2; neither reload restored the
answer-bearing comparison. The completed route reloaded without console errors
or duplicate evidence.

Database verification passed twice (before and after the completed-route
reload): one completed header, 16 completed items, 14 attempt events (six
guided, four controlled and four dictation), four active morphology learning
items, four taught-history rows and four schedule rows. The verification also
checks full raw dictation sentence storage and target-token-derived correctness.
All disposable parent/child, assignment, dictionary and intake rows were then
removed and cleanup verification passed.

The split boundary now handles Enter and Space explicitly as well as retaining
native button semantics. Browser QA completed the scaffolded correct chop with
Enter after focus moved to the only enabled boundary. The final required device
coverage is Mac Safari plus Chrome desktop and responsive phone/tablet modes;
native-device and screen-reader runs are optional. Genuine-child observation
remains a pilot gate. The feature remains disabled outside an explicit child
allowlist.

## Word Lab flow refinement on 2026-07-14

The follow-up refinement keeps the pilot assessment contract at exactly 16
assignment items and 14 attempt events. The development route now opens the
guided lesson first, with the component playground behind a secondary control
and a development-only restart action. Build places the authored `un-` slot
before the fixed `tidy` base. Discover presents the interactive word and a
larger before/after definition as paired cards on wide screens and stacked
cards at narrow widths.

Remember now preserves the child's exact input when comparing sentences. A
missing sentence-initial capital receives explicit feedback, while correctness
continues to be derived solely from the authored target token. After recall,
the child sees a supportive recap of spelling, capitalization and punctuation
differences before answering “What did you notice about what un- does in these
words?”. The NOT/REVERSE summary and Finish action remain hidden until the
reflection is non-empty.

Reflections are private learning notes, not assessment evidence. The new
`adle_child_learning_reflections` table stores one idempotent note per
assignment/prompt, with authenticated parent/child ownership enforced by RLS
and completion writes performed through the existing authorised service path.
The note is excluded from attempt, evidence, mastery, intake, scheduling,
reward and reporting flows. Its draft remains in strict local resume state
until completion succeeds. Saved notes appear on the completed lesson and in a
read-only ten-note “My Word Lab reflections” history on My Learning.

Authenticated local QA completed the real lesson route, including exact-case
sentence feedback, reflection ordering, required input, reflection reload,
completed-page display and My Learning history. Database verification returned
one header, 16 items, 14 attempts (6 guided, 4 controlled, 4 dictation), four
learning items, four taught rows, four schedule rows and exactly one private
reflection. The completed route was reloaded without duplicating the note or
assessment outputs, and disposable fixture cleanup passed.

The agreed Mac Safari/Chrome accessibility matrix and bundle/lazy-loading proof
are recorded. Genuine-child observation is the remaining UI-G acceptance gate;
the pilot remains disabled outside its explicit allowlist. True touch-event
execution, controlled Web Vitals, native Windows, Android, iOS and
screen-reader confirmation are optional UI-H rollout evidence.

## Explicit prefix teaching and corrective Split on 2026-07-14

The versioned lesson now starts with three authored, read-only Learn screens:
the requested prefix definition, the spelling and two jobs of `un-`, and the
four lesson words. The original two intro assignment bindings remain the first
two of the 16 persisted items and continue to create no attempt or evidence
events. Discover owns no intro binding, and child-facing Guide copy now uses
phase language rather than internal state names.

Split is bounded guided practice. A wrong boundary remains on screen with a
red cross, resistance sound and an accessible correction. After two misses,
all incorrect boundaries are disabled, the boundary after `un` is highlighted
and focused, and the child must perform the correct chop. Correct feedback
holds `un | happy` with the two explicit teaching statements until the child
chooses **Rebuild the word**. Learn index, miss count, scaffold state and held
correct feedback all survive strict resume; individual chops remain outside
the assessment ledger.

Live activation initially exposed an order-sensitivity defect: Supabase JSONB
reordered object keys, so an otherwise exact introduction failed a
`JSON.stringify` comparison and the route fell back to the warm shell. Payload
validation now performs recursive, order-insensitive JSON structural equality
while still rejecting any missing or altered authored value. A regression
reorders every payload object key to model the JSONB round trip.

The final authenticated run covered all three Learn screens, corrective Split
states in preview, keyboard Enter completion after scaffolding, held-success
reload, explicit rebuild, exact-case sentence feedback and private-reflection
reload. Database verification passed twice around a completed-route reload:
one completed header, 16 completed items, 14 attempts (6 guided, 4 controlled,
4 dictation), one private reflection, and 4 learning/taught/schedule rows.

## Final acceptance preparation on 2026-07-14

The general ADLE runner no longer eagerly imports the Word Lab. The rich lesson
and development preview use a client-only dynamic import with a polite status
message, while generic spelling, guided and quick-sort controls import their
small shared field module directly instead of pulling the morphology interaction
barrel into warm sessions.

`adle:d4-mor-bundle-regression` verifies the production build rather than only
the source shape. At commit `f2b2371`, the `/learn/week/adle` entry chunks
contain no Word Lab implementation markers. The one route-specific dynamic
chunk is 38,100 bytes raw and 11,026 bytes gzip against a 153,600-byte budget.
The preview displayed the accessible loading state, loaded Learn first, had no
console warnings/errors and exposed no undersized buttons in the available
narrow browser viewport.

The live-smoke fixture now defaults to local Supabase and refuses remote use
unless the exact staging hostname, the `disposable-data-only` acknowledgement
and an explicit unused date are provided. Browser accessibility/performance
and child-observation forms are prepared in `docs/implementation/qa/`, but
their final results remain unrecorded. The proof register therefore remains
open and the pilot remains allowlist-gated.

## Acceptance boundary refinement on 2026-07-15

Owner direction narrowed the required device matrix to Mac Safari plus
controlled Chrome desktop, phone and tablet modes. UI-G accessibility sign-off
still requires complete keyboard operation, visible and transferred focus,
semantic accessibility-tree inspection, named controls and states,
colour-independent feedback, answer-safe recall, 44 by 44 CSS-pixel touch
targets, responsive reflow and completion without audio. Browser 200% zoom and
operating-system reduced-motion execution are optional follow-up evidence; the
reduced-motion implementation and automated static-path regression remain
required engineering behaviour.

VoiceOver, NVDA and TalkBack are not required sign-off tools. Native Windows,
Android, iPhone and iPad runs are optional follow-up coverage and are never
recorded as completed unless actually performed. Genuine-child proof remains
blocking, and the runtime remains explicitly allowlist-gated. True touch-event
execution and controlled production-preview Web Vitals are optional UI-H
rollout evidence.

The owner-authorised local Safari run completed the authenticated lesson on
Safari 26.5 and macOS 26.5 with Sound off, lowercase sentence-capitalization
feedback, private reflection display and stable completed-route reload.
Database verification passed twice at 1 header, 16 items, 14 attempts, one
reflection and 4 learning/taught/schedule rows. Safari revealed that successful
Split replacement left focus on the page body; `SplitHandle` now transfers
focus to **Rebuild the word**, and the focused regression plus targeted Safari
rerun pass. The production-equivalent preview and bundle proof were recorded
later; genuine-child proof remains open.

The owner-authorised Chrome 150 desktop run then completed the full
authenticated lesson with keyboard-only activation, Sound off, all
recall-safe reload points, capitalization feedback, reflection-draft reload
and completed-route reload. It identified a separate first-wrong-Split focus
defect: replacing the attempted boundary button returned focus to the page
body. `SplitHandle` now retains each boundary ref and restores focus to the
attempted boundary after the first miss; the targeted Chrome rerun and
guided-pilot regression pass.

Chrome semantic inspection found named native controls and statuses, a
decorative cleaver and no recall answer exposure. Responsive views at 390×844,
844×390, 768×1024 and 1024×768 had no horizontal overflow and no visible
interactive target below 44×44 CSS pixels. Completion and completed-page reload
both retained the database contract at 1 header, 16 items, 14 attempts, one
private reflection and 4 learning/taught/schedule rows. The disposable fixture
and temporary allowlist were removed afterward.

Genuine-child observation remains open and is the only unfinished UI-G gate.
Actual touch-event execution, production-preview Web Vitals, browser 200% zoom
and operating-system reduced-motion execution are optional UI-H follow-up
coverage and do not block UI-G closure.

The 2026-07-15 staging acceptance pass completed two disposable assignments on
the production-built Vercel Preview. Desktop keyboard and 390×844 direct
tap-equivalent runs each preserved the `1 / 16 / 14 / 1 / 4 / 4 / 4` contract.
The pass fixed an internal rebuild identifier leaking into the polite live
region and raised shared learner-shell links from 32–36px to a 44px minimum.
Controlled Fast-4G/4×CPU Web Vitals and true touch-event injection are optional
UI-H rollout evidence. Genuine-child observation remains open, so the pilot
stays allowlist-gated.
