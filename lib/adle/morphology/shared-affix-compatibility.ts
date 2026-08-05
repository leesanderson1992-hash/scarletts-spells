import { canonicalSnapshotJson } from "../composable-lesson/canonical-fingerprint";
import type { LearningItemFact } from "../learning-items";
import {
  DYNAMIC_AFFIX_WORD_LAB_CONTENT_VERSION,
  DYNAMIC_AFFIX_WORD_LAB_PROFILE,
  type DynamicAffixLessonPayloadV3,
  type DynamicAffixSelection,
  type DynamicAffixWord,
} from "./affix-word-lab";
import {
  DYNAMIC_PREFIX_WORD_LAB_CONTENT_VERSION,
  DYNAMIC_PREFIX_WORD_LAB_PROFILE,
  type DynamicPrefixLessonPayloadV2,
  type DynamicPrefixProfile,
  type DynamicPrefixSelection,
  type DynamicPrefixWord,
} from "./dynamic-prefix-contracts";
import { compileSharedAffixLesson } from "./shared-affix-compiler";
import {
  SHARED_AFFIX_PROFILE_VERSION,
  type AffixLessonCompilationInputV1,
  type CompiledAffixLessonV1,
  type SharedAffixBlocker,
  type SharedAffixCompatibilityResult,
  type SharedAffixIntroductionV1,
  type SharedAffixTransformationV1,
  type SharedAffixWordInputV1,
} from "./shared-affix-contracts";
import {
  getSharedAffixProfileMapping,
  type SharedAffixProfileMappingV1,
} from "./shared-affix-profile-registry";

export type SharedAffixNormalisationResult =
  | { ok: true; input: AffixLessonCompilationInputV1 }
  | { ok: false; blockers: readonly SharedAffixBlocker[] };

export type SharedAffixShadowResult<Payload> =
  | {
      ok: true;
      input: AffixLessonCompilationInputV1;
      lesson: CompiledAffixLessonV1;
      payload: Payload;
    }
  | { ok: false; blockers: readonly SharedAffixBlocker[] };

const GENERIC_PREFIX_TITLE = "What is a prefix?";
const GENERIC_PREFIX_PARAGRAPHS = [
  "A prefix is a group of letters added to the beginning of a word. It can help to make a new word and change its meaning.",
];

function selectedIds(selection: {
  authenticTargets: readonly LearningItemFact[];
  transfers: readonly { canonicalWordId: string }[];
}) {
  const authenticTargetIds = selection.authenticTargets.map((item) => item.canonicalWordId);
  const transferWordIds = selection.transfers.map((word) => word.canonicalWordId);
  return {
    lessonWordIds: [...authenticTargetIds, ...transferWordIds],
    authenticTargetIds,
    transferWordIds,
  };
}

function routeInput(mapping: SharedAffixProfileMappingV1) {
  return {
    route: { routeId: mapping.routeId, routeVersion: mapping.routeVersion },
    recipe: { recipeKey: mapping.recipeKey, recipeVersion: mapping.recipeVersion },
  };
}

function prefixFacts(
  word: DynamicPrefixWord,
  profile: DynamicPrefixProfile,
): { text: string; label: string; meaning: string; teachingSurfaceText: string } | null {
  const part = word.parts.find((candidate) => candidate.role === "prefix");
  const text = word.prefixText ?? part?.text ?? profile.prefixText;
  const label = word.prefixLabel ?? (text ? `${text}-` : undefined) ?? profile.prefixLabel;
  const meaning = word.prefixMeaning ?? part?.gloss ?? profile.prefixMeaning ?? "changes the meaning";
  const teachingSurfaceText = word.teachingBuildText
    ?? word.parts.filter((candidate) => candidate.role !== "prefix").map((candidate) => candidate.text).join("");
  return text && label && teachingSurfaceText
    ? { text, label, meaning, teachingSurfaceText }
    : null;
}

function prefixIntroduction(
  profile: DynamicPrefixProfile,
  mapping: SharedAffixProfileMappingV1,
): SharedAffixIntroductionV1 {
  if (profile.introduction) {
    return {
      kind: "prefix_v2",
      title: GENERIC_PREFIX_TITLE,
      paragraphs: [...GENERIC_PREFIX_PARAGRAPHS],
      profileTitle: profile.introduction.title,
      profileParagraphs: [...profile.introduction.paragraphs],
      profileExamples: profile.introduction.examples?.map((example) => ({ ...example })),
      ...(profile.pedagogy ? { teachingCards: profile.pedagogy.teachingCards.map((card) => ({ ...card, rules: [...card.rules] as [string, ...string[]], ...(card.example ? { example: { ...card.example } } : {}) })) } : {}),
    };
  }
  const fallback = mapping.prefixFallbackIntroduction!;
  return {
    kind: "prefix_v2",
    title: fallback.title,
    paragraphs: [...fallback.paragraphs],
    ...(fallback.profileTitle ? { profileTitle: fallback.profileTitle } : {}),
    ...(fallback.profileParagraphs ? { profileParagraphs: [...fallback.profileParagraphs] } : {}),
    ...(profile.pedagogy ? { teachingCards: profile.pedagogy.teachingCards.map((card) => ({ ...card, rules: [...card.rules] as [string, ...string[]], ...(card.example ? { example: { ...card.example } } : {}) })) } : {}),
  };
}

export function normaliseDynamicPrefixSelection(
  selection: DynamicPrefixSelection,
  sourceKind: AffixLessonCompilationInputV1["provenance"]["sourceKind"] = "reviewed_fixture",
): SharedAffixNormalisationResult {
  const mapping = getSharedAffixProfileMapping(selection.profile.microSkillKey);
  if (!mapping || mapping.routeId !== "dynamic_prefix_word_lab") {
    return { ok: false, blockers: [{ code: "selected_word_not_in_profile", detail: selection.profile.microSkillKey }] };
  }
  const declaredPedagogy = selection.profile.pedagogy ? mapping.prefixPedagogy : undefined;
  if (
    selection.profile.pedagogy
    && (
      !declaredPedagogy
      || declaredPedagogy.version !== selection.profile.pedagogy.version
      || declaredPedagogy.meaningCheckKind !== selection.profile.pedagogy.meaningCheckKind
      || declaredPedagogy.meaningResultsPresentation !== selection.profile.pedagogy.meaningResultsPresentation
      || declaredPedagogy.coverClosePolicy.kind !== selection.profile.pedagogy.coverClosePolicy.kind
      || declaredPedagogy.coverClosePolicy.threshold !== selection.profile.pedagogy.coverClosePolicy.threshold
    )
  ) {
    return { ok: false, blockers: [{ code: "invalid_choice_policy", detail: "prefix_presentation_policy_mismatch" }] };
  }
  const selectionIds = selectedIds(selection);
  const normalisedWords: SharedAffixWordInputV1[] = [];
  const blockers: SharedAffixBlocker[] = [];
  for (const id of selectionIds.lessonWordIds) {
    const word = selection.profile.wordsByCanonicalId.get(id);
    const affix = word && prefixFacts(word, selection.profile);
    if (!word || !affix) {
      blockers.push({ code: word ? "missing_affix_form" : "selected_word_not_in_profile", detail: id });
      continue;
    }
    normalisedWords.push({
      canonicalWordId: word.canonicalWordId,
      displayWord: word.displayWord,
      audioText: word.audioText,
      semanticBaseText: word.baseWord,
      semanticBaseKind: "base",
      teachingSurfaceText: affix.teachingSurfaceText,
      baseMeaning: word.baseMeaning,
      derivedMeaning: word.derivedMeaning,
      meaningGroupId: declaredPedagogy?.meaningCheckKind === "prefix_form" ? affix.text : word.effect,
      affixForm: affix.text,
      affixLabel: affix.label,
      affixMeaning: affix.meaning,
      parts: word.parts,
      joins: word.joins,
      splitPoints: word.splitPoints,
      dictation: { sentence: word.dictationSentence, targetTokenIndex: word.dictationTargetTokenIndex },
      morphology: {
        kind: "legacy_prefix_projection",
        parts: word.parts,
        joins: word.joins,
        transformations: [{ type: "legacy_prefix_projection" }],
        notes: "Legacy Dynamic Prefix V2 reviewed decomposition projection.",
        provenance: { source: "dynamic_prefix_v2_reviewed_profile" },
      },
    });
  }
  if (blockers.length > 0) return { ok: false, blockers };
  const firstId = selectionIds.lessonWordIds[0];
  const first = firstId ? selection.profile.wordsByCanonicalId.get(firstId) : undefined;
  const firstAffix = first && prefixFacts(first, selection.profile);
  const headerWord = firstAffix
    ? selectionIds.lessonWordIds
      .map((id) => selection.profile.wordsByCanonicalId.get(id))
      .find((word) => word && prefixFacts(word, selection.profile)?.text !== firstAffix.text) ?? first
    : first;
  const header = headerWord && prefixFacts(headerWord, selection.profile);
  if (!header) return { ok: false, blockers: [{ code: "missing_affix_form", detail: "header" }] };
  return {
    ok: true,
    input: {
      ...routeInput(mapping),
      taxonomy: { familyKey: "morphology", clusterKey: "prefix", microSkillKey: selection.profile.microSkillKey },
      profile: {
        profileVersion: SHARED_AFFIX_PROFILE_VERSION,
        profileKey: selection.profile.microSkillKey,
        position: mapping.position,
        forms: mapping.forms,
        header: { text: header.text, label: header.label, meaning: header.meaning },
        meaningGroups: selection.profile.meaningBins.map((group) => ({ ...group })),
        choices: selection.profile.prefixChoices.map((choice) => ({ ...choice })),
        introduction: prefixIntroduction(selection.profile, mapping),
        reflection: { ...selection.profile.reflection },
        ...(declaredPedagogy ? {
          prefixPresentation: {
            version: declaredPedagogy.version,
            meaningCheckKind: declaredPedagogy.meaningCheckKind,
            meaningResultsPresentation: declaredPedagogy.meaningResultsPresentation,
            coverClosePolicy: declaredPedagogy.coverClosePolicy,
            cleaverFeedbackPolicy: {
              ...declaredPedagogy.cleaverFeedbackPolicy,
              firstMiss: [...declaredPedagogy.cleaverFeedbackPolicy.firstMiss] as [string, ...string[]],
              repeatedMiss: [...declaredPedagogy.cleaverFeedbackPolicy.repeatedMiss] as [string, ...string[]],
              ...(declaredPedagogy.cleaverFeedbackPolicy.reviewedHint
                ? { reviewedHint: { ...declaredPedagogy.cleaverFeedbackPolicy.reviewedHint } }
                : {}),
            },
            validChoiceAudit: selection.profile.pedagogy!.validChoiceAudit.map((audit) => ({
              word: audit.word,
              choiceVerdicts: { ...audit.choiceVerdicts },
            })),
          },
        } : {}),
      },
      words: normalisedWords.sort((left, right) => left.canonicalWordId.localeCompare(right.canonicalWordId)),
      selection: selectionIds,
      policy: declaredPedagogy?.policy ?? mapping.policy,
      provenance: {
        sourceKind,
        profileVersion: DYNAMIC_PREFIX_WORD_LAB_PROFILE,
        contentVersion: DYNAMIC_PREFIX_WORD_LAB_CONTENT_VERSION,
      },
    },
  };
}

function normaliseTransformations(
  word: DynamicAffixWord,
): { transformations: SharedAffixTransformationV1[]; blockers: SharedAffixBlocker[] } {
  const transformations: SharedAffixTransformationV1[] = [];
  const blockers: SharedAffixBlocker[] = [];
  for (const raw of word.trueMorphology.transformations) {
    if (!raw || typeof raw !== "object" || typeof (raw as { type?: unknown }).type !== "string") {
      blockers.push({ code: "unsupported_transformation", detail: word.canonicalWordId });
      continue;
    }
    const transformation = raw as { type: string; [key: string]: unknown };
    if (!["change_final_y_to_i", "drop_final_e", "remove_letter", "replace_final", "base_spelling_change"].includes(transformation.type)) {
      blockers.push({ code: "unsupported_transformation", detail: `${word.canonicalWordId}:${transformation.type}` });
      continue;
    }
    transformations.push({ ...transformation } as SharedAffixTransformationV1);
  }
  return { transformations, blockers };
}

export function normaliseDynamicAffixSelection(
  selection: DynamicAffixSelection,
  sourceKind: AffixLessonCompilationInputV1["provenance"]["sourceKind"] = "reviewed_fixture",
): SharedAffixNormalisationResult {
  const mapping = getSharedAffixProfileMapping(selection.profile.microSkillKey);
  if (!mapping || mapping.routeId !== "dynamic_affix_word_lab") {
    return { ok: false, blockers: [{ code: "selected_word_not_in_profile", detail: selection.profile.microSkillKey }] };
  }
  const selectionIds = selectedIds(selection);
  const normalisedWords: SharedAffixWordInputV1[] = [];
  const blockers: SharedAffixBlocker[] = [];
  for (const id of selectionIds.lessonWordIds) {
    const word = selection.profile.wordsByCanonicalId.get(id);
    if (!word) {
      blockers.push({ code: "selected_word_not_in_profile", detail: id });
      continue;
    }
    const transformations = normaliseTransformations(word);
    blockers.push(...transformations.blockers);
    normalisedWords.push({
      canonicalWordId: word.canonicalWordId,
      displayWord: word.displayWord,
      audioText: word.audioText,
      semanticBaseText: word.semanticBaseText,
      semanticBaseKind: word.semanticBaseKind,
      teachingSurfaceText: word.teachingBaseText,
      baseMeaning: word.baseMeaning,
      derivedMeaning: word.derivedMeaning,
      meaningGroupId: word.effect,
      affixForm: word.affixVariant,
      affixLabel: `-${word.affixVariant}`,
      affixMeaning: word.affixMeaning ?? selection.profile.affixMeaning,
      parts: word.parts,
      joins: word.joins,
      splitPoints: word.splitPoints,
      dictation: { sentence: word.dictationSentence, targetTokenIndex: word.dictationTargetTokenIndex },
      morphology: {
        kind: "reviewed_true_morphology",
        parts: word.trueMorphology.parts,
        joins: word.trueMorphology.joins,
        transformations: transformations.transformations,
        notes: word.trueMorphology.notes,
        provenance: word.trueMorphology.provenance,
      },
    });
  }
  if (blockers.length > 0) return { ok: false, blockers };
  return {
    ok: true,
    input: {
      ...routeInput(mapping),
      taxonomy: { familyKey: "morphology", clusterKey: "suffix", microSkillKey: selection.profile.microSkillKey },
      profile: {
        profileVersion: SHARED_AFFIX_PROFILE_VERSION,
        profileKey: selection.profile.microSkillKey,
        position: mapping.position,
        forms: mapping.forms,
        header: {
          text: selection.profile.affixText,
          label: selection.profile.affixLabel,
          meaning: selection.profile.affixMeaning,
        },
        meaningGroups: selection.profile.meaningBins.map((group) => ({ ...group })),
        choices: selection.profile.choices.map((choice) => ({ ...choice })),
        introduction: { kind: "affix_v3", ...selection.profile.introduction },
        reflection: { ...selection.profile.reflection },
      },
      words: normalisedWords.sort((left, right) => left.canonicalWordId.localeCompare(right.canonicalWordId)),
      selection: selectionIds,
      policy: mapping.policy,
      provenance: {
        sourceKind,
        profileVersion: DYNAMIC_AFFIX_WORD_LAB_PROFILE,
        contentVersion: DYNAMIC_AFFIX_WORD_LAB_CONTENT_VERSION,
      },
    },
  };
}

export function adaptSharedAffixLessonToDynamicPrefixV2(
  input: AffixLessonCompilationInputV1,
  lesson: CompiledAffixLessonV1,
): SharedAffixCompatibilityResult<DynamicPrefixLessonPayloadV2> {
  if (lesson.position !== "before" || lesson.introduction.kind !== "prefix_v2") {
    return { ok: false, blockers: [{ code: "compatibility_adapter_mismatch", detail: "prefix_shape" }] };
  }
  const words: DynamicPrefixLessonPayloadV2["words"]["lesson"] = lesson.words.map((word) => ({
    canonicalWordId: word.canonicalWordId,
    displayWord: word.displayWord,
    audioText: word.audioText,
    baseMeaning: word.baseMeaning,
    derivedMeaning: word.derivedMeaning,
    effect: word.meaningGroupId,
    parts: word.parts,
    joins: word.joins,
    splitPoints: [...word.splitPoints],
    baseWord: word.semanticBaseText,
    prefixText: word.affixForm,
    prefixLabel: word.affixLabel,
    source: word.role === "authentic_target" ? "authentic" : "transfer",
  }));
  const wordById = new Map(words.map((word) => [word.canonicalWordId, word]));
  const sourceById = new Map(lesson.words.map((word) => [word.canonicalWordId, word]));
  const guided = (input.policy.legacyGuidedShape === "explicit" || input.profile.prefixPresentation) ? {
    splitCanonicalWordIds: [...lesson.activities.splitCanonicalWordIds],
    builds: lesson.activities.builds.map((build) => ({ ...build, choices: build.choices.map((choice) => ({ ...choice })) })),
    includeMeaningSort: lesson.activities.includeMeaningSort,
    ...(input.profile.prefixPresentation ? {
      meaningCheckKind: input.profile.prefixPresentation.meaningCheckKind,
      meaningResultsPresentation: input.profile.prefixPresentation.meaningResultsPresentation,
      cleaverFeedbackPolicy: {
        ...input.profile.prefixPresentation.cleaverFeedbackPolicy,
        firstMiss: [...input.profile.prefixPresentation.cleaverFeedbackPolicy.firstMiss] as [string, ...string[]],
        repeatedMiss: [...input.profile.prefixPresentation.cleaverFeedbackPolicy.repeatedMiss] as [string, ...string[]],
        ...(input.profile.prefixPresentation.cleaverFeedbackPolicy.reviewedHint
          ? { reviewedHint: { ...input.profile.prefixPresentation.cleaverFeedbackPolicy.reviewedHint } }
          : {}),
      },
    } : {}),
  } : undefined;
  return {
    ok: true,
    payload: {
      schemaVersion: 2,
      experience: "D4_MOR_GUIDED",
      contentVersion: DYNAMIC_PREFIX_WORD_LAB_CONTENT_VERSION,
      microSkillId: lesson.taxonomy.microSkillKey,
      experienceProfile: DYNAMIC_PREFIX_WORD_LAB_PROFILE,
      ...(input.profile.prefixPresentation ? { presentationPolicyVersion: input.profile.prefixPresentation.version } : {}),
      prefix: { ...lesson.header },
      authenticCanonicalWordIds: lesson.words.filter((word) => word.role === "authentic_target").map((word) => word.canonicalWordId),
      words: { lesson: words },
      activities: {
        introduction: {
          title: lesson.introduction.title,
          paragraphs: [...lesson.introduction.paragraphs],
          ...(lesson.introduction.profileTitle ? { profileTitle: lesson.introduction.profileTitle } : {}),
          ...(lesson.introduction.profileParagraphs ? { profileParagraphs: [...lesson.introduction.profileParagraphs] } : {}),
          ...(lesson.introduction.profileExamples ? { profileExamples: lesson.introduction.profileExamples.map((example) => ({ ...example })) } : {}),
          ...(lesson.introduction.teachingCards ? { teachingCards: lesson.introduction.teachingCards.map((card) => ({ ...card, rules: [...card.rules] as [string, ...string[]], ...(card.example ? { example: { ...card.example } } : {}) })) } : {}),
        },
        discovery: lesson.words.map((word) => ({
          canonicalWordId: word.canonicalWordId,
          word: word.displayWord,
          baseWord: word.semanticBaseText,
          baseMeaning: word.baseMeaning,
          derivedMeaning: word.derivedMeaning,
          distractorMeaning: word.baseMeaning,
          prefixLabel: word.affixLabel,
        })),
        meaningBins: lesson.meaningGroups.map((group) => ({ ...group })),
        build: { ...lesson.activities.primaryBuild, choices: lesson.activities.primaryBuild.choices.map((choice) => ({ ...choice })) },
        ...(guided ? { guided } : {}),
        dictation: lesson.activities.dictationWordIds.map((id) => {
          const word = wordById.get(id)!;
          const source = sourceById.get(id)!;
          return { canonicalWordId: id, targetWord: word.displayWord, sentence: source.dictation.sentence, targetTokenIndex: source.dictation.targetTokenIndex };
        }),
        reflection: { ...lesson.reflection },
        ...(input.profile.prefixPresentation ? { controlledPolicy: { coverClosePolicy: input.profile.prefixPresentation.coverClosePolicy } } : {}),
      },
    },
  };
}

export function adaptSharedAffixLessonToDynamicAffixV3(
  lesson: CompiledAffixLessonV1,
): SharedAffixCompatibilityResult<DynamicAffixLessonPayloadV3> {
  if (lesson.position !== "after" || lesson.introduction.kind !== "affix_v3") {
    return { ok: false, blockers: [{ code: "compatibility_adapter_mismatch", detail: "affix_shape" }] };
  }
  return {
    ok: true,
    payload: {
      schemaVersion: 3,
      experience: "D4_MOR_GUIDED",
      contentVersion: DYNAMIC_AFFIX_WORD_LAB_CONTENT_VERSION,
      microSkillId: lesson.taxonomy.microSkillKey,
      experienceProfile: DYNAMIC_AFFIX_WORD_LAB_PROFILE,
      affix: { position: lesson.position, ...lesson.header },
      authenticCanonicalWordIds: lesson.words.filter((word) => word.role === "authentic_target").map((word) => word.canonicalWordId),
      words: {
        lesson: lesson.words.map((word) => ({
          canonicalWordId: word.canonicalWordId,
          displayWord: word.displayWord,
          audioText: word.audioText,
          baseMeaning: word.baseMeaning,
          derivedMeaning: word.derivedMeaning,
          effect: word.meaningGroupId,
          parts: word.parts,
          joins: word.joins,
          splitPoints: [...word.splitPoints],
          semanticBaseText: word.semanticBaseText,
          semanticBaseKind: word.semanticBaseKind,
          teachingBaseText: word.teachingSurfaceText,
          affixText: word.affixForm,
          affixLabel: word.affixLabel,
          source: word.role === "authentic_target" ? "authentic" : "transfer",
        })),
      },
      activities: {
        introduction: {
          title: lesson.introduction.title,
          paragraphs: [...lesson.introduction.paragraphs],
          spellingRules: [...lesson.introduction.spellingRules],
          examples: lesson.introduction.examples.map((example) => ({ ...example })),
          ...(lesson.introduction.meaningStatement ? { meaningStatement: lesson.introduction.meaningStatement } : {}),
        },
        discovery: lesson.words.map((word) => ({
          canonicalWordId: word.canonicalWordId,
          word: word.displayWord,
          baseWord: word.semanticBaseText,
          baseMeaning: word.baseMeaning,
          derivedMeaning: word.derivedMeaning,
          distractorMeaning: word.baseMeaning,
          affixLabel: word.affixLabel,
        })),
        meaningBins: lesson.meaningGroups.map((group) => ({ ...group })),
        guided: {
          splitCanonicalWordIds: [...lesson.activities.splitCanonicalWordIds],
          builds: lesson.activities.builds.map((build) => ({ ...build, choices: build.choices.map((choice) => ({ ...choice })) })),
          includeMeaningSort: lesson.activities.includeMeaningSort,
        },
        dictation: lesson.words.map((word) => ({
          canonicalWordId: word.canonicalWordId,
          targetWord: word.displayWord,
          sentence: word.dictation.sentence,
          targetTokenIndex: word.dictation.targetTokenIndex,
        })),
        reflection: { ...lesson.reflection },
      },
    },
  };
}

export function compileDynamicPrefixSelectionThroughSharedCompiler(
  selection: DynamicPrefixSelection,
  sourceKind: AffixLessonCompilationInputV1["provenance"]["sourceKind"] = "reviewed_fixture",
): SharedAffixShadowResult<DynamicPrefixLessonPayloadV2> {
  const normalised = normaliseDynamicPrefixSelection(selection, sourceKind);
  if (!normalised.ok) return normalised;
  const compiled = compileSharedAffixLesson(normalised.input);
  if (!compiled.ok) return compiled;
  const adapted = adaptSharedAffixLessonToDynamicPrefixV2(normalised.input, compiled.lesson);
  if (!adapted.ok) return adapted;
  return { ok: true, input: normalised.input, lesson: compiled.lesson, payload: adapted.payload };
}

export function compileDynamicAffixSelectionThroughSharedCompiler(
  selection: DynamicAffixSelection,
  sourceKind: AffixLessonCompilationInputV1["provenance"]["sourceKind"] = "reviewed_fixture",
): SharedAffixShadowResult<DynamicAffixLessonPayloadV3> {
  const normalised = normaliseDynamicAffixSelection(selection, sourceKind);
  if (!normalised.ok) return normalised;
  const compiled = compileSharedAffixLesson(normalised.input);
  if (!compiled.ok) return compiled;
  const adapted = adaptSharedAffixLessonToDynamicAffixV3(compiled.lesson);
  if (!adapted.ok) return adapted;
  return { ok: true, input: normalised.input, lesson: compiled.lesson, payload: adapted.payload };
}

export function compareSharedAffixPayloadParity(
  authoritativePayload: DynamicPrefixLessonPayloadV2 | DynamicAffixLessonPayloadV3,
  adaptedPayload: DynamicPrefixLessonPayloadV2 | DynamicAffixLessonPayloadV3,
): SharedAffixCompatibilityResult<true> {
  const serialisable = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
  if (canonicalSnapshotJson(serialisable(authoritativePayload)) !== canonicalSnapshotJson(serialisable(adaptedPayload))) {
    return { ok: false, blockers: [{ code: "compatibility_adapter_mismatch", detail: "payload" }] };
  }
  return { ok: true, payload: true };
}
