# ADLE 7-UI-G device, accessibility and performance proof

Status: Safari and Chrome desktop acceptance recorded; responsive touch,
production-preview performance and genuine-child proof remain open.

This record closes `7UI-PROOF-D4-MOR-A11Y` and
`7UI-PROOF-D4-MOR-PERF` only after every blocking row below passes. The agreed
UI-G acceptance boundary uses Mac Safari plus controlled Chrome desktop and
responsive-device modes. Native Windows, Android, iPhone/iPad and screen-reader
runs are optional follow-up coverage rather than closure requirements.

## Safety and build identity

| Field | Record |
|---|---|
| PR | `#2` — `review/adle-7-ui-g-word-lab` |
| Tested commit | `a088ed0` plus the working-tree child-facing announcement and 44px shell-target fixes |
| Preview URL | Vercel Preview for `review/adle-7-ui-g-word-lab` (`scarletts-spells-staged-lsua3n1km.vercel.app`) |
| Supabase environment | `scarletts-spells-staging` (`jlhotktspjvffslvuyfz`); no production learner data |
| Disposable session ID | `UI-G-CHROME-STAGING-2026-07-15-A/B` |
| Observer | Codex, with explicit owner authorisation |
| Test date | 2026-07-15 |

Before testing, confirm the preview is connected to staging rather than
production, allowlist only the disposable child, seed the seven pilot words and
generate an unused-date assignment. Do not put credentials, child names,
reflections, deployment tokens or service-role values in this file.

The fixture command refuses remote execution unless
`ADLE_QA_STAGING_SUPABASE_HOST` exactly matches the configured Supabase URL,
`ADLE_QA_ACCEPT_STAGING=disposable-data-only`, and an unused
`ADLE_QA_PLAN_DATE` is supplied. These values belong in the private QA shell or
deployment configuration, never in committed environment files.

### Local Mac Safari acceptance run — 2026-07-15

An owner-authorised disposable local run passed on Safari 26.5, macOS 26.5,
MacBook Pro `MacBookPro17,1` (Apple M1, 8 GB), based on `a4b05c6` plus the
working-tree Split focus fix. The complete authenticated route covered Learn,
Discover, two wrong Split chops, scaffolded correct Split, held success,
rebuild, Match, an invalid Build choice, controlled recall, full-sentence
dictation, capitalization recap, reflection and completion with Sound off.

The run confirmed no login redirect on Finish, no horizontal overflow, no
visible or accessible-attribute target leak before dictation submission, saved
reflection display and stable completed-route reload. Database verification
passed twice at `1 header / 16 items / 14 attempts (6 guided, 4 controlled, 4
dictation) / 1 reflection / 4 learning / 4 taught / 4 schedule`.

Safari exposed one focus-continuity defect: after a correct chop, focus returned
to the page body when the boundary buttons were replaced. `SplitHandle` now
focuses the held-success **Rebuild the word** action. The targeted Safari rerun
and guided-pilot regression passed. This local run is compatibility evidence;
the production-equivalent preview identity and Web Vitals rows remain pending.

### Local Chrome desktop and responsive-view run — 2026-07-15

An owner-authorised disposable local run passed the complete authenticated
route in Chrome 150.0.7871.124 on macOS 26.5, MacBook Pro `MacBookPro17,1`.
The run used keyboard-only activation throughout Learn, Discover, Split,
Match, Build, controlled spelling, full-sentence dictation, reflection and
Finish. It covered Sound off, two-miss Split scaffolding, held-correct reload,
checked spelling and dictation reloads, lowercase sentence-capitalization
feedback, reflection-draft reload and completed-route reload.

Chrome exposed a second Split focus-continuity defect: after the first wrong
chop, React replaced the attempted boundary button and focus fell back to the
page body. `SplitHandle` now retains boundary refs and restores focus to the
attempted boundary after the first miss. A targeted Chrome rerun confirmed
that **Split after letter 1** remained the active control; the guided-pilot
regression now asserts that focus path.

Semantic snapshots confirmed named native controls, progress navigation,
status output, disabled scaffold boundaries, a decorative cleaver and no
visible or accessible target answer on recall screens. Finish stayed in the
authenticated learner route. Database verification passed before and after a
completed-page reload at `1 / 16 / 14 / 1 / 4 / 4 / 4`, then cleanup removed
the disposable fixture and temporary allowlist.

Responsive Chrome inspection passed at 390×844 and 844×390 phone views and
768×1024 and 1024×768 tablet views. Every view had zero horizontal overflow and
the lesson controls met the 44×44 CSS-pixel minimum. The later staging real-route
run found sub-44 shared shell links; the fix is described below. This is
responsive layout evidence only: actual touch-event emulation was not exposed
by the connected browser control and remains open rather than being inferred
from viewport inspection. Browser 200% zoom and operating-system reduced-motion
execution are optional follow-up evidence and are not UI-G closure gates.

## Required browser matrix

Record `pass`, `fail` or `blocked`; a blank row is not a pass.

| Environment | Required coverage | Version and hardware | Completion | Blocking findings | Evidence ref |
|---|---|---|---|---|---|
| macOS | Safari compatibility and lesson completion | Safari 26.5 / macOS 26.5 / Apple M1 | Pass | Successful-Split focus defect fixed and retested | Local Safari run above |
| Chrome desktop | Keyboard-only completion, focus, semantics and accessibility-tree inspection | Chrome 150.0.7871.124 / macOS 26.5 / Apple M1 | Pass | First-wrong-Split focus defect fixed and retested | `UI-G-CHROME-2026-07-15-A` |
| Chrome phone view | Narrow portrait/landscape layout and touch emulation | Chrome responsive 390×844 / 844×390 | Partial | Layout, reflow and target size pass; touch events pending | `UI-G-CHROME-2026-07-15-A` |
| Chrome tablet view | Larger touch layout and orientation change | Chrome responsive 768×1024 / 1024×768 | Partial | Layout, reflow and target size pass; touch events pending | `UI-G-CHROME-2026-07-15-A` |

Across the matrix, complete Learn, Discover, Split, Match, Build, Remember and
the private reflection. Verify Tab and Shift+Tab order, Enter and Space
activation, visible focus, focus transfer, 44 by 44 CSS-pixel targets,
responsive reflow, orientation changes and absence of clipping or horizontal
overflow. Inspect the browser accessibility tree for names, roles, states,
headings, status regions and hidden-answer safety.

Browser 200% zoom and operating-system reduced-motion execution may be recorded
as optional follow-up evidence. Their absence does not block UI-G closure. The
reduced-motion implementation and its automated static-path regressions remain
part of the engineering contract.

### Staging Chrome acceptance run — 2026-07-15

Two owner-authorised disposable assignments ran against the production-built
Vercel Preview and staging Supabase. The staging schema was advanced from 11 to
24 recorded migrations and verified to contain the Teaching Dictionary,
attempt ledger, private-reflection table and atomic plan RPC. The intentionally
local/dev-only `20260707120000` 873-word data backfill was not bypassed or
falsely recorded: staging has no full dictionary corpus, so its invariant
correctly rejected the empty baseline. The seven approved pilot words and the
canonical `D4_MOR_PREFIXES_UN` registry row were seeded only as disposable QA
data.

The desktop run completed the real authenticated route by keyboard, including
two wrong Split chops, scaffolded and held success, an invalid rebuild order,
checked spelling and dictation reloads, capitalization and punctuation recap,
reflection-draft reload, Finish, completed-page reflection and My Learning
history. The phone-sized 390×844 run completed the same route using direct
click/tap-equivalent controls. Split boundaries measured 44×144 CSS pixels and
the route had no horizontal overflow. Tablet inspection at 820×1180 also had
no horizontal overflow.

Both assignments verified `1 / 16 / 14 / 1 / 4 / 4 / 4`. The deliberately
lowercase and punctuation-free raw sentences were retained while all authored
target tokens remained correct. The first fixture was removed before the
second was created. True touch-event injection and controlled performance
throttling are not exposed by the connected Chrome surface and remain open.

This run found two accessibility wording/target defects outside the assessment
contract. Rebuild briefly announced an internal part identifier; it now
announces the child-facing tile text. Shared Parent/Child and Back-to-week links
measured 32–36px high; they now use a 44px minimum target. Both fixes are
covered by TypeScript, ESLint, production build and Word Lab regressions and
require the final refreshed-preview spot check before this proof can close.

VoiceOver, NVDA and TalkBack are not required for UI-G sign-off. If used, their
results may be recorded as optional exploratory evidence and must not be
represented as completed when they were not run.

## Required state checks

| Check | Safari | Chrome desktop | Chrome phone | Chrome tablet | Notes |
|---|---|---|---|---|---|
| No pointer-, hover- or audio-only action | Pass | Pass | Partial | Partial | Keyboard/direct-control paths pass; touch-event execution remains open |
| Split error status appears once | Pass | Pass | Inspected | Inspected | Named status present in semantic snapshot |
| Two-miss scaffold and focus transfer | Pass | Pass | Inspected | Inspected | Both Safari and Chrome focus defects fixed and retested |
| Correct split held until Rebuild | Pass | Pass | Inspected | Inspected | |
| Cleaver ignored by accessibility tree | Pass | Pass | Pass | Pass | No cleaver control/name in semantic snapshots |
| Recall contains no visible or accessible answer | Pass | Pass | Not run | Not run | All four spelling and dictation recall states inspected on desktop |
| Labels, headings, progress and status are understandable | Pass | Pass | Inspected | Inspected | |
| Feedback remains clear without colour | Pass | Pass | Inspected | Inspected | Text/cross/status supplied alongside colour |
| Sound off and blocked audio still complete | Pass | Pass | Not run | Not run | Sound-off full completion passed; blocked-audio simulation not run |
| Narration replay and mute are operable | Pass | Pass | Inspected | Inspected | |
| Reduced motion uses immediate static changes | Optional | Optional | Optional | Optional | Automated static-path regression remains required |
| Resume: Learn and first wrong Split | Pass | Pass | Not run | Not run | |
| Resume: scaffold and held correct Split | Pass | Pass | Not run | Not run | |
| Resume: spelling, dictation and reflection | Pass | Pass | Not run | Not run | |

Any inaccessible control, focus trap, answer exposure, missing status
announcement or touch failure blocks this proof.

## Bundle and Web Vitals

The production build must run `npm run adle:d4-mor-bundle-regression`. Its JSON
output records the route entry chunks, Word Lab dynamic chunk and compressed
size. Warm or malformed/non-allowlisted sessions must not request the dynamic
chunk, and the Word Lab chunk must remain at or below 153,600 compressed bytes.

Engineering bundle preparation passed again from `a088ed0` plus the acceptance fixes:
the Word Lab is isolated in one 38,391-byte raw / 11,105-byte gzip chunk, its
implementation markers are absent from the warm ADLE entry chunks, and the
accessible lazy-loading state rendered before the lesson in browser QA.
Production-preview network and Web Vitals rows below remain pending human
execution.

| Run | Profile | Cache | LCP | INP | CLS | Long-task/interaction notes | Result |
|---|---|---|---|---|---|---|---|
| Mobile 1 | Fast 4G, 4x CPU | Cold | Pending | Pending | Pending | Pending | Pending |
| Mobile 2 | Fast 4G, 4x CPU | Cold | Pending | Pending | Pending | Pending | Pending |
| Mobile 3 | Fast 4G, 4x CPU | Cold | Pending | Pending | Pending | Pending | Pending |
| Desktop 1 | Clean Chrome | Cold | Pending | Pending | Pending | Pending | Pending |
| Desktop 2 | Clean Chrome | Cold | Pending | Pending | Pending | Pending | Pending |
| Desktop 3 | Clean Chrome | Cold | Pending | Pending | Pending | Pending | Pending |
| Responsive interaction | Chrome phone view, full interaction | Cold | Pending | Pending | Pending | Pending | Pending |

Record the median for each three-run group. Passing requires LCP at most 2.5
seconds, INP at most 200 milliseconds and CLS at most 0.1, with no individual
run above 125% of those limits. Retain the slowest trace outside the public
repository and record only an anonymised reference and checksum here.

## Database and cleanup result

For each completed assignment, run the guarded live-smoke verification before
cleanup and record `1 header / 16 items / 14 attempts / 1 reflection / 4
learning / 4 taught / 4 schedule`. Reload the completed route and verify the
same counts. Cleanup must leave zero child, assignment, item and reflection rows.

## Sign-off

| Decision | Record |
|---|---|
| Accessibility proof | Pending |
| Performance proof | Pending |
| Blocking issues | Responsive touch execution, production-preview Web Vitals and genuine-child proof remain open |
| Signed by / date | Pending |

Do not change the proof register from `not_started` until every required row is
complete and the database cleanup has passed.
