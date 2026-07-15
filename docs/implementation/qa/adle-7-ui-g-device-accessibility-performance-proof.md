# ADLE 7-UI-G device, accessibility and performance proof

Status: ready for final browser, Mac Safari and performance execution.

This record closes `7UI-PROOF-D4-MOR-A11Y` and
`7UI-PROOF-D4-MOR-PERF` only after every blocking row below passes. The agreed
UI-G acceptance boundary uses Mac Safari plus controlled Chrome desktop and
responsive-device modes. Native Windows, Android, iPhone/iPad and screen-reader
runs are optional follow-up coverage rather than closure requirements.

## Safety and build identity

| Field | Record |
|---|---|
| PR | `#2` — `review/adle-7-ui-g-word-lab` |
| Tested commit | Pending |
| Preview URL | Pending; record privately if it contains a deployment token |
| Supabase environment | Pending; staging project only |
| Disposable session ID | Pending; non-identifying value only |
| Observer | Pending |
| Test date | Pending |

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

## Required browser matrix

Record `pass`, `fail` or `blocked`; a blank row is not a pass.

| Environment | Required coverage | Version and hardware | Completion | Blocking findings | Evidence ref |
|---|---|---|---|---|---|
| macOS | Safari compatibility and lesson completion | Pending | Pending | Pending | Pending |
| Chrome desktop | Keyboard-only completion, focus, semantics and accessibility-tree inspection | Pending | Pending | Pending | Pending |
| Chrome phone view | Narrow portrait/landscape layout, touch emulation and 200% zoom/reflow | Pending | Pending | Pending | Pending |
| Chrome tablet view | Larger touch layout, orientation change and 200% zoom/reflow | Pending | Pending | Pending | Pending |

Across the matrix, complete Learn, Discover, Split, Match, Build, Remember and
the private reflection. Verify Tab and Shift+Tab order, Enter and Space
activation, visible focus, focus transfer, 44 by 44 CSS-pixel targets, 200%
zoom/reflow, orientation changes and absence of clipping or horizontal
overflow. Inspect the browser accessibility tree for names, roles, states,
headings, status regions and hidden-answer safety.

VoiceOver, NVDA and TalkBack are not required for UI-G sign-off. If used, their
results may be recorded as optional exploratory evidence and must not be
represented as completed when they were not run.

## Required state checks

| Check | Safari | Chrome desktop | Chrome phone | Chrome tablet | Notes |
|---|---|---|---|---|---|
| No pointer-, hover- or audio-only action | Pending | Pending | Pending | Pending | |
| Split error status appears once | Pending | Pending | Pending | Pending | Validate live-region structure in the accessibility tree |
| Two-miss scaffold and focus transfer | Pending | Pending | Pending | Pending | |
| Correct split held until Rebuild | Pending | Pending | Pending | Pending | |
| Cleaver ignored by accessibility tree | Pending | Pending | Pending | Pending | |
| Recall contains no visible or accessible answer | Pending | Pending | Pending | Pending | |
| Labels, headings, progress and status are understandable | Pending | Pending | Pending | Pending | |
| Feedback remains clear without colour | Pending | Pending | Pending | Pending | |
| Sound off and blocked audio still complete | Pending | Pending | Pending | Pending | |
| Narration replay and mute are operable | Pending | Pending | Pending | Pending | |
| Reduced motion uses immediate static changes | Pending | Pending | Pending | Pending | |
| Resume: Learn and first wrong Split | Pending | Pending | Pending | Pending | |
| Resume: scaffold and held correct Split | Pending | Pending | Pending | Pending | |
| Resume: spelling, dictation and reflection | Pending | Pending | Pending | Pending | |

Any inaccessible control, focus trap, answer exposure, missing status
announcement, touch failure or reduced-motion failure blocks this proof.

## Bundle and Web Vitals

The production build must run `npm run adle:d4-mor-bundle-regression`. Its JSON
output records the route entry chunks, Word Lab dynamic chunk and compressed
size. Warm or malformed/non-allowlisted sessions must not request the dynamic
chunk, and the Word Lab chunk must remain at or below 153,600 compressed bytes.

Engineering bundle preparation passed at `f2b2371`: the Word Lab is isolated in
one 38,100-byte raw / 11,026-byte gzip chunk, its implementation markers are
absent from the warm ADLE entry chunks, and the accessible lazy-loading state
rendered before the lesson in browser QA. Production-preview network and Web
Vitals rows below remain pending human execution.

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
| Blocking issues | Pending |
| Signed by / date | Pending |

Do not change the proof register from `not_started` until every required row is
complete and the database cleanup has passed.
