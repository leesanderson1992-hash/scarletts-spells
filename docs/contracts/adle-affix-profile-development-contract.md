# ADLE shared affix profile development contract

Status: authoring and drift contract for the shared affix compiler. Dynamic
Prefix has an active, observed all-five-profile production writer boundary.
Dynamic Affix V3 has a guarded all-ten-profile writer boundary whose default
remains `legacy_authoritative` until an authorised environment selects another
mode.

## Adding or changing a profile mapping

A production Dynamic Prefix V2 or Dynamic Affix V3 microskill must have exactly
one entry in `SHARED_AFFIX_PROFILE_REGISTRY`. The mapping declares route and
recipe version, position, reviewed forms, split/build/meaning/choice policies,
intentional assignment count, legacy guided shape, schedule role and reward
role. Prefix entries also declare introduction/example and dictionary-readiness
requirements. They may hold released fallback Prefix introduction copy. The shared
compiler must never gain a microskill literal to support the mapping.

The production selector and profile loader remain the selection authority. A
mapping cannot activate a profile, add an activity, or supply a missing
Teaching Dictionary fact. New profile work must update the existing route
registry and loader allowlist under its own authorised behaviour change before
it can be mapped.

Dynamic Affix profiles define governed eligibility and pedagogical constraints.
They do not define a fixed production transfer roster. Transfer candidates are
selected dynamically from all reviewed, route-ready Teaching Dictionary
members of the selected profile using the versioned
`dynamic_affix_transfer_selection_v1` policy.

That policy preserves authentic words first in their existing oldest-first
order. Transfer selection then fills coverage gaps in this order: declared
suffix forms, Meaning Sort groups, and the existing direct-versus-changed
Cleaver contrast for one-form profiles. Remaining ties use declared form order,
declared meaning-group order, direct before changed, and normalized en-GB word
text. Database UUIDs, relation order, insertion order and timestamps are never
ranking inputs. The resulting transfer order is lesson semantics and must be
preserved by V3, assignment-plan and runtime parity.

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
or live assignment-eligible target, use the deterministic Teaching Dictionary
selector to place the target in every intended authentic slot, then compare
payloads, validators, runtime reconstruction and assignment bindings.

Tests must also prove exact blockers for removed/contradictory facts,
determinism under reviewed-fact shuffling, and absence of production
microskill literals in the compiler. Run the semantic production baseline and
generated architecture drift check after any mapping change.

## Activation separation

This registry is inventory, not an activation switch. Prefix and Affix
activation remain owned by Teaching Dictionary profile state and their route
environment gates. Assignment writers may reach the shared compiler only
through `dynamic-prefix-compiler-rollout.ts` or
`dynamic-affix-compiler-rollout.ts`. Each boundary owns its authority registry,
mode, fail-closed policy and telemetry. Direct shared-compiler imports from
selectors, route resolution, runtime adapters, renderers or completion actions
are prohibited.

Dynamic Affix retains its V3 payload and historical readers. Its rollout adds
no persisted shared snapshot, content/profile write or historical backfill.
Retirement of either legacy compiler or any V2/V3 reader requires separate
approval after production observation.

## Reviewed Prefix presentation policy

`dynamic_prefix_pedagogy_v1` is content-driven. Its immutable release catalog
owns prefix labels, meanings, rules, examples, target forms, deterministic
choice order, meaning/category mappings, and per-member valid-choice audits.
The database profile projection is assignment-time authority; renderers must
not contain microskill prose or generate copy.

New pedagogy snapshots serialize one teaching-card array for Learn, selected-
prefix feedback, and Reflection. Incorrect feedback describes only the selected
record and ends with `Try again.` It must not identify or direct the child to
the target. The `prefix_form` meaning policy is reserved for a real form-choice
activity and must not be labelled Meaning Sort in learner copy.

Dynamic Prefix Cleaver retries use the additive
`prefix_teaching_cards_retry_v1` presentation policy. Its shared default is
profile-neutral, points the child back to today's Prefix cards, ends with
`Try again.`, and never names the target prefix or reveals the correct split.
Missing policy data on historical Prefix V2 payloads resolves to that safe
route default. A more specific hint is allowed only when reviewed as
`non_answer_revealing` and serialized through route data. Dynamic Affix keeps
its existing explicit suffix feedback behavior.

Prefix Dictation evaluates the authored target token independently from the
rest of the sentence. Deterministic token alignment may derive non-target
substitutions, insertions and omissions from the existing full-sentence
attempt for Reflection, but those context slips never change target evidence,
learning-item state, scheduling or rewards and never create another raw-answer
store.
