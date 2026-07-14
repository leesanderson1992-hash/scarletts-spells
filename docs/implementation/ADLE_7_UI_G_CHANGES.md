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

The browser controller exposed focus through its accessibility snapshot but
did not dispatch its synthetic `press`/CUA key events. Keyboard-equivalent
controls therefore remain covered by the guided-pilot regression and native
button/input semantics rather than a separately completed synthetic-keyboard
run. Physical touch and genuine-child observation remain human-device pilot
gates. The feature remains disabled outside an explicit child allowlist.
