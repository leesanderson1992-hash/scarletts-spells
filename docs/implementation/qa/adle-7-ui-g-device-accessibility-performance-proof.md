# ADLE 7-UI-G device, accessibility and performance proof

Status: ready for human execution; no physical-device pass is recorded.

This record closes `7UI-PROOF-D4-MOR-A11Y` and
`7UI-PROOF-D4-MOR-PERF` only after every blocking row below passes. Browser
emulation and the existing accessibility-tree inspection are supporting
engineering evidence, not substitutes for these runs.

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

## Physical matrix

Record `pass`, `fail` or `blocked`; a blank row is not a pass.

| Platform | Browser / assistive technology | Version and hardware | Completion | Blocking findings | Evidence ref |
|---|---|---|---|---|---|
| macOS | Safari + VoiceOver; physical keyboard only | Pending | Pending | Pending | Pending |
| Windows | Edge + NVDA; physical keyboard only | Pending | Pending | Pending | Pending |
| iPhone | Safari + VoiceOver; portrait and landscape | Pending | Pending | Pending | Pending |
| iPad | Safari + VoiceOver; touch and orientation change | Pending | Pending | Pending | Pending |
| Android | Chrome + TalkBack | Pending | Pending | Pending | Pending |

For each row, complete Learn, Discover, Split, Match, Build, Remember and the
private reflection. Verify Tab and Shift+Tab order where applicable, Enter and
Space activation, visible focus, focus transfer, 44 by 44 CSS-pixel targets,
200% zoom/reflow, orientation changes and absence of clipping or horizontal
overflow.

## Required state checks

| Check | macOS | Windows | iPhone | iPad | Android | Notes |
|---|---|---|---|---|---|---|
| No pointer-, hover- or audio-only action | Pending | Pending | Pending | Pending | Pending | |
| Split error announced once | Pending | Pending | Pending | Pending | Pending | |
| Two-miss scaffold and focus transfer | Pending | Pending | Pending | Pending | Pending | |
| Correct split held until Rebuild | Pending | Pending | Pending | Pending | Pending | |
| Cleaver ignored by accessibility tree | Pending | Pending | Pending | Pending | Pending | |
| Recall contains no visible or accessible answer | Pending | Pending | Pending | Pending | Pending | |
| Labels, headings, progress and status understood | Pending | Pending | Pending | Pending | Pending | |
| Feedback remains clear without colour | Pending | Pending | Pending | Pending | Pending | |
| Sound off and blocked audio still complete | Pending | Pending | Pending | Pending | Pending | |
| Narration replay and mute are operable | Pending | Pending | Pending | Pending | Pending | |
| Reduced motion uses immediate static changes | Pending | Pending | Pending | Pending | Pending | |
| Resume: Learn and first wrong Split | Pending | Pending | Pending | Pending | Pending | |
| Resume: scaffold and held correct Split | Pending | Pending | Pending | Pending | Pending | |
| Resume: spelling, dictation and reflection | Pending | Pending | Pending | Pending | Pending | |

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
| Physical Android | Chrome, full interaction | Record | Pending | Pending | Pending | Pending | Pending |

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
