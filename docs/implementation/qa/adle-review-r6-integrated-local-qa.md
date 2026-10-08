# Review R6 — integrated local QA surface

Date: 2026-08-26. Source base: `1f4e687157ab767faa88417e68b0953828f577e0`, fetched and matched to `origin/main` before this local fixture change. These changes are local; nothing was deployed or activated.

## Why the old preview was pink

`/dev/adle/review-writing-challenge` directly mounts `ReviewFreeWritingActivity`. It predates the R6 integration and does not mount the learner AppShell or WordLabScene. The actual learner route already mounts `ReviewR6Session`, which already wraps the same activity in WordLabScene. There was no integrated R6 fixture. This was missing QA coverage, not an unconnected production R6 shell.

## Open the integrated surface

From this isolated checkout, run `npm run dev:review-r6-qa`, then open:

<http://127.0.0.1:3217/dev/adle/review-r6>

The route redirects to a URL containing a scenario and a unique run ID. Save that exact URL to reopen its state. Expand **QA controls** to select a scenario or start another run. New runs do not reset older runs. The launcher refuses `.env` files, drops inherited credentials, binds to loopback, and enables only the development fixture flag.

## Shared production presentation

- `AppShell`, child mode, focus layout, with one synthetic QA learner. Its real account/navigation controls are intercepted within the QA boundary and cannot invoke account actions.
- `AdlePlanHeader`, `AdleEmptyPlan`, and `AdleReviewCompleteTransition`: extracted unchanged from the real learner page and reused by both routes.
- `ReviewR6Session` → `WordLabScene` → `ReviewFreeWritingActivity` → the existing segmented SVG wheel, timer, prompt, audio controls, attribution, and retrieval.
- `WordReflectionRepair` → shared `CoverShutter` for the actual repair UI.
- `BaseWordFamilyGuidedLesson`, using its existing compiled development payload and the same completion/resume props used by the learner adapter. Its completion transport is local rather than the production server action.
- `AdleSessionCelebration`, using an empty reward read model; no invented Review rewards.

The only new ReviewR6Session dependencies are optional gateway and stage-refresh callbacks. Their defaults remain the production server action and router refresh. There is no QA copy of the wheel, scene, writing editor, repair activity, specialist UI, or Celebration. No theme override or redesign was added. Any remaining pink/serif treatment inside shared R6 components is therefore visible here, not concealed by a fixture-only skin.

## Fixture controls

The 26 scenarios include Review + lesson, Review only, lesson only, nothing due, 1/5/10 targets, authoritative misspelling, unknown learner-confirmed attempt, suggested candidate, audio failure, several audio checks, existing cue after cold retrieval, first failed repair awaiting second success, two failed repairs terminal, mid-writing, Compare, Memory Cue, Look, Cover, Try Again, near-expiry, expired timer, finalized Review before lesson, specialist final reflection, and final Celebration.

The parent-extension passphrase is the disposable string `qa-parent`. Never enter a real password. The existing production password presentation is unchanged; the fixture authenticates only this synthetic string and does not store or log it.

Five frozen prompt candidates are local copies of the first signed-off candidate in each category from the locally available Writing Challenge v3 content package. Wording and configuration are preserved. This does not publish content or change Production selectability. The same production renderer decides which configuration fields are displayed.

## State and safety boundaries

The existing R3/R3.1/R4 development store was made instantiable so each run uses the existing pure state machines with an isolated snapshot. R2 timer/selection uses existing pure transitions. Local finalization requires the shared original-check/terminal-repair completion predicate. R5 database transactions, schedule advancement, reward writes, and R6 assignment generation are deliberately not called. This fixture demonstrates their learner-facing boundary, not their Production persistence implementation.

Fixture state is atomically saved to private JSON files in a checkout-specific `adle-review-r6-qa-*` directory under the OS temporary directory. It survives page and development-server restarts until those temporary files are removed. Specialist checkpoints are serialized through the same local API. This is disposable QA storage, not Production durability certification.

Both route and API require `NODE_ENV=development`, `ADLE_REVIEW_R6_QA=1`, and a loopback host. Cross-origin API requests are rejected. Production is refused even when the flag is set. No database clients, real learner IDs, schedule IDs, rollout mutations, Gate B/C operations, or prompt-state mutations are used by the new fixture backend. No credentials are required.

## Setup verification (not visual acceptance)

- TypeScript `tsc --noEmit`: pass.
- Targeted ESLint: pass.
- Existing R2, R3, R3.1, R4, R4 hydration, and R6 regressions: pass.
- `npm run adle:review-r6-qa-regression`: 26 scenarios, serialization restoration, immutable submission, one local completion receipt, all three extension durations, and isolation assertions pass.
- HTTP smoke: all 26 scenario pages and local writing hydration requests pass; cross-origin and non-loopback requests return 404.
- Real GET/POST handlers executed with `NODE_ENV=production` and the QA flag enabled return 404.
- Browser setup smoke: AppShell/WordLabScene/wheel mount; Spin → writing → submission → Finish Review opens the actual specialist adapter; its seeded final reflection → Finish Word Lab opens shared Celebration; reloading and restarting the credential-free development server preserve completion with exactly one local receipt.

The earlier standalone-preview screenshots are not final R6 acceptance evidence. The manual visual/interaction acceptance checklist remains paused. No READY FOR GATE C recommendation has been made.
