# ADLE 7-UI-G observation ledger

Status: pending real-child gated pilot run.

Final human acceptance is executed through the
[device/accessibility/performance proof](./adle-7-ui-g-device-accessibility-performance-proof.md)
and [genuine-child proof](./adle-7-ui-g-child-validation-proof.md). Both remain
pending until their required sessions are completed; prepared checklists are
not recorded proof. The device proof uses Mac Safari and controlled Chrome
desktop/phone/tablet modes. Native Windows, Android, iOS and screen-reader runs
are optional rather than closure requirements.

Owner status (2026-07-14): current Word Lab preview accepted. This records
owner validation of the vertical experience, but does not replace the pending
browser accessibility, performance or genuine-child proof.

Engineering status (updated 2026-07-15): automated gates, authenticated real-route
completion, accessibility-tree inspection, responsive-layout inspection,
recall-safe reloads and post-completion database verification passed with a
disposable local child and two staging-only fixtures. The first staging fixture
was cleaned before the second was created. The gate
remains disabled outside the explicit allowlist and this ledger is not a
genuine-child human sign-off.

| Observation | Result |
|---|---|
| Adult verbal prompts | Pending; target 0 |
| Hesitations over five seconds | Pending |
| Productive exploration vs confusion | Pending |
| Failed pointer/touch drags | Direct-tap alternatives passed; actual touch-event execution remains pending |
| Keyboard-only completion | Pass in full authenticated Chrome 150 desktop run; Split, Match, Build and Finish used native keyboard activation |
| Touch completion | Phone/tablet responsive layout and target sizes passed; actual touch-event execution remains pending |
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

## Explicit Learn and corrective Split evidence

| Gate | Result |
|---|---|
| Learn opens before Discover | Pass |
| Three authored Learn screens and narration | Pass; exact definition, `un-` jobs and four words |
| Intro bindings remain teaching-only | Pass; 2 unique bindings, 0 attempts |
| Internal Guide state names hidden | Pass |
| Learn screen resume | Pass |
| First wrong chop remains visible and announced | Pass; red cross and corrective status |
| Two-miss scaffold | Pass; incorrect boundaries disabled and correct boundary focused |
| Scaffold resume | Pass; miss count, disabled boundaries and focus restored |
| Enter activation on focused boundary | Pass |
| Correct split feedback held | Pass; no automatic advance |
| Held-correct reload | Pass |
| Explicit Rebuild transition | Pass; advances once to the existing assembly rail |
| Narrow layout / horizontal overflow | Pass / none at the browser's narrow breakpoint |
| JSONB payload round-trip activation | Pass; order-insensitive exact structural validation |
| Authenticated full completion | Pass |
| Completed-page and My Learning reflection | Pass |
| Counts before/after completed reload | Pass; 1 / 16 / 14 / 1 unchanged |
| Browser console warnings/errors | Pass; none |
| Authenticated interactive browser completion | Pass on `/learn/week/adle` |
| Accessibility-tree and labelled-control inspection | Pass |
| Narrow responsive viewport / horizontal overflow | Pass / none |
| Checked controlled-spelling reload | Pass; resumed at word 2 without prior comparison |
| Checked dictation reload | Pass; resumed at sentence 2 without prior comparison |
| Completed-route reload / duplicate protection | Pass; counts unchanged |
| Browser console errors | Pass; none |
| Conditional Word Lab bundle boundary | Pass; warm entry contains no Word Lab markers |
| Word Lab production chunk budget | Pass; 11,026 bytes gzip against 153,600-byte budget at `f2b2371` |
| Local Mac Safari authenticated completion | Pass on Safari 26.5 / macOS 26.5 / Apple M1; owner-authorised disposable fixture |
| Safari successful-Split focus transfer | Initial run found body focus; fixed and targeted Safari rerun focuses **Rebuild the word** |
| Safari completed-route reload / database idempotency | Pass; completed page and reflection retained; 1 / 16 / 14 / 1 unchanged |
| Chrome desktop authenticated keyboard completion | Pass on Chrome 150.0.7871.124 / macOS 26.5 / Apple M1; `UI-G-CHROME-2026-07-15-A` |
| Chrome first-wrong-Split focus continuity | Initial run found body focus; fixed and targeted rerun keeps **Split after letter 1** active |
| Chrome semantics and recall-answer inspection | Pass; named controls/statuses, decorative cleaver and answer-safe spelling/dictation recall |
| Chrome reflection/completion reload and database idempotency | Pass; draft retained, Finish stayed authenticated, completed reflection retained, 1 / 16 / 14 / 1 unchanged |
| Chrome phone/tablet responsive inspection | Lesson controls pass at 390×844, 844×390, 768×1024 and 1024×768 with zero horizontal overflow; staging later found and fixed 32–36px shared shell links |
| Staging Chrome desktop completion | Pass on the production-built Vercel Preview with staging Supabase; keyboard path, reload safety, reflection history and 1 / 16 / 14 / 1 verified |
| Staging Chrome phone-sized completion | Pass at 390×844 using direct tap-equivalent clicks; Split boundaries 44×144 and zero horizontal overflow; true touch injection remains pending |
| Staging accessibility amendments | Internal rebuild identifier replaced with child-facing tile text; shared shell links raised from 32–36px to a 44px minimum |
| Staging migration verification | 24 migrations recorded; UI-G dictionary/attempt/reflection/RPC schema present; local-only 873-word backfill intentionally not marked applied |
| Chrome console errors | Pass for application; only third-party Grammarly extension warnings were present |
| Final acceptance proof templates | Prepared; touch events, Web Vitals and child results remain pending; 200% zoom and OS reduced-motion execution are optional |
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

The staging run also submitted `It was unkind to leave her out` without final
punctuation. The raw sentence was retained, the comparison identified the
missing full stop, and target-token correctness remained true. No assessment,
evidence, mastery, schedule or reward row was created from the private
reflection.

## Remaining acceptance

The Safari and Chrome desktop runs now verify complete authenticated operation,
keyboard activation, semantic accessibility-tree output, focus transfer,
answer-safe recall, private reflection persistence and idempotent completion.
Chrome responsive phone/tablet layouts also pass overflow and 44×44 target-size
inspection. Actual touch-event execution, production-preview Web Vitals and
genuine-child observation remain pending and therefore UI-G is not closed.
Browser 200% zoom and operating-system reduced-motion execution are optional
follow-up evidence rather than closure gates. VoiceOver and other
screen-reader runs, native Windows, Android and physical phone/tablet runs are
optional follow-up coverage. These changes do not enable the feature for any
non-allowlisted child.
