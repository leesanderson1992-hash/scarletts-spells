import { canonicalSnapshotJson, fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION, SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION, SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION,
  type CompiledComparativeSpecialistSnapshotV3, type SpecialistCanonicalActivitySnapshotV3, type SpecialistSnapshotAuthorityV3,
  type SpecialistSnapshotV3ValidationItem, type SpecialistSnapshotV3ValidationResult } from "../composable-lesson/specialist-snapshot-v3-contracts";
import type { AssignmentHeaderDraft, AssignmentItemDraft } from "../assignment-persistence";
import { createPersistedRouteMetadataV2 } from "../composable-lesson/persisted-route-metadata";
import type { PersistedCurriculumReleaseAuthorityV2 } from "../composable-lesson/contracts";
import { validateComparativeLesson } from "./lesson";
import type { ComparativeLessonV1 } from "./contracts";

export function comparativeActivityDeclarations(lesson: ComparativeLessonV1): Omit<SpecialistCanonicalActivitySnapshotV3, "itemBindings">[] {
  const declarations: Omit<SpecialistCanonicalActivitySnapshotV3, "itemBindings" | "order" | "contractVersion">[] = [];
  function add(activityId: string, concept: string, mode: string, sectionKey: SpecialistCanonicalActivitySnapshotV3["sectionKey"], payload: Record<string, unknown>, wordSnapshotIds: string[]) {
    declarations.push({ activityId, label: activityId, sectionKey, canonical: { concept, mode, contractVersion: 1 }, payload, wordSnapshotIds, ownership: "assignment_items" });
  }
  add("teaching-pages", "INTRODUCTION", "teaching_page", "lesson_intro", { config: lesson.teaching }, lesson.words.map(w => w.canonicalWordId));
  for (const sentence of lesson.sentenceTasks) {
    const family = lesson.families.find(f => f.familyKey === sentence.familyKey)!;
    add(`sentence:${sentence.id}`, "WORD_ASSEMBLY", "sentence_suffix", "guided_practice", { sentence, baseWord: family.words[0].word, forms: family.words.slice(1) }, family.words.slice(1).map(w => w.canonicalWordId));
  }
  add("degree-sort", "MEANING_SORT", "meaning", "guided_practice", { items: lesson.words.filter(w => w.degree !== "base").map(w => ({ id: w.canonicalWordId, text: w.word, destination: w.degree })), bins: [{ id: "comparative", label: "Comparative" }, { id: "superlative", label: "Superlative" }] }, lesson.words.filter(w => w.degree !== "base").map(w => w.canonicalWordId));
  for (const task of lesson.cleaverTasks) add(`cleaver:${task.target.canonicalWordId}`, "CLEAVER", "transform_target", "guided_practice", { transformation: task.transformation, question: task.question }, [task.target.canonicalWordId]);
  for (const word of lesson.words) add(`cover:${word.canonicalWordId}`, "COVER_CHECK", "whole_word", "lesson_production", { canonicalWordId: word.canonicalWordId, word: word.word, splitPoints: [] }, [word.canonicalWordId]);
  for (const sentence of lesson.dictationTasks) add(`dictation:${sentence.id}`, "DICTATION", "paired_word_gaps", "lesson_dictation", { sentence, audioOrder: sentence.audioOrder }, sentence.targets.map(w => w.canonicalWordId));
  add("lesson-reflection", "LESSON_REFLECTION", "standard_lesson_reflection", "lesson_reflection", { promptKey: `degree:${lesson.microSkillKey}:reflection:v1`, promptText: lesson.reflectionPrompt }, lesson.words.map(w => w.canonicalWordId));
  return declarations.map((d, i) => ({ ...d, contractVersion: 3, order: i + 1 }));
}
/** Existing durable items, one per production target even when dictation renders a pair. */
export function comparativeAssignmentItems(lesson: ComparativeLessonV1, childId: string, parentUserId: string, date: string): AssignmentItemDraft[] {
  const items: AssignmentItemDraft[] = [];
  for (const activity of comparativeActivityDeclarations(lesson)) {
    const ids: (string | null)[] = activity.activityId === "teaching-pages" ? [null, null]
      : activity.sectionKey === "lesson_dictation" ? [...activity.wordSnapshotIds]
        : activity.sectionKey === "lesson_production" || activity.activityId.startsWith("cleaver:") ? [activity.wordSnapshotIds[0]] : [null];
    ids.forEach((canonicalWordId, index) => {
      const position = items.length + 1;
      const word = lesson.words.find(w => w.canonicalWordId === canonicalWordId);
      const templateKey = activity.activityId === "teaching-pages" ? index === 0 ? "MICRO_READ_ONLY_INTRO" : "LESSON_WORDS_INTRO"
        : activity.canonical.concept;
      items.push({ childId, parentUserId, domainModule: "spelling", itemType: `adle_${activity.sectionKey}`, sourceType: "adle_composer",
        sourceEntityId: `adle:${childId}:${date}:${position}`, templateKey, targetWord: word?.word ?? null, position, status: "ready",
        promptData: { comparativeActivityId: activity.activityId, canonical: activity.canonical, ...(activity.activityId === "teaching-pages" && index === 0 ? { comparativeLesson: lesson } : {}),
          ...(activity.sectionKey === "lesson_dictation" ? { pairedTargetSlot: index } : {}) },
        metadata: { planDate: date, sectionKey: activity.sectionKey, provenance: word?.learningItemId ? "authentic_target" : "generated_family_practice",
          microSkillKey: lesson.microSkillKey, canonicalWordId, expectedEvidenceKind: activity.sectionKey === "lesson_production" || activity.sectionKey === "lesson_dictation" ? "controlled_word" : null,
          adleLearningItemRef: word?.learningItemId ?? null, composerPolicyVersion: "comparative_two_family_v1_2026-09-29", schedulePolicyVersion: "review_policy_v1_2026-07-04" } });
    });
  }
  return items;
}
export function compileComparativeSnapshotV3(params: { lesson: ComparativeLessonV1; release: PersistedCurriculumReleaseAuthorityV2; contentAuthorities: readonly SpecialistSnapshotAuthorityV3[]; childId: string; parentUserId: string; date: string }) {
  if (!validateComparativeLesson(params.lesson)) throw new Error("comparative_unapproved_lesson");
  const lessonRouteMetadata = createPersistedRouteMetadataV2("comparative_superlative_word_lab", params.release);
  const items = comparativeAssignmentItems(params.lesson, params.childId, params.parentUserId, params.date);
  const activities = comparativeActivityDeclarations(params.lesson).map(a => ({ ...a, itemBindings: items.filter(i => i.promptData.comparativeActivityId === a.activityId).map(i => ({ sourceEntityId: i.sourceEntityId, position: i.position, inputSource: "assignment_items.prompt_data" as const })) }));
  const base = {
    snapshotSchemaVersion: 3 as const, compilerVersion: SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION, validatorVersion: SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION,
    canonicalContractRegistryVersion: SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION,
    route: { routeId: "comparative_superlative_word_lab" as const, routeVersion: "v1" as const }, recipe: { recipeKey: "comparative_superlative_word_lab" as const, recipeVersion: "v1" as const },
    payload: { kind: "comparative_superlative_lesson_v1" as const, version: 1 as const, resolvedLesson: params.lesson },
    runtime: { adapterKey: "comparative_superlative_v1" as const, rendererKey: "comparative_superlative_guided" as const },
    assignment: { generationSource: "adle_composer_v1" as const, itemCount: items.length as 22 | 23 | 24 }, taxonomy: { microSkillKey: params.lesson.microSkillKey },
    words: params.lesson.words.map((w, i) => ({ wordSnapshotId: w.canonicalWordId, order: i + 1, canonicalWordId: w.canonicalWordId, displayWord: w.word, learningItemId: w.learningItemId, lineageKind: w.learningItemId ? "authentic_target" as const : "transfer" as const })),
    activities, segments: [{ segmentId: "lesson" as const, wordSnapshotIds: params.lesson.words.map(w => w.canonicalWordId), activityIds: activities.map(a => a.activityId) }] as const,
    contentVersions: [...params.contentAuthorities],
    provenance: { sourceKind: "compiled_specialist_assignment" as const, fingerprintAlgorithm: "sha256" as const, fingerprintVersion: 1 as const },
  };
  const snapshot: CompiledComparativeSpecialistSnapshotV3 = { ...base, provenance: { ...base.provenance, sourceFingerprint: fingerprintSnapshotValue(base) } };
  const header: AssignmentHeaderDraft = { childId: params.childId, parentUserId: params.parentUserId, assignmentDate: params.date, title: "ADLE Daily Plan", status: "pending",
    targetWords: params.lesson.words.map(w => w.word), reviewWords: [], assignmentGenerationSource: "adle_composer_v1", lessonRouteMetadata };
  const validation = validateComparativeSnapshotV3(snapshot, { lessonRouteMetadata, assignmentGenerationSource: header.assignmentGenerationSource,
    items: items.map(i => ({ ...i, sectionKey: i.metadata.sectionKey, canonicalWordId: i.metadata.canonicalWordId })) });
  if (!validation.ok) throw new Error(validation.blockers.map(b => b.code).join(","));
  return { header, items, snapshot };
}
export function isComparativeSnapshotV3(value: unknown): value is CompiledComparativeSpecialistSnapshotV3 {
  return !!value && typeof value === "object" && (value as CompiledComparativeSpecialistSnapshotV3).snapshotSchemaVersion === 3 && (value as CompiledComparativeSpecialistSnapshotV3).route?.routeId === "comparative_superlative_word_lab";
}
export function validateComparativeSnapshotV3(value: unknown, context: { lessonRouteMetadata?: unknown; assignmentGenerationSource?: string | null; items?: readonly SpecialistSnapshotV3ValidationItem[] } = {}): SpecialistSnapshotV3ValidationResult {
  const bad = (code: "specialist_payload_mismatch" | "specialist_fingerprint_mismatch" | "specialist_item_binding_mismatch" | "specialist_content_provenance_malformed"): SpecialistSnapshotV3ValidationResult => ({ ok: false, blockers: [{ code }] });
  if (!isComparativeSnapshotV3(value)) return bad("specialist_payload_mismatch");
  const s = value;
  try {
    if (s.compilerVersion !== SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION || s.validatorVersion !== SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION || s.canonicalContractRegistryVersion !== SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION
      || s.route.routeVersion !== "v1" || s.recipe.recipeKey !== "comparative_superlative_word_lab" || s.recipe.recipeVersion !== "v1"
      || s.payload.kind !== "comparative_superlative_lesson_v1" || s.payload.version !== 1 || !validateComparativeLesson(s.payload.resolvedLesson)
      || s.runtime.adapterKey !== "comparative_superlative_v1" || s.runtime.rendererKey !== "comparative_superlative_guided"
      || s.assignment.generationSource !== "adle_composer_v1" || s.assignment.itemCount !== 20 + s.payload.resolvedLesson.queuedTargets.length
      || s.taxonomy.microSkillKey !== s.payload.resolvedLesson.microSkillKey
      || (context.assignmentGenerationSource !== undefined && context.assignmentGenerationSource !== "adle_composer_v1")) return bad("specialist_payload_mismatch");
    const metadata = context.lessonRouteMetadata as AssignmentHeaderDraft["lessonRouteMetadata"];
    if (context.lessonRouteMetadata !== undefined && (!metadata || metadata.metadataSchemaVersion !== 2
      || metadata.route.routeId !== s.route.routeId || metadata.route.routeVersion !== "v1"
      || metadata.recipe.recipeKey !== s.recipe.recipeKey || metadata.recipe.recipeVersion !== "v1"
      || metadata.payload.kind !== s.payload.kind || metadata.payload.version !== 1)) return bad("specialist_payload_mismatch");
    const authorities = ["release_manifest", "activation_revision", "dependency_set", "adjective_degree_families", "teaching_content", "teaching_dictionary_closure", "recipe_content"];
    if (!Array.isArray(s.contentVersions) || s.contentVersions.length !== 7 || authorities.some(kind => s.contentVersions.filter(a => a.authorityType === kind).length !== 1)
      || s.contentVersions.some(a => !a.authorityId || !a.version || !/^[a-f0-9]{64}$/.test(a.sourceHash))) return bad("specialist_content_provenance_malformed");
    if (metadata?.metadataSchemaVersion === 2) {
      const refs = metadata.curriculumRelease;
      if (!s.contentVersions.some(a => a.authorityType === "release_manifest" && a.authorityId === refs.releaseManifestId && a.sourceHash === refs.releaseManifestSha256)
        || !s.contentVersions.some(a => a.authorityType === "activation_revision" && a.authorityId === refs.activationRevisionId)
        || !s.contentVersions.some(a => a.authorityType === "dependency_set" && a.sourceHash === refs.dependencyFingerprint)) return bad("specialist_content_provenance_malformed");
    }
    const expectedWords = s.payload.resolvedLesson.words.map((w, i) => ({ wordSnapshotId: w.canonicalWordId, order: i + 1, canonicalWordId: w.canonicalWordId, displayWord: w.word, learningItemId: w.learningItemId, lineageKind: w.learningItemId ? "authentic_target" : "transfer" }));
    if (canonicalSnapshotJson(s.words) !== canonicalSnapshotJson(expectedWords)) return bad("specialist_payload_mismatch");
    const expectedActivities = comparativeActivityDeclarations(s.payload.resolvedLesson);
    if (!Array.isArray(s.activities) || s.activities.length !== expectedActivities.length || s.activities.some((a, i) => {
      const { itemBindings: _bindings, ...declaration } = a;
      void _bindings;
      return canonicalSnapshotJson(declaration) !== canonicalSnapshotJson(expectedActivities[i]) || !Array.isArray(a.itemBindings);
    })) return bad("specialist_payload_mismatch");
    const bindings = s.activities.flatMap((a: SpecialistCanonicalActivitySnapshotV3) => a.itemBindings.map(b => ({ a, b })));
    if (bindings.length !== s.assignment.itemCount || new Set(bindings.map(x => x.b.sourceEntityId)).size !== bindings.length
      || bindings.some(({ b }) => b.inputSource !== "assignment_items.prompt_data" || !Number.isInteger(b.position))) return bad("specialist_item_binding_mismatch");
    if (context.items) {
      if (context.items.length !== bindings.length) return bad("specialist_item_binding_mismatch");
      const expectedItems = comparativeAssignmentItems(s.payload.resolvedLesson, "validation", "validation", "2000-01-01");
      for (const { a, b } of bindings) {
        const item = context.items.find(i => i.sourceEntityId === b.sourceEntityId);
        const expected = expectedItems[b.position - 1];
        if (!item || item.position !== b.position || item.sectionKey !== a.sectionKey || item.promptData.comparativeActivityId !== a.activityId
          || !expected || item.canonicalWordId !== expected.metadata.canonicalWordId || item.templateKey !== expected.templateKey || item.targetWord !== expected.targetWord
          || canonicalSnapshotJson(item.promptData) !== canonicalSnapshotJson(expected.promptData)
          || (item.metadata && item.metadata.adleLearningItemRef !== expected.metadata.adleLearningItemRef)) return bad("specialist_item_binding_mismatch");
      }
    }
    const segment = [{ segmentId: "lesson", wordSnapshotIds: s.words.map(w => w.wordSnapshotId), activityIds: s.activities.map(a => a.activityId) }];
    if (canonicalSnapshotJson(s.segments) !== canonicalSnapshotJson(segment)) return bad("specialist_payload_mismatch");
    if (s.provenance.sourceKind !== "compiled_specialist_assignment" || s.provenance.fingerprintAlgorithm !== "sha256" || s.provenance.fingerprintVersion !== 1
      || fingerprintSnapshotValue({ ...s, provenance: { sourceKind: s.provenance.sourceKind, fingerprintAlgorithm: s.provenance.fingerprintAlgorithm, fingerprintVersion: s.provenance.fingerprintVersion } }) !== s.provenance.sourceFingerprint) return bad("specialist_fingerprint_mismatch");
    return { ok: true, snapshot: s };
  } catch { return bad("specialist_payload_mismatch"); }
}
