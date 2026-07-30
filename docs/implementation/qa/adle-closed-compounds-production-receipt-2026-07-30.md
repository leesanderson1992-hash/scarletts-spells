# ADLE Closed Compounds production receipt — 2026-07-30

Scope: `D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS`

Written production authority: Katie Sanderson, 2026-07-30.

## Verified production release

- Production dictionary batch: `2f6db9a1-f844-4577-9631-c3740f6ea7ae`.
- Active production profile: `b1db7f78-e7d4-484a-9279-03334ed98980`.
- Package SHA-256: `841f13b525f6be22274ad3fa0b40957e43f9fadae72ecc873003c38b32096547`.
- Seven active, approved, assignment-eligible and transfer-eligible explicit compound facts were recorded.
- The production profile is `production_enabled=true`.
- The approved repair superseded only the former `playground` sentence shared with `football`; the active sentence is now `The children played in the playground.` The prior dictionary row remains historical.
- The guarded serializable transaction confirmed no changes to learner assignments, assignment items, attempt events, reflections, or review schedules.

## Runtime release

- Production gate: `ADLE_CLOSED_COMPOUND_PRODUCTION_ENABLED=enabled`.
- Production deployment: `dpl_7QNw3SyH4weqWj573LT4LDDHHvUy`, Ready.
- Stable production route smoke: `/learn/week/adle` returned the expected authenticated login boundary while unauthenticated; the route did not expose a staging-only path.

## Staging child verification

The separate child-completed staging assignment `ce90d26b-a925-41af-82de-11fff8f99952` was verified before promotion:

- status `completed`, all 18 snapshot items completed and scoped to Closed Compounds;
- 10 guided, 4 independent controlled-recall and 4 Dictation events;
- no incorrect independent production evidence;
- one saved reflection; and
- taught-word and review-schedule records present.

Production remains dictionary-driven: every future assignment selects four words from the explicit approved pool and freezes its selected members and presentation order in its immutable snapshot.
