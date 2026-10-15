# Teaching Dictionary Manager

The admin workspace at `/admin/teaching-dictionary` has two independent review outcomes.

The linked `/admin/teaching-dictionary/bulk-assign` workspace approves up to 100
canonical words for one micro-skill at a time. Its filters use active dictionary
metadata and structured morphology. Each confirmed word receives a separate
reviewed evidence release, so the single-word editor can later withdraw that
word's approval independently. The batch publishes in one database transaction;
it does not create or activate ADLE route content.

1. **Evidence approval** publishes an exact canonical-word/micro-skill pair through the existing word-skill package review and publication authority. A manager withdrawal removes only the manager's release. Other effective sources remain visible. Production review, publication and withdrawal controls must all be enabled for this action.
2. **ADLE lesson content release** uses the shared server preflight in `lib/teaching-dictionary-manager/lesson-preflight.ts`. It invokes the registered route's native loader, selection, compiler and complete-member coverage check. Launch rechecks the exact preflight fingerprint and records compiler witnesses, reviewer and immutable release version. Prefix/suffix releases replace the complete profile; base/compound, homophone, comparative and `-ing` releases use their governed publishers. Activation remains separate: Launch requires an enabled route and never enables an inactive route. Enabled package replacements use `all_eligible` scope. The existing queue, demand thresholds and scheduler choose assignments; the admin workflow has no child eligibility selector or child preview.

Dictionary facts, source provenance, canonical morphology and route content are saved as immutable manager drafts. Publishing a draft appends definition and route-content versions, and versions canonical morphology. Existing canonical word IDs remain stable. Protected shared facts are saved for the guarded lesson release transaction, which publishes them with the complete group and retains previous authorities for assignment replay. A dependency on another protected route produces a named blocker. Audited rollback restores the previous profile/activation and shared facts, including dictation heads and the absence of an earlier shared definition. A later dictionary publication blocks rollback. Older definition-only publication remains a compatibility path for payloads without the new authoring fields.

Manual creation and CSV import create drafts. The CSV accepts `normalised_word` or `targetWord`, shared facts, source columns, canonical morphology JSON arrays, and optional route columns. Import errors identify rows. A reviewed teaching-content submission can be opened as a draft, including `renew`; publishing complete prefix content adds it to a reviewed prefix profile. The manager does not generate AI suggestions.

Local checks: `npm run adle:teaching-dictionary-manager-regression`, `npm run adle:learner-evidence-regression`, `npx tsx scripts/adle-dynamic-suffix-ity-regression.ts`, `npx tsx scripts/adle-dynamic-suffix-tion-regression.ts`, `npx tsc --noEmit`, and `npm run build`. The migration and prefix/suffix publication/rollback functions were also exercised against disposable PostgreSQL 17 fixtures.

Production rollout must apply the migration before serving the manager route. The repository's writing-context AI release gate requires approval bound to the exact new commit SHA, then a held candidate readback and staged promotion. Do not reuse the previous SHA approval. The owner's 2026-10-09 standing permission authorises fresh exact-SHA approvals for ordinary deployments under the unchanged AI configuration and limits, without a repeated approval request. After promotion, enable the existing word-skill review controls only after their current authority is verified, and keep the existing AI model and spending policy intact.


## Word workspace and exact reviews

Overview is open and collapsible. Micro-skills, each built route lesson, its activities, and Advanced are collapsible. The horizontal Overview edits spelling display, part of speech, meaning, spoken syllable count, phonemes and schwa. The word-parts builder owns canonical ordered morphology, joins, generated word sum, multiple ordered transformations, and a separately reviewed written syllable breakdown. Written syllable boundaries never substitute for morphology boundaries or the spoken count. Canonical affix meanings and imported/released analyses are suggestions that require selection and Save; conflicts remain visible.

Save Overview records the exact shared-content fingerprint. Save lesson details requires that same shared content to have an Overview review, then records the exact route version and dictionary dependency fingerprint. A later edit requires a new review. Joining a micro-skill continues to use the existing governed evidence approval. A joined skill without a built route shows **No Route Available** and has no lesson section. The horizontal lesson-check matrix links to missing fields. Launch lives inside its lesson section.

## Reviewed dictation variation

`teaching_dictionary_dictation_sets` is an immutable reviewed pool; its head is a separate current pointer. Each variant has a stable ID, sentence, selected zero-based target token index and exact audio text. The first variant matches the legacy canonical sentence and target. Every variant is validated and exercised through its route compiler. New assignments choose deterministically from the released pool and freeze the text, target and variant provenance. Existing snapshots retain their text.

Base/compound pools are frozen in dictionary closure words; `-ing` pools are frozen in the member authority. Homophone and comparative lessons retain paired passages and store reviewed group variations in their immutable native authority. They never substitute Overview's single-word pool for paired passages.

See [the staged implementation and verification receipt](teaching-dictionary-adle-launch-2026-10-15.md) for rollout evidence. Schema deployment precedes the editor, and route launch remains gated by its actual compiler and activation facts.
