import type { AssignmentHeaderDraft, AssignmentItemDraft } from "../assignment-persistence";
import { canonicalSnapshotJson, fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { PersistedCurriculumReleaseAuthorityV2, PersistedLessonRouteMetadataV2 } from "../composable-lesson/contracts";
import {
  SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION, SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION,
  SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION, type CompiledWeakVowelSpecialistSnapshotV3,
  type SpecialistCanonicalActivitySnapshotV3, type SpecialistSnapshotAuthorityV3,
  type SpecialistSnapshotV3ValidationItem, type SpecialistSnapshotV3ValidationResult,
} from "../composable-lesson/specialist-snapshot-v3-contracts";
import { validateWeakVowelLesson, type WeakVowelLessonV1 } from "./lesson";

type ItemSpec = {
  activityId: string;
  sectionKey: SpecialistCanonicalActivitySnapshotV3["sectionKey"];
  templateKey: string;
  canonicalWordId: string | null;
  targetWord: string | null;
  learningItemId: string | null;
};

function itemSpecs(lesson: WeakVowelLessonV1): ItemSpec[] {
  const wordItems = (activityId: string, sectionKey: ItemSpec["sectionKey"], templateKey: string) =>
    lesson.words.map((word) => ({ activityId, sectionKey, templateKey,
      canonicalWordId: word.canonicalWordId, targetWord: word.spelling, learningItemId: word.learningItemId }));
  return [
    { activityId: "teaching", sectionKey: "lesson_intro", templateKey: "MICRO_READ_ONLY_INTRO",
      canonicalWordId: null, targetWord: null, learningItemId: null },
    ...wordItems("dinner", "guided_practice", "WEAK_VOWEL_DINNER"),
    ...wordItems("detective", "guided_practice", "WEAK_VOWEL_DETECTIVE"),
    ...wordItems("memory", "lesson_production", "COVER_CHECK"),
    ...wordItems("dictation", "lesson_dictation", "DICTATION_NO_IMAGE"),
  ];
}

function assignmentItems(lesson: WeakVowelLessonV1, childId: string, parentUserId: string, date: string): AssignmentItemDraft[] {
  return itemSpecs(lesson).map((spec, index) => ({
    childId, parentUserId, domainModule: "spelling", itemType: `adle_${spec.sectionKey}`,
    sourceType: "adle_composer", sourceEntityId: `adle:${childId}:${date}:${index + 1}`,
    templateKey: spec.templateKey, targetWord: spec.targetWord, position: index + 1, status: "ready",
    promptData: { weakVowelActivityId: spec.activityId, canonical: { concept: spec.templateKey, contractVersion: 1 } },
    metadata: { planDate: date, sectionKey: spec.sectionKey,
      provenance: spec.learningItemId ? "authentic_target" : "generated_dictionary_practice",
      microSkillKey: lesson.microSkillKey, canonicalWordId: spec.canonicalWordId,
      expectedEvidenceKind: spec.sectionKey === "lesson_production" || spec.sectionKey === "lesson_dictation"
        ? "controlled_word" : null,
      adleLearningItemRef: spec.learningItemId, composerPolicyVersion: "weak_vowel_four_to_six_v1",
      schedulePolicyVersion: "review_policy_v1_2026-07-04" },
  }));
}

function activities(lesson: WeakVowelLessonV1, items: readonly AssignmentItemDraft[]): SpecialistCanonicalActivitySnapshotV3[] {
  const allIds = lesson.words.map((word) => word.canonicalWordId);
  const declarations: Array<{ id: string; label: string; section: ItemSpec["sectionKey"];
    concept: string; mode: string; payload: Record<string, unknown>; ids: string[] }> = [
    { id: "teaching", label: "Teaching Pages", section: "lesson_intro", concept: "INTRODUCTION",
      mode: "teaching_page", payload: { teaching: lesson.teaching }, ids: allIds },
    { id: "dinner", label: "Call It To Dinner", section: "guided_practice", concept: "WEAK_VOWEL_DINNER",
      mode: "syllable_and_vowel", payload: { rounds: lesson.words.map((word) => word.dinner) }, ids: allIds },
    { id: "detective", label: "Vowel Detective", section: "guided_practice", concept: "WEAK_VOWEL_DETECTIVE",
      mode: "missing_vowel_and_family", payload: { rounds: lesson.words.map((word) => word.detective) }, ids: allIds },
    { id: "memory", label: "Memory Lock", section: "lesson_production", concept: "COVER_CHECK",
      mode: "whole_word", payload: { words: lesson.words.map((word) => word.spelling) }, ids: allIds },
    { id: "dictation", label: "Dictation", section: "lesson_dictation", concept: "DICTATION",
      mode: "whole_sentence", payload: { rounds: lesson.words.map((word) => word.dictation) }, ids: allIds },
    { id: "reflection", label: "Reflection", section: "lesson_reflection", concept: "LESSON_REFLECTION",
      mode: "standard_lesson_reflection", payload: { prompt: lesson.reflectionPrompt }, ids: allIds },
  ];
  return declarations.map((entry, index) => ({
    contractVersion: 3, activityId: entry.id, label: entry.label, order: index + 1,
    sectionKey: entry.section, canonical: { concept: entry.concept, mode: entry.mode, contractVersion: 1 },
    payload: entry.payload, wordSnapshotIds: entry.ids,
    ownership: entry.id === "reflection" ? "route_owned" : "assignment_items",
    itemBindings: items.filter((item) => item.promptData.weakVowelActivityId === entry.id)
      .map((item) => ({ sourceEntityId: item.sourceEntityId, position: item.position,
        inputSource: "assignment_items.prompt_data" })),
  }));
}

export function compileWeakVowelSnapshotV3(input: { lesson: WeakVowelLessonV1;
  release: PersistedCurriculumReleaseAuthorityV2; contentAuthorities: readonly SpecialistSnapshotAuthorityV3[];
  childId: string; parentUserId: string; date: string }) {
  const lesson = input.lesson;
  if (!validateWeakVowelLesson(lesson) || lesson.authority !== "governed_release" ||
    !lesson.words.some((word) => word.learningItemId)) throw new Error("weak_vowel_assignment_words_invalid");
  const items = assignmentItems(lesson, input.childId, input.parentUserId, input.date);
  const activityList = activities(lesson, items);
  const base = {
    snapshotSchemaVersion: 3 as const,
    compilerVersion: SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION,
    validatorVersion: SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION,
    canonicalContractRegistryVersion: SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION,
    route: { routeId: "weak_vowel_word_lab" as const, routeVersion: "v1" as const },
    recipe: { recipeKey: "weak_vowel_word_lab" as const, recipeVersion: "v1" as const },
    payload: { kind: "weak_vowel_lesson_v1" as const, version: 1 as const, resolvedLesson: lesson },
    runtime: { adapterKey: "weak_vowel_v1" as const, rendererKey: "weak_vowel_guided" as const },
    assignment: { generationSource: "adle_composer_v1" as const, itemCount: items.length },
    taxonomy: { microSkillKey: lesson.microSkillKey },
    words: lesson.words.map((word, index) => ({ wordSnapshotId: word.canonicalWordId, order: index + 1,
      canonicalWordId: word.canonicalWordId, displayWord: word.spelling, learningItemId: word.learningItemId,
      lineageKind: word.learningItemId ? "authentic_target" as const : "transfer" as const })),
    activities: activityList,
    segments: [{ segmentId: "lesson" as const, wordSnapshotIds: lesson.words.map((word) => word.canonicalWordId),
      activityIds: activityList.map((activity) => activity.activityId) }] as const,
    contentVersions: [...input.contentAuthorities],
    provenance: { sourceKind: "compiled_specialist_assignment" as const,
      fingerprintAlgorithm: "sha256" as const, fingerprintVersion: 1 as const },
  };
  const snapshot: CompiledWeakVowelSpecialistSnapshotV3 = {
    ...base, provenance: { ...base.provenance, sourceFingerprint: fingerprintSnapshotValue(base) },
  };
  const lessonRouteMetadata: PersistedLessonRouteMetadataV2 = {
    metadataSchemaVersion: 2, route: snapshot.route, recipe: snapshot.recipe,
    payload: { kind: "weak_vowel_lesson_v1", version: 1 }, curriculumRelease: input.release,
  };
  const header: AssignmentHeaderDraft = { childId: input.childId, parentUserId: input.parentUserId,
    assignmentDate: input.date, title: "ADLE Daily Plan", status: "pending",
    targetWords: lesson.words.map((word) => word.spelling), reviewWords: [],
    assignmentGenerationSource: "adle_composer_v1", lessonRouteMetadata };
  const validation = validateWeakVowelSnapshotV3(snapshot, { lessonRouteMetadata, assignmentGenerationSource: header.assignmentGenerationSource,
    items: items.map((item) => ({ ...item, sectionKey: item.metadata.sectionKey,
      canonicalWordId: item.metadata.canonicalWordId })) });
  if (!validation.ok) throw new Error(validation.blockers.map((blocker) => blocker.code).join(","));
  return { header, items, snapshot };
}

export function isWeakVowelSnapshotV3(value: unknown): value is CompiledWeakVowelSpecialistSnapshotV3 {
  return !!value && typeof value === "object" && (value as CompiledWeakVowelSpecialistSnapshotV3).snapshotSchemaVersion === 3
    && (value as CompiledWeakVowelSpecialistSnapshotV3).route?.routeId === "weak_vowel_word_lab";
}

export function validateWeakVowelSnapshotV3(value: unknown, context: {
  lessonRouteMetadata?: unknown; assignmentGenerationSource?: string | null;
  items?: readonly SpecialistSnapshotV3ValidationItem[];
} = {}): SpecialistSnapshotV3ValidationResult {
  const bad = (code: "specialist_payload_mismatch" | "specialist_fingerprint_mismatch" |
    "specialist_item_binding_mismatch" | "specialist_content_provenance_malformed"): SpecialistSnapshotV3ValidationResult =>
    ({ ok: false, blockers: [{ code }] });
  if (!isWeakVowelSnapshotV3(value)) return bad("specialist_payload_mismatch");
  const snapshot = value;
  try {
    const lesson = snapshot.payload.resolvedLesson;
    if (snapshot.compilerVersion !== SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION ||
      snapshot.validatorVersion !== SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION ||
      snapshot.canonicalContractRegistryVersion !== SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION ||
      snapshot.route.routeVersion !== "v1" || snapshot.recipe.recipeKey !== "weak_vowel_word_lab" ||
      snapshot.recipe.recipeVersion !== "v1" || snapshot.payload.kind !== "weak_vowel_lesson_v1" ||
      snapshot.payload.version !== 1 || !validateWeakVowelLesson(lesson) ||
      snapshot.runtime.adapterKey !== "weak_vowel_v1" || snapshot.runtime.rendererKey !== "weak_vowel_guided" ||
      snapshot.taxonomy.microSkillKey !== lesson.microSkillKey || snapshot.assignment.generationSource !== "adle_composer_v1" ||
      context.assignmentGenerationSource !== undefined && context.assignmentGenerationSource !== "adle_composer_v1")
      return bad("specialist_payload_mismatch");
    const metadata = context.lessonRouteMetadata as AssignmentHeaderDraft["lessonRouteMetadata"];
    if (context.lessonRouteMetadata !== undefined && (!metadata || metadata.metadataSchemaVersion !== 2 ||
      metadata.route.routeId !== "weak_vowel_word_lab" || metadata.route.routeVersion !== "v1" ||
      metadata.recipe.recipeKey !== "weak_vowel_word_lab" || metadata.payload.kind !== "weak_vowel_lesson_v1" ||
      metadata.payload.version !== 1)) return bad("specialist_payload_mismatch");
    if (snapshot.words.length !== lesson.words.length || !snapshot.words.some((word) => word.learningItemId) ||
      snapshot.words.some((word, index) => word.canonicalWordId !== lesson.words[index].canonicalWordId ||
        word.displayWord !== lesson.words[index].spelling || word.learningItemId !== lesson.words[index].learningItemId ||
        word.order !== index + 1 || word.wordSnapshotId !== word.canonicalWordId)) return bad("specialist_payload_mismatch");
    const core = ["release_manifest", "activation_revision", "dependency_set"];
    if (snapshot.contentVersions.length !== core.length + lesson.words.length ||
      core.some((kind) => snapshot.contentVersions.filter((entry) => entry.authorityType === kind).length !== 1) ||
      snapshot.contentVersions.filter((entry) => entry.authorityType === "teaching_content").length !== lesson.words.length ||
      lesson.words.some((word) => !snapshot.contentVersions.some((entry) =>
        entry.authorityType === "teaching_content" && entry.authorityId === word.dinner.contentVersion &&
        entry.sourceHash === word.dinner.sourceFingerprint)) ||
      snapshot.contentVersions.some((entry) => !entry.authorityId || !/^[a-f0-9]{64}$/.test(entry.sourceHash)))
      return bad("specialist_content_provenance_malformed");
    if (metadata?.metadataSchemaVersion === 2 && (!snapshot.contentVersions.some((entry) =>
      entry.authorityType === "release_manifest" && entry.authorityId === metadata.curriculumRelease.releaseManifestId &&
      entry.sourceHash === metadata.curriculumRelease.releaseManifestSha256) ||
      !snapshot.contentVersions.some((entry) => entry.authorityType === "activation_revision" &&
        entry.authorityId === metadata.curriculumRelease.activationRevisionId) ||
      !snapshot.contentVersions.some((entry) => entry.authorityType === "dependency_set" &&
        entry.sourceHash === metadata.curriculumRelease.dependencyFingerprint))) return bad("specialist_content_provenance_malformed");
    const expectedItems = assignmentItems(lesson, "validation", "validation", "2000-01-01");
    const expectedActivities = activities(lesson, expectedItems);
    if (snapshot.assignment.itemCount !== expectedItems.length || snapshot.activities.length !== expectedActivities.length ||
      snapshot.activities.some((activity, index) => {
        const { itemBindings: _ignored, ...declaration } = activity;
        void _ignored;
        const { itemBindings: _expected, ...expected } = expectedActivities[index];
        void _expected;
        return canonicalSnapshotJson(declaration) !== canonicalSnapshotJson(expected);
      })) return bad("specialist_payload_mismatch");
    const flat = snapshot.activities.flatMap((activity) => activity.itemBindings.map((binding) => ({ activity, binding })));
    if (flat.length !== expectedItems.length || new Set(flat.map(({ binding }) => binding.sourceEntityId)).size !== flat.length ||
      context.items && (context.items.length !== flat.length || flat.some(({ activity, binding }) => {
        const item = context.items!.find((entry) => entry.sourceEntityId === binding.sourceEntityId);
        const expected = expectedItems[binding.position - 1];
        return !item || !expected || item.position !== binding.position || item.sectionKey !== activity.sectionKey ||
          item.canonicalWordId !== expected.metadata.canonicalWordId || item.targetWord !== expected.targetWord ||
          item.templateKey !== expected.templateKey || item.promptData.weakVowelActivityId !== activity.activityId;
      }))) return bad("specialist_item_binding_mismatch");
    if (canonicalSnapshotJson(snapshot.segments) !== canonicalSnapshotJson([{
      segmentId: "lesson", wordSnapshotIds: snapshot.words.map((word) => word.wordSnapshotId),
      activityIds: snapshot.activities.map((activity) => activity.activityId),
    }])) return bad("specialist_payload_mismatch");
    if (fingerprintSnapshotValue({ ...snapshot, provenance: { sourceKind: snapshot.provenance.sourceKind,
      fingerprintAlgorithm: snapshot.provenance.fingerprintAlgorithm,
      fingerprintVersion: snapshot.provenance.fingerprintVersion } }) !== snapshot.provenance.sourceFingerprint)
      return bad("specialist_fingerprint_mismatch");
    return { ok: true, snapshot };
  } catch { return bad("specialist_payload_mismatch"); }
}
