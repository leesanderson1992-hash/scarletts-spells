import type { AssignmentHeaderDraft, AssignmentItemDraft } from "../assignment-persistence";
import { canonicalSnapshotJson, fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { PersistedCurriculumReleaseAuthorityV2, PersistedLessonRouteMetadataV2 } from "../composable-lesson/contracts";
import {
  SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION, SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION, SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION,
  type CompiledHomophoneSpecialistSnapshotV3, type SpecialistCanonicalActivitySnapshotV3,
  type SpecialistSnapshotAuthorityV3, type SpecialistSnapshotV3ValidationItem, type SpecialistSnapshotV3ValidationResult,
} from "../composable-lesson/specialist-snapshot-v3-contracts";
import { validateHomophoneLessonSnapshot, type HomophoneLessonSnapshotV1 } from "./lesson";

export type HomophoneWordBinding = { word: string; canonicalWordId: string; learningItemId: string | null };

function sectionFor(id: string): SpecialistCanonicalActivitySnapshotV3["sectionKey"] {
  if (id === "teaching") return "lesson_intro";
  if (id === "bin-sort" || id === "balloon-pop") return "guided_practice";
  if (id.startsWith("cover:")) return "lesson_production";
  if (id.startsWith("dictation:")) return "lesson_dictation";
  return "lesson_reflection";
}

function activityDeclarations(lesson: HomophoneLessonSnapshotV1, bindings: readonly HomophoneWordBinding[]): Omit<SpecialistCanonicalActivitySnapshotV3, "itemBindings">[] {
  const byWord = new Map(bindings.map(binding => [binding.word, binding.canonicalWordId]));
  const ids = (words: readonly string[]) => words.map(word => byWord.get(word)!);
  const raw: { id: string; concept: string; mode: string; payload: Record<string, unknown>; words: string[] }[] = [
    { id: "teaching", concept: "INTRODUCTION", mode: "teaching_page", payload: { intro: lesson.lesson.teachingIntro, words: lesson.lesson.words }, words: lesson.lesson.words.map(word => word.word) },
    { id: "bin-sort", concept: "MEANING_SORT", mode: "sentence_choice", payload: { prompts: lesson.lesson.binSort }, words: lesson.lesson.words.map(word => word.word) },
    { id: "balloon-pop", concept: "BALLOON_POP", mode: "timed_sentence_choice", payload: { prompts: lesson.lesson.balloonPrompts, seconds: 45 }, words: lesson.lesson.words.map(word => word.word) },
    ...lesson.lesson.coverCheck.map(word => ({ id: `cover:${word}`, concept: "COVER_CHECK", mode: "whole_word", payload: { word }, words: [word] })),
    ...lesson.lesson.dictationPassages.map((passage, index) => ({ id: `dictation:${index}`, concept: "DICTATION", mode: "two_word_gaps", payload: { passage }, words: [...passage.targets] })),
    { id: "reflection", concept: "LESSON_REFLECTION", mode: "standard_lesson_reflection", payload: { prompt: "Which clue will help you choose these words next time?" }, words: lesson.lesson.words.map(word => word.word) },
  ];
  return raw.map((entry, index) => ({ contractVersion: 3, activityId: entry.id, label: entry.id, order: index + 1, sectionKey: sectionFor(entry.id),
    canonical: { concept: entry.concept, mode: entry.mode, contractVersion: 1 }, payload: entry.payload,
    wordSnapshotIds: ids(entry.words), ownership: entry.id === "reflection" ? "route_owned" : "assignment_items" }));
}

function itemSpecs(lesson: HomophoneLessonSnapshotV1, bindings: readonly HomophoneWordBinding[]) {
  const byWord = new Map(bindings.map(binding => [binding.word, binding]));
  return [
    { activityId: "teaching", word: null, templateKey: "MICRO_READ_ONLY_INTRO", context: {} },
    ...lesson.lesson.binSort.map(prompt => ({ activityId: "bin-sort", word: prompt.answer, templateKey: "MEANING_SORT", context: { sentence: prompt.sentence } })),
    { activityId: "balloon-pop", word: null, templateKey: "BALLOON_POP", context: {} },
    ...lesson.lesson.coverCheck.map(word => ({ activityId: `cover:${word}`, word, templateKey: "COVER_CHECK", context: {} })),
    ...lesson.lesson.dictationPassages.flatMap((passage, index) => passage.targets.map((word, targetSlot) => ({
      activityId: `dictation:${index}`, word, templateKey: "DICTATION", context: { passageId: passage.id, segments: passage.segments, targetSlot } }))),
  ].map(spec => ({ ...spec, binding: spec.word ? byWord.get(spec.word)! : null, sectionKey: sectionFor(spec.activityId) }));
}

function assignmentItems(lesson: HomophoneLessonSnapshotV1, bindings: readonly HomophoneWordBinding[], childId: string, parentUserId: string, date: string): AssignmentItemDraft[] {
  return itemSpecs(lesson, bindings).map((spec, index) => ({ childId, parentUserId, domainModule: "spelling", itemType: `adle_${spec.sectionKey}`,
    sourceType: "adle_composer", sourceEntityId: `adle:${childId}:${date}:${index + 1}`, templateKey: spec.templateKey,
    targetWord: spec.word, position: index + 1, status: "ready",
    promptData: { homophoneActivityId: spec.activityId, canonical: { concept: spec.templateKey, contractVersion: 1 }, ...spec.context },
    metadata: { planDate: date, sectionKey: spec.sectionKey, provenance: spec.binding?.learningItemId ? "authentic_target" : "generated_dictionary_practice",
      microSkillKey: lesson.microSkillKey, canonicalWordId: spec.binding?.canonicalWordId ?? null,
      expectedEvidenceKind: spec.sectionKey === "lesson_production" || spec.sectionKey === "lesson_dictation" ? "controlled_word" : null,
      adleLearningItemRef: spec.binding?.learningItemId ?? null, composerPolicyVersion: "homophone_full_set_v2", schedulePolicyVersion: "review_policy_v1_2026-07-04" } }));
}

export function compileHomophoneSnapshotV3(params: { lesson: HomophoneLessonSnapshotV1; bindings: readonly HomophoneWordBinding[];
  release: PersistedCurriculumReleaseAuthorityV2; contentAuthorities: readonly SpecialistSnapshotAuthorityV3[];
  childId: string; parentUserId: string; date: string }) {
  const { lesson, bindings } = params;
  if (validateHomophoneLessonSnapshot(lesson).length || bindings.length !== lesson.lesson.words.length
    || bindings.some((binding, index) => binding.word !== lesson.lesson.words[index].word || !binding.canonicalWordId)
    || new Set(bindings.map(binding => binding.canonicalWordId)).size !== bindings.length
    || !bindings.some(binding => binding.learningItemId)) throw new Error("homophone_assignment_words_invalid");
  const items = assignmentItems(lesson, bindings, params.childId, params.parentUserId, params.date);
  const declarations = activityDeclarations(lesson, bindings);
  const activities: SpecialistCanonicalActivitySnapshotV3[] = declarations.map(activity => ({ ...activity,
    itemBindings: items.filter(item => item.promptData.homophoneActivityId === activity.activityId).map(item => ({ sourceEntityId: item.sourceEntityId, position: item.position, inputSource: "assignment_items.prompt_data" })) }));
  const base = { snapshotSchemaVersion: 3 as const, compilerVersion: SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION,
    validatorVersion: SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION, canonicalContractRegistryVersion: SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION,
    route: { routeId: "homophone_word_lab" as const, routeVersion: "v2" as const }, recipe: { recipeKey: "homophone_word_lab" as const, recipeVersion: "v2" as const },
    payload: { kind: "homophone_lesson_v2" as const, version: 2 as const, resolvedLesson: lesson },
    runtime: { adapterKey: "homophone_v2" as const, rendererKey: "homophone_guided" as const },
    assignment: { generationSource: "adle_composer_v1" as const, itemCount: items.length }, taxonomy: { microSkillKey: lesson.microSkillKey },
    words: bindings.map((binding, index) => ({ wordSnapshotId: binding.canonicalWordId, order: index + 1, canonicalWordId: binding.canonicalWordId,
      displayWord: binding.word, learningItemId: binding.learningItemId, lineageKind: binding.learningItemId ? "authentic_target" as const : "transfer" as const })),
    activities, segments: [{ segmentId: "lesson" as const, wordSnapshotIds: bindings.map(binding => binding.canonicalWordId), activityIds: activities.map(activity => activity.activityId) }] as const,
    contentVersions: [...params.contentAuthorities], provenance: { sourceKind: "compiled_specialist_assignment" as const, fingerprintAlgorithm: "sha256" as const, fingerprintVersion: 1 as const } };
  const snapshot: CompiledHomophoneSpecialistSnapshotV3 = { ...base, provenance: { ...base.provenance, sourceFingerprint: fingerprintSnapshotValue(base) } };
  const lessonRouteMetadata: PersistedLessonRouteMetadataV2 = { metadataSchemaVersion: 2, route: { routeId: "homophone_word_lab", routeVersion: "v2" },
    recipe: { recipeKey: "homophone_word_lab", recipeVersion: "v2" }, payload: { kind: "homophone_lesson_v2", version: 2 }, curriculumRelease: params.release };
  const header: AssignmentHeaderDraft = { childId: params.childId, parentUserId: params.parentUserId, assignmentDate: params.date,
    title: "ADLE Daily Plan", status: "pending", targetWords: bindings.map(binding => binding.word), reviewWords: [], assignmentGenerationSource: "adle_composer_v1",
    lessonRouteMetadata };
  const validation = validateHomophoneSnapshotV3(snapshot, { lessonRouteMetadata: header.lessonRouteMetadata, assignmentGenerationSource: header.assignmentGenerationSource,
    items: items.map(item => ({ ...item, sectionKey: item.metadata.sectionKey, canonicalWordId: item.metadata.canonicalWordId })) });
  if (!validation.ok) throw new Error(validation.blockers.map(blocker => blocker.code).join(","));
  return { header, items, snapshot };
}

export function isHomophoneSnapshotV3(value: unknown): value is CompiledHomophoneSpecialistSnapshotV3 {
  return !!value && typeof value === "object" && (value as CompiledHomophoneSpecialistSnapshotV3).snapshotSchemaVersion === 3
    && (value as CompiledHomophoneSpecialistSnapshotV3).route?.routeId === "homophone_word_lab";
}

export function validateHomophoneSnapshotV3(value: unknown, context: { lessonRouteMetadata?: unknown; assignmentGenerationSource?: string | null;
  items?: readonly SpecialistSnapshotV3ValidationItem[] } = {}): SpecialistSnapshotV3ValidationResult {
  const bad = (code: "specialist_payload_mismatch" | "specialist_fingerprint_mismatch" | "specialist_item_binding_mismatch" | "specialist_content_provenance_malformed"): SpecialistSnapshotV3ValidationResult => ({ ok: false, blockers: [{ code }] });
  if (!isHomophoneSnapshotV3(value)) return bad("specialist_payload_mismatch");
  const snapshot = value;
  try {
    const lesson = snapshot.payload.resolvedLesson;
    if (snapshot.compilerVersion !== SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION || snapshot.validatorVersion !== SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION
      || snapshot.canonicalContractRegistryVersion !== SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION || snapshot.route.routeVersion !== "v2"
      || snapshot.recipe.recipeKey !== "homophone_word_lab" || snapshot.recipe.recipeVersion !== "v2" || snapshot.payload.kind !== "homophone_lesson_v2" || snapshot.payload.version !== 2
      || validateHomophoneLessonSnapshot(lesson).length || snapshot.runtime.adapterKey !== "homophone_v2" || snapshot.runtime.rendererKey !== "homophone_guided"
      || snapshot.taxonomy.microSkillKey !== lesson.microSkillKey || snapshot.assignment.generationSource !== "adle_composer_v1"
      || (context.assignmentGenerationSource !== undefined && context.assignmentGenerationSource !== "adle_composer_v1")) return bad("specialist_payload_mismatch");
    const metadata = context.lessonRouteMetadata as AssignmentHeaderDraft["lessonRouteMetadata"];
    if (context.lessonRouteMetadata !== undefined && (!metadata || metadata.metadataSchemaVersion !== 2 || metadata.route.routeId !== "homophone_word_lab"
      || metadata.route.routeVersion !== "v2" || metadata.recipe.recipeKey !== "homophone_word_lab" || metadata.payload.kind !== "homophone_lesson_v2" || metadata.payload.version !== 2)) return bad("specialist_payload_mismatch");
    const authorities = ["release_manifest", "activation_revision", "dependency_set", "teaching_content"];
    if (snapshot.contentVersions.length !== authorities.length || authorities.some(kind => snapshot.contentVersions.filter(authority => authority.authorityType === kind).length !== 1)
      || snapshot.contentVersions.some(authority => !authority.authorityId || !/^[a-f0-9]{64}$/.test(authority.sourceHash))) return bad("specialist_content_provenance_malformed");
    if (metadata?.metadataSchemaVersion === 2 && (!snapshot.contentVersions.some(authority => authority.authorityType === "release_manifest" && authority.authorityId === metadata.curriculumRelease.releaseManifestId && authority.sourceHash === metadata.curriculumRelease.releaseManifestSha256)
      || !snapshot.contentVersions.some(authority => authority.authorityType === "activation_revision" && authority.authorityId === metadata.curriculumRelease.activationRevisionId)
      || !snapshot.contentVersions.some(authority => authority.authorityType === "dependency_set" && authority.sourceHash === metadata.curriculumRelease.dependencyFingerprint))) return bad("specialist_content_provenance_malformed");
    const bindings = snapshot.words.map(word => ({ word: word.displayWord, canonicalWordId: word.canonicalWordId, learningItemId: word.learningItemId }));
    if (bindings.length !== lesson.lesson.words.length || !bindings.some(binding => binding.learningItemId)
      || bindings.some((binding, index) => binding.word !== lesson.lesson.words[index].word || !binding.canonicalWordId || !/^[0-9a-f-]{36}$/i.test(binding.canonicalWordId))
      || new Set(bindings.map(binding => binding.canonicalWordId)).size !== bindings.length
      || snapshot.words.some(word => word.wordSnapshotId !== word.canonicalWordId || word.lineageKind !== (word.learningItemId ? "authentic_target" : "transfer"))) return bad("specialist_payload_mismatch");
    const declarations = activityDeclarations(lesson, bindings);
    if (snapshot.activities.length !== declarations.length || snapshot.activities.some((activity, index) => { const { itemBindings: _ignored, ...declaration } = activity; void _ignored; return canonicalSnapshotJson(declaration) !== canonicalSnapshotJson(declarations[index]); })) return bad("specialist_payload_mismatch");
    const pairs = snapshot.activities.flatMap(activity => activity.itemBindings.map(binding => ({ activity, binding })));
    if (snapshot.assignment.itemCount !== itemSpecs(lesson, bindings).length || pairs.length !== snapshot.assignment.itemCount
      || new Set(pairs.map(pair => pair.binding.sourceEntityId)).size !== pairs.length) return bad("specialist_item_binding_mismatch");
    if (context.items) {
      if (context.items.length !== pairs.length) return bad("specialist_item_binding_mismatch");
      const expected = assignmentItems(lesson, bindings, "validation", "validation", "2000-01-01");
      for (const { activity, binding } of pairs) {
        const item = context.items.find(candidate => candidate.sourceEntityId === binding.sourceEntityId);
        const reference = expected[binding.position - 1];
        if (!item || !reference || item.position !== binding.position || item.sectionKey !== activity.sectionKey
          || item.promptData.homophoneActivityId !== activity.activityId || item.canonicalWordId !== reference.metadata.canonicalWordId
          || item.targetWord !== reference.targetWord || item.templateKey !== reference.templateKey
          || canonicalSnapshotJson(item.promptData) !== canonicalSnapshotJson(reference.promptData)
          || (item.metadata && item.metadata.adleLearningItemRef !== reference.metadata.adleLearningItemRef)) return bad("specialist_item_binding_mismatch");
      }
    }
    if (canonicalSnapshotJson(snapshot.segments) !== canonicalSnapshotJson([{ segmentId: "lesson", wordSnapshotIds: snapshot.words.map(word => word.wordSnapshotId), activityIds: snapshot.activities.map(activity => activity.activityId) }])) return bad("specialist_payload_mismatch");
    if (fingerprintSnapshotValue({ ...snapshot, provenance: { sourceKind: snapshot.provenance.sourceKind, fingerprintAlgorithm: snapshot.provenance.fingerprintAlgorithm, fingerprintVersion: snapshot.provenance.fingerprintVersion } }) !== snapshot.provenance.sourceFingerprint) return bad("specialist_fingerprint_mismatch");
    return { ok: true, snapshot };
  } catch { return bad("specialist_payload_mismatch"); }
}

/** Parent-created specialist assignments can render without an R6 session row.
 * Their checkpoint key still comes from the frozen specialist snapshot. */
export function homophoneParentManualSnapshotFingerprint(value: unknown, adapterKey: string | null): string | null {
  return adapterKey === "homophone_v2" && isHomophoneSnapshotV3(value)
    ? value.provenance.sourceFingerprint : null;
}
