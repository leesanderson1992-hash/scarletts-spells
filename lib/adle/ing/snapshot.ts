import { canonicalSnapshotJson, fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION, SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION, SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION,
  type CompiledIngSpecialistSnapshotV3, type SpecialistCanonicalActivitySnapshotV3, type SpecialistSnapshotAuthorityV3,
  type SpecialistSnapshotV3ValidationItem, type SpecialistSnapshotV3ValidationResult } from "../composable-lesson/specialist-snapshot-v3-contracts";
import type { AssignmentHeaderDraft, AssignmentItemDraft } from "../assignment-persistence";
import { createPersistedRouteMetadataV2 } from "../composable-lesson/persisted-route-metadata";
import type { PersistedCurriculumReleaseAuthorityV2 } from "../composable-lesson/contracts";
import type { IngLessonV1 } from "./contracts";
import { ingTransformation, validateIngLesson } from "./lesson";

export function ingActivityDeclarations(lesson: IngLessonV1): Omit<SpecialistCanonicalActivitySnapshotV3, "itemBindings">[] {
  const list: Omit<SpecialistCanonicalActivitySnapshotV3, "itemBindings" | "order" | "contractVersion">[] = [];
  function add(activityId: string, concept: string, mode: string, sectionKey: SpecialistCanonicalActivitySnapshotV3["sectionKey"], payload: Record<string, unknown>, wordSnapshotIds: string[]) {
    list.push({ activityId, label: activityId, sectionKey, canonical: { concept, mode, contractVersion: 1 }, payload, wordSnapshotIds, ownership: "assignment_items" });
  }
  add("teaching-pages", "INTRODUCTION", "teaching_page", "lesson_intro", { config: lesson.teaching }, lesson.words.map(w => w.canonicalWordId));
  const meaning = [0, 2, 4].map(index => lesson.words[index]);
  add("meaning-match", "MEANING_MATCH", "word_to_definition", "guided_practice", { targets: meaning.map(w => ({ canonicalWordId: w.canonicalWordId, word: w.word, definition: w.meaning })) }, meaning.map(w => w.canonicalWordId));
  for (const index of [1, 3, 5]) { const word = lesson.words[index]; add(`scrabble:${word.canonicalWordId}`, "SCRABBLE", "ing_tiles", "guided_practice", { word: { canonicalWordId: word.canonicalWordId, base: word.base, word: word.word } }, [word.canonicalWordId]); }
  for (const target of lesson.queuedTargets) { const word = lesson.words.find(w => w.canonicalWordId === target.canonicalWordId)!; add(`cleaver:${word.canonicalWordId}`, "CLEAVER", "ing_transform_target", "guided_practice", { transformation: ingTransformation(word) }, [word.canonicalWordId]); }
  for (const word of lesson.words) add(`cover:${word.canonicalWordId}`, "COVER_CHECK", "whole_word", "lesson_production", { canonicalWordId: word.canonicalWordId, word: word.word, splitPoints: [] }, [word.canonicalWordId]);
  for (const word of lesson.words) add(`dictation:${word.canonicalWordId}`, "DICTATION", "single_word_gap", "lesson_dictation", { canonicalWordId: word.canonicalWordId, word: word.word, sentence: word.dictationSentence, audioText: word.audioText }, [word.canonicalWordId]);
  add("lesson-reflection", "LESSON_REFLECTION", "standard_lesson_reflection", "lesson_reflection", { promptKey: `ing:${lesson.microSkillKey}:reflection:v1`, promptText: lesson.reflectionPrompt }, lesson.words.map(w => w.canonicalWordId));
  return list.map((entry, index) => ({ ...entry, contractVersion: 3, order: index + 1 }));
}

export function ingAssignmentItems(lesson: IngLessonV1, childId: string, parentUserId: string, date: string): AssignmentItemDraft[] {
  const items: AssignmentItemDraft[] = [];
  for (const activity of ingActivityDeclarations(lesson)) {
    const ids: (string | null)[] = activity.activityId === "teaching-pages" ? [null, null]
      : activity.sectionKey === "lesson_production" || activity.sectionKey === "lesson_dictation" || activity.activityId.startsWith("cleaver:") || activity.activityId.startsWith("scrabble:") ? [activity.wordSnapshotIds[0]] : [null];
    ids.forEach((canonicalWordId, index) => {
      const position = items.length + 1;
      const word = lesson.words.find(w => w.canonicalWordId === canonicalWordId);
      items.push({ childId, parentUserId, domainModule: "spelling", itemType: `adle_${activity.sectionKey}`, sourceType: "adle_composer",
        sourceEntityId: `adle:${childId}:${date}:${position}`, templateKey: activity.activityId === "teaching-pages" ? index === 0 ? "MICRO_READ_ONLY_INTRO" : "LESSON_WORDS_INTRO" : activity.canonical.concept,
        targetWord: word?.word ?? null, position, status: "ready",
        promptData: { ingActivityId: activity.activityId, canonical: activity.canonical, ...(activity.activityId === "teaching-pages" && index === 0 ? { ingLesson: lesson } : {}) },
        metadata: { planDate: date, sectionKey: activity.sectionKey, provenance: word?.learningItemId ? "authentic_target" : "generated_dictionary_practice", microSkillKey: lesson.microSkillKey,
          canonicalWordId, expectedEvidenceKind: activity.sectionKey === "lesson_production" || activity.sectionKey === "lesson_dictation" ? "controlled_word" : null,
          adleLearningItemRef: word?.learningItemId ?? null, composerPolicyVersion: "ing_six_word_v1", schedulePolicyVersion: "review_policy_v1_2026-07-04" } });
    });
  }
  return items;
}

export function compileIngSnapshotV3(params: { lesson: IngLessonV1; release: PersistedCurriculumReleaseAuthorityV2; contentAuthorities: readonly SpecialistSnapshotAuthorityV3[]; childId: string; parentUserId: string; date: string }) {
  if (!validateIngLesson(params.lesson)) throw new Error("ing_unapproved_lesson");
  const lessonRouteMetadata = createPersistedRouteMetadataV2("ing_endings_word_lab", params.release);
  const items = ingAssignmentItems(params.lesson, params.childId, params.parentUserId, params.date);
  const activities = ingActivityDeclarations(params.lesson).map(activity => ({ ...activity, itemBindings: items.filter(item => item.promptData.ingActivityId === activity.activityId).map(item => ({ sourceEntityId: item.sourceEntityId, position: item.position, inputSource: "assignment_items.prompt_data" as const })) }));
  const base = {
    snapshotSchemaVersion: 3 as const, compilerVersion: SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION, validatorVersion: SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION, canonicalContractRegistryVersion: SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION,
    route: { routeId: "ing_endings_word_lab" as const, routeVersion: "v1" as const }, recipe: { recipeKey: "ing_endings_word_lab" as const, recipeVersion: "v1" as const },
    payload: { kind: "ing_endings_lesson_v1" as const, version: 1 as const, resolvedLesson: params.lesson }, runtime: { adapterKey: "ing_endings_v1" as const, rendererKey: "ing_endings_guided" as const },
    assignment: { generationSource: "adle_composer_v1" as const, itemCount: items.length }, taxonomy: { microSkillKey: params.lesson.microSkillKey },
    words: params.lesson.words.map((word, index) => ({ wordSnapshotId: word.canonicalWordId, order: index + 1, canonicalWordId: word.canonicalWordId, displayWord: word.word,
      learningItemId: word.learningItemId, lineageKind: word.learningItemId ? "authentic_target" as const : "transfer" as const })),
    activities, segments: [{ segmentId: "lesson" as const, wordSnapshotIds: params.lesson.words.map(word => word.canonicalWordId), activityIds: activities.map(activity => activity.activityId) }] as const,
    contentVersions: [...params.contentAuthorities], provenance: { sourceKind: "compiled_specialist_assignment" as const, fingerprintAlgorithm: "sha256" as const, fingerprintVersion: 1 as const },
  };
  const snapshot: CompiledIngSpecialistSnapshotV3 = { ...base, provenance: { ...base.provenance, sourceFingerprint: fingerprintSnapshotValue(base) } };
  const header: AssignmentHeaderDraft = { childId: params.childId, parentUserId: params.parentUserId, assignmentDate: params.date, title: "ADLE Daily Plan", status: "pending",
    targetWords: params.lesson.words.map(word => word.word), reviewWords: [], assignmentGenerationSource: "adle_composer_v1", lessonRouteMetadata };
  const validation = validateIngSnapshotV3(snapshot, { lessonRouteMetadata, assignmentGenerationSource: header.assignmentGenerationSource,
    items: items.map(item => ({ ...item, sectionKey: item.metadata.sectionKey, canonicalWordId: item.metadata.canonicalWordId })) });
  if (!validation.ok) throw new Error(validation.blockers.map(blocker => blocker.code).join(","));
  return { header, items, snapshot };
}
export function isIngSnapshotV3(value: unknown): value is CompiledIngSpecialistSnapshotV3 {
  return !!value && typeof value === "object" && (value as CompiledIngSpecialistSnapshotV3).snapshotSchemaVersion === 3 && (value as CompiledIngSpecialistSnapshotV3).route?.routeId === "ing_endings_word_lab";
}
export function validateIngSnapshotV3(value: unknown, context: { lessonRouteMetadata?: unknown; assignmentGenerationSource?: string | null; items?: readonly SpecialistSnapshotV3ValidationItem[] } = {}): SpecialistSnapshotV3ValidationResult {
  const bad = (code: "specialist_payload_mismatch" | "specialist_fingerprint_mismatch" | "specialist_item_binding_mismatch" | "specialist_content_provenance_malformed"): SpecialistSnapshotV3ValidationResult => ({ ok: false, blockers: [{ code }] });
  if (!isIngSnapshotV3(value)) return bad("specialist_payload_mismatch");
  const snapshot = value;
  try {
    if (snapshot.compilerVersion !== SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION || snapshot.validatorVersion !== SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION || snapshot.canonicalContractRegistryVersion !== SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION
      || snapshot.route.routeVersion !== "v1" || snapshot.recipe.recipeKey !== "ing_endings_word_lab" || snapshot.recipe.recipeVersion !== "v1" || snapshot.payload.kind !== "ing_endings_lesson_v1" || snapshot.payload.version !== 1
      || !validateIngLesson(snapshot.payload.resolvedLesson) || snapshot.runtime.adapterKey !== "ing_endings_v1" || snapshot.runtime.rendererKey !== "ing_endings_guided"
      || snapshot.assignment.generationSource !== "adle_composer_v1" || snapshot.assignment.itemCount !== 19 + snapshot.payload.resolvedLesson.queuedTargets.length
      || snapshot.taxonomy.microSkillKey !== snapshot.payload.resolvedLesson.microSkillKey || (context.assignmentGenerationSource !== undefined && context.assignmentGenerationSource !== "adle_composer_v1")) return bad("specialist_payload_mismatch");
    const metadata = context.lessonRouteMetadata as AssignmentHeaderDraft["lessonRouteMetadata"];
    if (context.lessonRouteMetadata !== undefined && (!metadata || metadata.metadataSchemaVersion !== 2 || metadata.route.routeId !== snapshot.route.routeId || metadata.route.routeVersion !== "v1"
      || metadata.recipe.recipeKey !== snapshot.recipe.recipeKey || metadata.payload.kind !== snapshot.payload.kind || metadata.payload.version !== 1)) return bad("specialist_payload_mismatch");
    const authorities = ["release_manifest", "activation_revision", "dependency_set", "ing_word_members", "teaching_content", "teaching_dictionary_closure", "recipe_content"];
    if (snapshot.contentVersions.length !== 7 || authorities.some(kind => snapshot.contentVersions.filter(authority => authority.authorityType === kind).length !== 1)
      || snapshot.contentVersions.some(authority => !authority.authorityId || !/^[a-f0-9]{64}$/.test(authority.sourceHash))) return bad("specialist_content_provenance_malformed");
    if (metadata?.metadataSchemaVersion === 2 && (!snapshot.contentVersions.some(authority => authority.authorityType === "release_manifest" && authority.authorityId === metadata.curriculumRelease.releaseManifestId && authority.sourceHash === metadata.curriculumRelease.releaseManifestSha256)
      || !snapshot.contentVersions.some(authority => authority.authorityType === "activation_revision" && authority.authorityId === metadata.curriculumRelease.activationRevisionId)
      || !snapshot.contentVersions.some(authority => authority.authorityType === "dependency_set" && authority.sourceHash === metadata.curriculumRelease.dependencyFingerprint))) return bad("specialist_content_provenance_malformed");
    const expectedWords = snapshot.payload.resolvedLesson.words.map((word, index) => ({ wordSnapshotId: word.canonicalWordId, order: index + 1, canonicalWordId: word.canonicalWordId, displayWord: word.word,
      learningItemId: word.learningItemId, lineageKind: word.learningItemId ? "authentic_target" : "transfer" }));
    if (canonicalSnapshotJson(snapshot.words) !== canonicalSnapshotJson(expectedWords)) return bad("specialist_payload_mismatch");
    const expectedActivities = ingActivityDeclarations(snapshot.payload.resolvedLesson);
    if (snapshot.activities.length !== expectedActivities.length || snapshot.activities.some((activity, index) => { const { itemBindings: _bindings, ...declaration } = activity; void _bindings; return canonicalSnapshotJson(declaration) !== canonicalSnapshotJson(expectedActivities[index]); })) return bad("specialist_payload_mismatch");
    const bindings = snapshot.activities.flatMap(activity => activity.itemBindings.map(binding => ({ activity, binding })));
    if (bindings.length !== snapshot.assignment.itemCount || new Set(bindings.map(pair => pair.binding.sourceEntityId)).size !== bindings.length) return bad("specialist_item_binding_mismatch");
    if (context.items) {
      if (context.items.length !== bindings.length) return bad("specialist_item_binding_mismatch");
      const expected = ingAssignmentItems(snapshot.payload.resolvedLesson, "validation", "validation", "2000-01-01");
      for (const { activity, binding } of bindings) {
        const item = context.items.find(candidate => candidate.sourceEntityId === binding.sourceEntityId);
        const reference = expected[binding.position - 1];
        if (!item || !reference || item.position !== binding.position || item.sectionKey !== activity.sectionKey || item.promptData.ingActivityId !== activity.activityId
          || item.canonicalWordId !== reference.metadata.canonicalWordId || item.templateKey !== reference.templateKey || item.targetWord !== reference.targetWord
          || canonicalSnapshotJson(item.promptData) !== canonicalSnapshotJson(reference.promptData)
          || (item.metadata && item.metadata.adleLearningItemRef !== reference.metadata.adleLearningItemRef)) return bad("specialist_item_binding_mismatch");
      }
    }
    const segments = [{ segmentId: "lesson", wordSnapshotIds: snapshot.words.map(word => word.wordSnapshotId), activityIds: snapshot.activities.map(activity => activity.activityId) }];
    if (canonicalSnapshotJson(snapshot.segments) !== canonicalSnapshotJson(segments)) return bad("specialist_payload_mismatch");
    if (fingerprintSnapshotValue({ ...snapshot, provenance: { sourceKind: snapshot.provenance.sourceKind, fingerprintAlgorithm: snapshot.provenance.fingerprintAlgorithm, fingerprintVersion: snapshot.provenance.fingerprintVersion } }) !== snapshot.provenance.sourceFingerprint) return bad("specialist_fingerprint_mismatch");
    return { ok: true, snapshot };
  } catch { return bad("specialist_payload_mismatch"); }
}
