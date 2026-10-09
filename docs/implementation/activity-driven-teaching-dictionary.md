# Activity-driven Teaching Dictionary implementation

The [activity variant inventory](../../lib/adle/composable-lesson/activity-variants.ts) is versioned against the current seven ADLE route recipes. It records each named micro skill's question parts, conditional parts, word scope, required fact ownership, and the specialist compiler/validator adapter. The [manager assessment](../../lib/teaching-dictionary-manager/activity-assessment.ts) presents those parts on each word page. A released member is the current green-tick authority; a populated draft remains *Needs review* until the route compiler validates it. Evidence approval remains an independent action.

The manager's **Save and validate** action saves a versioned draft first. If the shared publication validator passes, it publishes through the existing audited RPC and attempts the existing prefix/suffix release compiler. Failed or incomplete work remains a recoverable draft. Shared canonical facts are edited with ordinary fields; word parts, cuts, joins, meaning choice and dictation target have visual controls. Advanced route JSON remains available for specialist facts the form does not yet express.

For an active word whose other published facts are unchanged, a definition-only edit uses a separate versioned publication RPC. It checks the current word, metadata, dictation and morphology identities inside the transaction; it does not replace an existing member or alter a frozen lesson.

## -ity pilot

The [candidate derivation](../../lib/adle/morphology/derived-suffix-candidate.ts) accepts only a reviewed, direct base/root + `ity` analysis with exact surface reconstruction, approved dictionary metadata, a published definition, an exact dictation target, and immutable source hashes. It excludes ambiguous meaning categories and multi-part analyses that need a distinct teaching split. Thus `activity` can continue through its existing released member but is not guessed from `act + ive + ity`.

The [read-only audit](<../../app/(authenticated)/admin/teaching-dictionary/routes/page.tsx>) compares these candidates with the current released `-ity` pool and lists exact blockers. `ADLE_ITY_DERIVED_SELECTION_MODE=shadow` compares lesson selections in logs while leaving the released pool authoritative. `enabled` adds qualifying reviewed candidates to the selector and the canonical intake readiness projection. The default (unset) uses released members only. Enable only after shadow results and learner-flow proof show matching question answers, valid group selection, and immutable snapshots.

Derived selections bind reviewed morphology, dictionary-word and dictation source hashes in Snapshot v3. The validator accepts either a released suffix member or reviewed morphology as the per-word structural authority; existing snapshots are unchanged.

## Remaining route migration

1. Verify the inventory against each specialist compiler's generated activities, including conditional and variant-specific questions. Replace the manager's draft-message-to-activity mapping with structured blocker codes returned by those validators. A green tick for a new candidate must be based on generated question and answer validation for the *role actually selected*.
2. Complete the `-ity` shadow comparison with a reachable staging dictionary and disposable learner, then test selection, Finish, reload, and snapshot replay before enabling it. The local test environment currently cannot reach the configured Supabase host (`fetch failed`), so this proof has not happened.
3. Generalise reviewed-fact candidate adapters route by route: remaining suffixes, prefixes, base words, compounds, `-ing`, comparative/superlative, then generic. Their answer shapes and group checks differ; each retains its released member fallback until the new selector passes parity and learner flow proof. Add each route's eligible pool and top blockers to the overview as its adapter lands.
4. Keep route activation, child eligibility and evidence approval governed separately. A reviewed dictionary fact is not a new route release or evidence approval.

This branch intentionally leaves the `-ity` rollout flag unset. It does not claim automatic dictionary selection is enabled in Production or that all route families have migrated.
