# ADLE shared affix profile development contract

Status: authoring and drift contract for the shared affix compiler. Dynamic
Prefix has a guarded all-five-profile writer boundary; Dynamic Affix remains dark.

## Adding or changing a profile mapping

A production Dynamic Prefix V2 or Dynamic Affix V3 microskill must have exactly
one entry in `SHARED_AFFIX_PROFILE_REGISTRY`. The mapping declares route and
recipe version, position, reviewed forms, split/build/meaning/choice policies,
intentional assignment count, legacy guided shape, schedule role and reward
role. Prefix entries also declare introduction/example and dictionary-readiness
requirements. They may hold released fallback Prefix introduction copy. The shared
compiler must never gain a microskill literal to support the mapping.

The production selector and profile loader remain the selection authority. A
mapping cannot activate a profile, broaden a candidate set, change form or
meaning coverage, add an activity, or supply a missing Teaching Dictionary
fact. New profile work must update the existing route registry and loader
allowlist under their own authorised behavior change before it can be mapped.

## Reviewed word requirements

Every selected word must provide:

- canonical identity, display and audio text;
- semantic base/root and child teaching surface;
- reviewed base and derived meanings and a declared meaning-group ID;
- an affix form declared by the profile and its display label/meaning;
- child-facing parts, joins and one reviewed Cleaver split;
- one contextual dictation with the exact target token and matching audio;
- reviewed true morphology, transformations, notes and provenance at the
  Teaching Dictionary boundary while preserving the established Prefix V2
  public snapshot.

The compiler reconstructs only from these facts. It does not infer a spelling
change. Supported current transformation types are generated in
`shared-affix-profiles.json`; adding a type requires a typed contract change,
compiler validation, a reviewed package fixture and mutation coverage.

## Required parity evidence

Every current regression fixture must compile through both the authoritative
compiler and shared compiler plus compatibility adapter. For every reviewed
or live assignment-eligible target, use the unchanged selector to place the
target in every intended authentic slot, then compare payloads, validators,
runtime reconstruction and assignment bindings.

Tests must also prove exact blockers for removed/contradictory facts,
determinism under reviewed-fact shuffling, and absence of production
microskill literals in the compiler. Run the semantic production baseline and
generated architecture drift check after any mapping change.

## Activation separation

This registry is inventory, not an activation switch. Prefix activation remains
owned by Teaching Dictionary profile state and the route environment gate. The
Prefix assignment writer may reach the shared compiler only through
`dynamic-prefix-compiler-rollout.ts`, whose separate authority registry and
mode control shadow, enforced and shared behavior. Direct imports from Prefix
selectors, route resolution, runtime adapters, renderers or completion actions
are prohibited.

Dynamic Affix assignment writers must not import the shared compiler. Affix
writer migration, persisted shared snapshots and retirement of V2/V3 readers
require separate approval and rollback proof.
