# Dynamic Affix V3 shared compiler staging proof — STAGING_ACCEPTED

Recorded at `2026-08-06T19:45:34Z` (`2026-08-06T20:45:34+01:00`).

## Acceptance resolution

The staging operator confirmed a fresh real-learner completion on the current
implementation deployment. It persisted the required Dynamic Affix schedule
route independently of `ADLE_CANONICAL_INTAKE_ENABLED`:

- deployment: `dpl_6Jw7iHm47E9Pyy1wKPLLWiUfgXw3` (`Ready`);
- runtime implementation SHA:
  `1616a30fa9d4db8214a9600decb7203d9dd9a519`;
- compiler: `shared_authoritative`, with exact public V3 fingerprint, plan and
  binding parity and zero legacy invocations;
- completion: 14 attempts, four Cover Checks, four Dictations, four
  taught/evidence rows, one authentic learning item, one authentic schedule,
  one authentic schedule route, zero transfer schedules/routes, one review
  bundle and Reflection, and four rewards.

The earlier `0 / 4` route observation is retained in
`BLOCKED-2026-08-06T190000Z.md` as historical rollback evidence. It was specific
to the immutable older application and is not a failure of the current
implementation. The older application still proved that shared-created public
V3 bytes load, resume and complete without a payload-version change. Forward
restoration proved that the same transfer-bearing assignment resumes and
completes on the exact implementation deployment with authentic-only
scheduling and routing.

## Completed proof

- All four authority modes were deployed to the verified staging project:
  `legacy_authoritative`, `shadow`, `enforced_parity`, and
  `shared_authoritative`.
- Shadow made zero writes; enforced mismatch handling made zero writes; shared
  authority made zero legacy calls.
- Exact public V3 bytes, assignment plan, runtime bindings and fingerprints
  matched in every applicable authority comparison.
- All ten profiles and 640 ordered one-to-four-authentic selections were
  covered, totaling 2,560 authority decisions and 266 mutation checks.
- All seven staging transformation classes completed through the real learner
  UI, including wrong feedback/disclosure, Cover Check, Dictation,
  reload/resume, Reflection and completion.
- Authentic words retained learning-item, schedule, route and
  `scheduleAllProducedWords` behavior. Transfer words retained taught,
  evidence, state, breadth and reward effects without a learning item, review
  schedule or schedule route.
- Cover Check and Dictation did not double-score. Historical V3 readers,
  runtime, resume, completion, Reflection and the all-word reward bridge were
  preserved.
- App/script TypeScript checks, ESLint, Next.js 16.2.12 production build, 33
  semantic production regressions, architecture/documentation checks, Cover
  Shutter Playwright (`3` passed / `3` expected skips), Dynamic Affix V3
  Playwright (`1` passed), and the compiler benchmark passed. Benchmark maxima
  were `p95=4.823ms`, `p99=7.484ms`, and `0.017MB` heap delta.

## Runtime implementation file manifest

The runtime implementation commit changes these 34 files from the audited
baseline:

```text
app/dev/adle/dynamic-affix-v3/fixture.tsx
app/dev/adle/dynamic-affix-v3/page.tsx
app/learn/week/adle/actions.ts
app/learn/week/adle/dynamic-suffix/actions.ts
app/learn/week/adle/dynamic-suffix/page.tsx
docs/contracts/adle-affix-profile-development-contract.md
docs/contracts/adle-shared-affix-compiler-contract.md
docs/generated/adle-composable-lesson/blocker-reference.json
docs/generated/adle-composable-lesson/route-and-activity-reference.md
docs/generated/adle-composable-lesson/shared-affix-blockers.json
docs/generated/adle-composable-lesson/shared-affix-profiles.json
docs/implementation/adle-composable-lesson-migration-tracker.md
lib/adle/loaders/session-completion-loader.ts
lib/adle/morphology/dynamic-affix-assignment-plan.ts
lib/adle/morphology/dynamic-affix-assignment-writer.ts
lib/adle/morphology/dynamic-affix-compiler-rollout.ts
lib/adle/morphology/dynamic-affix-completion-policy.ts
lib/adle/morphology/dynamic-affix-legacy-compiler.ts
lib/adle/morphology/dynamic-affix-v3-compatibility.ts
lib/adle/morphology/dynamic-suffix-profile-loader.ts
lib/adle/morphology/shared-affix-compatibility.ts
lib/adle/morphology/shared-affix-profile-registry.ts
package.json
scripts/adle-composable-documentation-regression.ts
scripts/adle-daily-plan-compatibility-live-proof.ts
scripts/adle-dynamic-affix-compiler-benchmark.ts
scripts/adle-dynamic-affix-completion-contract-regression.ts
scripts/adle-dynamic-affix-production-observation.ts
scripts/adle-dynamic-affix-shared-authority-regression.ts
scripts/adle-dynamic-affix-shared-staging-proof-regression.ts
scripts/adle-dynamic-affix-shared-staging-proof.ts
scripts/adle-semantic-production-baseline.ts
scripts/generate-adle-composable-architecture.ts
tests/adle/dynamic-affix-v3-interaction.spec.ts
```

## Cleanup and boundaries

All explicitly tagged disposable staging fixture and auth data was deleted;
fixture and auth residue are zero. Protected staging counts returned to their
recorded baseline, and the ten-profile / forty-member projection remained at
fingerprint
`43ddc766593a2adb1b8f14eee82ea47d5e769eb18f1f0b8e06674542312a633f`.

The stable staging alias was verified read-only after acceptance and resolves
to the Ready deployment above. Synchronized `main` and `origin/main` remain at
the audited baseline `ec704af947f77a031a39dd27d8d1e27732609250` with
divergence `0 / 0`. Production, Dynamic Prefix, canonical-intake data and
backlog, Common Word Lab, Generic Snapshot, Closed Compound and Base Word were
not mutated.

The screenshot inventory is in `screenshot-index.md`. This receipt and the
runtime implementation SHA are the production-release handoff; no production
deployment or production configuration is authorized by this acceptance.
