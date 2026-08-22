import type { MeaningConnectionTarget } from "./meaning-connection-contract";
import type { AdleSessionItem } from "./loaders/daily-plan-surface";
import { resolveSentenceDictationContract } from "./sentence-dictation-contract";

import type {
  CanonicalActivityNormalizationResult,
  CanonicalActivitySpec,
} from "./canonical-activity-spec";

const RICH_TEMPLATE_KEYS = new Set([
  "PG_SOUND_NOTICE", "PG_GRAPHEME_MAP",
  "HOM_SENTENCE_CHOICE", "HOM_CORRECTION",
  "INF_CONTEXT_CHOICE", "INF_RULE_CHOICE", "INF_TRANSFORM",
  "IRRE_TRICKY_PART", "MOR_STRIP_BUILD", "MOR_BUILD_WORD", "MOR_COMPOUND_JIGSAW",
  "PAT_PATTERN_SPOT", "PAT_RULE_APPLY", "SYL_SPLIT", "SYL_REBUILD",
  "SCHWA_STRESS_MARK", "SCHWA_VOWEL_REVEAL", "SCHWA_ANCHOR",
]);

const MEANING_TEMPLATE_KEYS = new Set([
  "HOM_MEANING_MATCH", "MOR_MEANING_MATCH", "MOR_COMPOUND_MEANING_CONNECTION",
]);

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function block(
  item: AdleSessionItem,
  code: Extract<CanonicalActivityNormalizationResult, { status: "blocked" }>["blocker"]["code"],
  detail: string,
): CanonicalActivityNormalizationResult {
  return {
    status: "blocked",
    blocker: {
      code,
      activityId: item.id,
      templateKey: item.templateKey,
      sectionKey: item.sectionKey,
      detail,
    },
  };
}

function spec(
  item: AdleSessionItem,
  concept: string,
  mode: string,
  payload: Record<string, unknown>,
  compatibility = false,
): CanonicalActivityNormalizationResult {
  const normalized: CanonicalActivitySpec = {
    id: item.id,
    label: item.templateKey || item.sectionKey || "Historical activity",
    concept,
    mode,
    contractVersion: 1,
    payload,
    source: {
      templateKey: item.templateKey,
      sectionKey: item.sectionKey,
      compatibility,
    },
  };
  return { status: compatibility ? "compatibility" : "normalized", spec: normalized };
}

function requireWordIdentity(item: AdleSessionItem): CanonicalActivityNormalizationResult | null {
  return nonEmptyString(item.canonicalWordId) && nonEmptyString(item.targetWord)
    ? null
    : block(item, "ADLE_ACTIVITY_INVALID_HISTORICAL_PAYLOAD", "A governed target word and canonical word identity are required.");
}

export function meaningConnectionTargetFromHistoricalItem(item: AdleSessionItem): MeaningConnectionTarget | null {
  const nested = typeof item.promptData.meaningConnection === "object" && item.promptData.meaningConnection !== null
    ? item.promptData.meaningConnection as Record<string, unknown>
    : item.promptData;
  const definition = [nested.definition, nested.childFriendlyDefinition, nested.wholeWordMeaning].find(nonEmptyString);
  if (!nonEmptyString(item.canonicalWordId) || !nonEmptyString(item.targetWord) || !definition) return null;
  const componentMeanings = Array.isArray(nested.componentMeanings)
    ? nested.componentMeanings.filter(nonEmptyString)
    : undefined;
  return {
    canonicalWordId: item.canonicalWordId,
    word: item.targetWord,
    ...(nonEmptyString(nested.audioText) ? { audioText: nested.audioText } : {}),
    definition,
    ...(componentMeanings?.length ? { componentMeanings } : {}),
    ...(nonEmptyString(nested.componentToWholeRelationship)
      ? { componentToWholeRelationship: nested.componentToWholeRelationship }
      : {}),
  };
}

/**
 * Decode a generic/historical item into a canonical in-memory contract.
 * Section-only compatibility is deliberately limited to interactions whose
 * complete learner semantics can be reconstructed from the historical row.
 */
export function normalizeGenericActivity(item: AdleSessionItem): CanonicalActivityNormalizationResult {
  if (item.canonicalActivitySpec) {
    return { status: "normalized", spec: item.canonicalActivitySpec };
  }
  const key = item.templateKey;
  const section = item.sectionKey;

  if (key === "MICRO_READ_ONLY_INTRO" || key === "LESSON_WORDS_INTRO" || (!key && section === "lesson_intro")) {
    return spec(item, "INTRODUCTION", "historical_generic_read_only", { item }, true);
  }

  if (key === "REVIEW_QUICK_SORT" || (!key && section === "review_quick_sort")) {
    return spec(item, "REVIEW_SORT", "compatibility_noop", {}, true);
  }

  if (
    key === "REVIEW_DICTATION"
    || (key === "DICTATION_SENTENCE_CONTEXT" && section === "review_production")
    || (!key && section === "review_production")
  ) {
    const invalid = requireWordIdentity(item);
    if (invalid) return invalid;
    return spec(item, "COLD_WORD_RECALL", "scheduled_review", {
      canonicalWordId: item.canonicalWordId,
      targetWord: item.targetWord,
      ...(nonEmptyString(item.promptData.audioText) ? { audioText: item.promptData.audioText } : {}),
    }, key === "DICTATION_SENTENCE_CONTEXT" || !key);
  }

  if (key === "ERROR_REFLECTION_CUE" || (!key && section === "review_reflection")) {
    const invalid = requireWordIdentity(item);
    if (invalid) return invalid;
    return spec(item, "ERROR_REPAIR", "reveal_hide_retry", { item, canonicalWordId: item.canonicalWordId }, !key);
  }

  if (key === "CONTROLLED_SPELLING" || (!key && section === "lesson_production")) {
    const invalid = requireWordIdentity(item);
    if (invalid) return invalid;
    return spec(item, "COVER_CHECK", "whole_word", { word: item.targetWord, canonicalWordId: item.canonicalWordId, splitPoints: [] }, !key);
  }

  if (key === "HIDE_WRITE") {
    const invalid = requireWordIdentity(item);
    if (invalid) return invalid;
    return spec(item, "COVER_CHECK", "whole_word", { word: item.targetWord, canonicalWordId: item.canonicalWordId, splitPoints: [] }, true);
  }

  if (key === "DICTATION_NO_IMAGE" || (key === "DICTATION_SENTENCE_CONTEXT" && section === "lesson_dictation") || (!key && section === "lesson_dictation")) {
    const invalid = requireWordIdentity(item);
    if (invalid) return invalid;
    const contract = resolveSentenceDictationContract(item.promptData, item.targetWord);
    if (!contract) return block(item, "ADLE_ACTIVITY_INVALID_HISTORICAL_PAYLOAD", "A governed authored sentence and target token are required for Dictation.");
    return spec(item, "DICTATION", "whole_sentence", {
      audioText: contract.audioText,
      correctSentence: contract.sentence,
      canonicalWordId: item.canonicalWordId,
      targetTokenIndex: contract.targetTokenIndex,
    }, !key);
  }

  if (key === "DIAGNOSTIC_DICTATION_PROBE" || (!key && section === "lesson_probe")) {
    const words = Array.isArray(item.promptData.words)
      ? item.promptData.words.filter((word): word is { canonicalWordId: string; targetWord: string; audioText?: string } => (
          typeof word === "object" && word !== null
          && nonEmptyString((word as Record<string, unknown>).canonicalWordId)
          && nonEmptyString((word as Record<string, unknown>).targetWord)
        ))
      : [];
    if (words.length === 0) return block(item, "ADLE_ACTIVITY_INVALID_HISTORICAL_PAYLOAD", "At least one governed diagnostic word is required.");
    return spec(item, "COLD_WORD_RECALL", "diagnostic_probe", { words }, !key);
  }

  if (key === "MEMORY_CUE") {
    const invalid = requireWordIdentity(item);
    if (invalid) return invalid;
    return spec(item, "MEMORY_CUE", "child_authored_cue", { item, canonicalWordId: item.canonicalWordId, variant: "memory_cue" });
  }

  if (MEANING_TEMPLATE_KEYS.has(key)) {
    const target = meaningConnectionTargetFromHistoricalItem(item);
    return target
      ? spec(item, "MEANING_MATCH", "component_clues", { targets: [target], canonicalWordId: item.canonicalWordId })
      : spec(item, "MEANING_MATCH", "historical_free_response", { item, canonicalWordId: item.canonicalWordId, variant: "historical_free_response" }, true);
  }

  if (key === "MUST_USE_FREEWRITING" || key === "REVIEW_MUST_USE_WRITING") {
    const invalid = requireWordIdentity(item);
    if (invalid) return invalid;
    return spec(item, "FREE_WRITING", key === "MUST_USE_FREEWRITING" ? "first_impression_transfer" : "review_transfer", {
      item,
      canonicalWordId: item.canonicalWordId,
      targetWord: item.targetWord,
      variant: "historical_free_response",
    }, true);
  }

  if (RICH_TEMPLATE_KEYS.has(key)) {
    return block(item, "ADLE_ACTIVITY_RICH_INTERACTION_UNAVAILABLE", "This rich historical pedagogy has no semantics-preserving canonical contract.");
  }

  if (!section) return block(item, "ADLE_ACTIVITY_UNSUPPORTED_SECTION", "The historical activity has no supported section identity.");
  return block(item, "ADLE_ACTIVITY_UNKNOWN_TEMPLATE", "The historical template key is not an approved compatibility input.");
}

export function normalizeGenericActivitySequence(items: readonly AdleSessionItem[]): CanonicalActivityNormalizationResult[] {
  const results = items.map(normalizeGenericActivity);
  const meaningIndexes = items.flatMap((item, index) => MEANING_TEMPLATE_KEYS.has(item.templateKey) ? [index] : []);
  if (meaningIndexes.some((index) => results[index]?.status === "compatibility")) {
    for (const index of meaningIndexes) {
      const item = items[index];
      results[index] = spec(item, "MEANING_MATCH", "historical_free_response", {
        item,
        canonicalWordId: item.canonicalWordId,
        variant: "historical_free_response",
      }, true);
    }
  }
  return results.flatMap((result) => {
    if (result.status === "blocked" || result.spec.mode !== "diagnostic_probe") return [result];
    const words = result.spec.payload.words;
    if (!Array.isArray(words)) return [result];
    return words.map((word) => {
      const governed = word as { canonicalWordId: string; targetWord: string; audioText?: string };
      return {
        ...result,
        spec: {
          ...result.spec,
          id: `${result.spec.id}:${governed.canonicalWordId}`,
          payload: {
            canonicalWordId: governed.canonicalWordId,
            targetWord: governed.targetWord,
            ...(nonEmptyString(governed.audioText) ? { audioText: governed.audioText } : {}),
          },
        },
      };
    });
  });
}
