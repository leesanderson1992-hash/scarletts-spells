# ADLE 7-UI-G observation ledger

Status: pending real-child gated pilot run.

Engineering status (2026-07-14): automated gates, authenticated real-route
completion, accessibility-tree inspection, responsive-layout inspection,
recall-safe reloads and post-completion database verification passed with a
disposable local child. All fixtures were cleaned successfully. The gate
remains disabled outside the explicit allowlist and this ledger is not a
genuine-child human sign-off.

| Observation | Result |
|---|---|
| Adult verbal prompts | Pending; target 0 |
| Hesitations over five seconds | Pending |
| Productive exploration vs confusion | Pending |
| Failed pointer/touch drags | Direct-tap alternatives passed; physical touch pending |
| Keyboard-only completion | Native semantics/regression passed; browser key injection unavailable |
| Touch completion | Narrow layout and tap controls passed; physical device pending |
| Narration replays | Pending |
| Help levels used | Pending |
| Misunderstood affordances | Pending |
| Recall answer exposure | 0 in authenticated engineering run |
| Console or invalid-state errors | 0 in authenticated engineering run |
| Child explanation of `un-` | Pending |

Attach the uninterrupted real-route recording and database verification to the
final sign-off record. Automated checks do not replace this observation.

## Completed engineering evidence

| Gate | Result |
|---|---|
| Payload and exact 16-item fallback checks | Pass |
| Recall-safe resume and storage-failure checks | Pass |
| Atomic success, duplicate, concurrency and rollback checks | Pass |
| TypeScript, ESLint and production build | Pass |
| Adjacent composer/session/evidence/reward regressions | Pass |
| Local migration apply | Pass |
| Disposable child and seven-word readiness | Pass |
| Guarded pilot assignment generation | Pass |
| Dev preview HTTP smoke | Pass |
| Unauthenticated real-route redirect | Pass |
| Disposable fixture cleanup | Pass |
| Authenticated interactive browser completion | Pass on `/learn/week/adle` |
| Accessibility-tree and labelled-control inspection | Pass |
| Narrow responsive viewport / horizontal overflow | Pass / none |
| Checked controlled-spelling reload | Pass; resumed at word 2 without prior comparison |
| Checked dictation reload | Pass; resumed at sentence 2 without prior comparison |
| Completed-route reload / duplicate protection | Pass; counts unchanged |
| Browser console errors | Pass; none |
| Post-completion assignment header/items | Pass; 1 / 16 completed |
| Post-completion attempt events | Pass; 14 total (6 guided, 4 controlled, 4 dictation) |
| Post-completion learning/taught/schedule rows | Pass; 4 / 4 / 4 |
| Full dictation storage / target-token correctness | Pass |
| Disposable fixture cleanup | Pass; no child-scoped fixture rows remain |

## Refined Word Lab flow evidence

| Gate | Result |
|---|---|
| Guided lesson opens first in development preview | Pass |
| Development playground and restart controls | Pass |
| Discover paired-card layout / narrow stacking | Pass |
| Build prefix slot before fixed `tidy` base | Pass |
| Exact learner capitalization retained | Pass |
| Missing initial capital feedback | Pass |
| Target-token correctness unchanged | Pass |
| Remember recap precedes reflection | Pass |
| Reflection required before summary/Finish | Pass |
| Reflection draft survives reload | Pass |
| Completed-page reflection display | Pass |
| My Learning reflection history | Pass |
| Private reflection ownership isolation | Pass |
| Private reflection excluded from attempts/evidence | Pass; attempts remain 14 |
| Idempotent private reflection persistence | Pass; exactly 1 note |
| Post-completion database counts | Pass; 1 header / 16 items / 14 attempts / 1 note |
| Disposable fixture cleanup | Pass |

The capitalization QA intentionally submitted `it was unfair to change the
rules.`. The comparison retained the lowercase `i`, announced that a sentence
starts with a capital letter, and did not rewrite the response. The authored
target token `unfair` remained the only correctness target. The reflection was
then saved, reloaded, completed and shown in My Learning without creating an
assignment item, attempt or evidence event.

## Remaining human-device acceptance

The automated browser controller could focus controls but did not dispatch its
synthetic keyboard events, so a separate physical keyboard-only run is still
required for human-device sign-off. Physical touch, narration observation and
genuine-child comprehension/hesitation observations also remain pending. These
do not enable the feature for any non-allowlisted child.
