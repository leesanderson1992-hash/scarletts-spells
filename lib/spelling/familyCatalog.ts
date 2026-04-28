import {
  WORD_FAMILIES,
  findWordFamilyForWord,
  findHomophoneGroupFamilyForWord,
  normaliseWordFamilyId,
  asWordFamilyId,
  matchesWordFamily,
  type WordFamily,
  type WordFamilyId,
} from "./wordFamilies";
import type { SpellingCategory } from "./categoriseError";
import type { ErrorPattern } from "./errorPatterns";

export type WordFamilyRecord = Record<string, unknown>;

export type ResolvedPracticeFamily = {
  id: string;
  label: string;
  category: string;
  description: string;
  teachingNote: string;
  practiceWords: string[];
  promptExamples: Array<{ answer: string; sentence: string }>;
  priority: number;
  builtinFamilyId: WordFamilyId | null;
  source: "supabase" | "builtin";
};

export type FamilyCatalogOption = {
  value: string;
  label: string;
  category: string;
  description: string;
  teachingNote: string;
  priority: number;
  source: "supabase" | "builtin";
  recommendationReason?: string;
};

function dedupeWords(words: string[]) {
  return Array.from(
    new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean)),
  );
}

function formatCategoryLabel(category: string) {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getDiagnosisCandidateFamilyIds(
  diagnosis: ErrorPattern | null,
  correctedWordFamilyId: WordFamilyId | null,
  correctedWord: string,
): string[] {
  switch (diagnosis) {
    case "missing_double_letter":
    case "extra_double_letter":
      return ["double_letters", "tricky_common_words"];
    case "missing_final_e":
      return ["silent_e_words"];
    case "wrong_drop_keep_e_before_suffix":
      return ["drop_keep_final_e_suffixes", "drop_final_e_ing", "silent_e_words"];
    case "ck_pattern_error":
      return ["ck_pattern", correctedWordFamilyId ?? "", "tricky_common_words"].filter(
        Boolean,
      );
    case "y_to_i_suffix_error":
      return ["change_y_to_i", correctedWordFamilyId ?? ""].filter(Boolean);
    case "wrong_consonant_doubling_before_suffix":
      return ["double_consonant_suffix", "no_double_consonant"];
    case "omitted_unstressed_vowel":
      return ["schwa_unstressed_vowel", "tricky_common_words"];
    case "consonant_le_el_al_ending_error":
      return ["final_le_patterns", "tricky_common_words"];
    case "wrong_suffix_spelling":
      return [
        correctedWordFamilyId ?? "",
        "common_suffixes",
        "tion_sion_suffixes",
        "change_y_to_i",
        "drop_keep_final_e_suffixes",
        "drop_final_e_ing",
        "double_consonant_suffix",
        "no_double_consonant",
      ].filter(Boolean);
    case "wrong_prefix_spelling":
      return [correctedWordFamilyId ?? "", "common_prefixes", "tricky_common_words"].filter(
        Boolean,
      );
    case "root_family_preservation_error":
      return [
        correctedWordFamilyId ?? "",
        "root_family_preservation",
        "common_suffixes",
        "tricky_common_words",
      ].filter(Boolean);
    case "wrong_final_vowel_pattern":
      return [correctedWordFamilyId ?? "", "ai-ay", "ie_ei_patterns", "tricky_common_words"].filter(
        Boolean,
      );
    case "wrong_vowel_grapheme":
      return [
        "schwa_unstressed_vowel",
        correctedWordFamilyId ?? "",
        "ie_ei_patterns",
        "tricky_common_words",
      ].filter(Boolean);
    case "extra_consonant_letter":
      return [correctedWordFamilyId ?? "", "ck_pattern", "tricky_common_words"].filter(Boolean);
    case "homophone_confusion":
      return [
        correctedWordFamilyId ?? "",
        findHomophoneGroupFamilyForWord(correctedWord)?.id ?? "",
      ].filter(Boolean);
    case "tricky_whole_word_error":
      return [correctedWordFamilyId ?? "", "tricky_common_words"].filter(Boolean);
    default:
      return correctedWordFamilyId ? [correctedWordFamilyId] : [];
  }
}

function getTeachingModeCandidateFamilyIds(
  category: SpellingCategory | null,
): string[] {
  switch (category) {
    case "Phonic":
      return [
        "schwa_unstressed_vowel",
        "ie_ei_patterns",
        "ai-ay",
        "ee-ea",
        "igh-ie-y",
        "oa-ow-oe",
        "ow-ou",
        "ar-or",
        "er-ir-ur",
      ];
    case "Pattern/rule":
      return [
        "double_letters",
        "ck_pattern",
        "silent_e_words",
        "final_le_patterns",
        "change_y_to_i",
        "drop_keep_final_e_suffixes",
        "drop_final_e_ing",
        "double_consonant_suffix",
        "no_double_consonant",
      ];
    case "Morphology":
      return [
        "common_prefixes",
        "common_suffixes",
        "root_family_preservation",
        "tion_sion_suffixes",
        "change_y_to_i",
        "drop_keep_final_e_suffixes",
        "drop_final_e_ing",
        "double_consonant_suffix",
        "no_double_consonant",
        "suffixes",
      ];
    case "Homophone":
      return [
        "homophone_there_their_theyre",
        "homophone_to_too_two",
        "homophone_weather_whether",
        "homophone_whose_whos",
        "homophones_year_2",
        "homophones_year_3_4",
      ];
    case "Irregular/tricky memory word":
      return ["tricky_common_words"];
    case "Careless performance error":
      return [];
    default:
      return [];
  }
}

function normaliseWordsField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupeWords(
      value.filter((item): item is string => typeof item === "string"),
    );
  }

  if (typeof value === "string") {
    return dedupeWords(value.split(/[\n,]/));
  }

  return [];
}

function normalisePromptExamplesField(
  value: unknown,
): Array<{ answer: string; sentence: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const answer =
        "answer" in item && typeof item.answer === "string" ? item.answer.trim() : "";
      const sentence =
        "sentence" in item && typeof item.sentence === "string"
          ? item.sentence.trim()
          : "";

      return answer && sentence ? [{ answer, sentence }] : [];
    });
  }

  if (typeof value === "string") {
    try {
      return normalisePromptExamplesField(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

function builtinToResolvedFamily(family: WordFamily): ResolvedPracticeFamily {
  return {
    id: family.id,
    label: family.label,
    category: "Built-in fallback",
    description: family.description,
    teachingNote: family.description,
    practiceWords: dedupeWords(family.practiceWords),
    promptExamples: [],
    priority: 999,
    builtinFamilyId: family.id,
    source: "builtin",
  };
}

function parseSupabaseFamilyRow(
  row: WordFamilyRecord,
): ResolvedPracticeFamily | null {
  const idCandidates = [row.slug, row.family_slug, row.code, row.id];
  const labelCandidates = [
    row.family_name,
    row.label,
    row.name,
    row.title,
    row.display_name,
    row.slug,
    row.family_slug,
    row.code,
    row.id,
  ];
  const noteCandidates = [
    row.teaching_note,
    row.teachingNote,
    row.description,
    row.family_description,
    row.familyDescription,
    row.notes,
    row.summary,
  ];
  const descriptionCandidates = [
    row.description,
    row.family_description,
    row.familyDescription,
    row.notes,
    row.summary,
  ];
  const practiceWordCandidates = [
    row.examples,
    row.practice_words,
    row.practiceWords,
    row.example_words,
    row.words,
  ];
  const promptExampleCandidates = [
    row.prompt_examples,
    row.promptExamples,
    row.sentence_prompts,
    row.sentencePrompts,
    row.sentence_examples,
    row.sentenceExamples,
    row.meaning_prompts,
    row.meaningPrompts,
  ];
  const categoryCandidates = [
    row.category,
    row.group_name,
    row.group,
  ];
  const builtinCandidates = [
    row.builtin_family_slug,
    row.builtin_slug,
    row.family_slug,
    row.slug,
    row.code,
  ];
  const priorityCandidates = [row.priority, row.sort_order, row.sortOrder];

  const id = idCandidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  const label = labelCandidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (!id || !label) {
    return null;
  }

  const teachingNote =
    noteCandidates.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0,
    ) ?? "";
  const category =
    categoryCandidates.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0,
    ) ?? "Supabase family";
  const description =
    descriptionCandidates.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0,
    ) ?? "";
  const practiceWords = dedupeWords(
    practiceWordCandidates.flatMap((candidate) => normaliseWordsField(candidate)),
  );
  const promptExamples = promptExampleCandidates.flatMap((candidate) =>
    normalisePromptExamplesField(candidate),
  );
  const priority =
    priorityCandidates.find(
      (candidate): candidate is number => typeof candidate === "number" && Number.isFinite(candidate),
    ) ?? 100;
  const builtinFamilyId =
    builtinCandidates
      .map((candidate) =>
        typeof candidate === "string" ? asWordFamilyId(candidate.trim()) : null,
      )
      .find((candidate): candidate is WordFamilyId => candidate !== null) ?? null;

  return {
    id: id.trim(),
    label: label.trim(),
    category: category.trim(),
    description: description.trim(),
    teachingNote: teachingNote.trim(),
    practiceWords,
    promptExamples,
    priority,
    builtinFamilyId,
    source: "supabase",
  };
}

export function buildPracticeFamilyCatalog(
  rows: WordFamilyRecord[],
): Map<string, ResolvedPracticeFamily> {
  const catalog = new Map<string, ResolvedPracticeFamily>();

  for (const family of WORD_FAMILIES) {
    const resolved = builtinToResolvedFamily(family);
    catalog.set(resolved.id, resolved);
  }

  for (const row of rows) {
    const resolved = parseSupabaseFamilyRow(row);
    if (!resolved) {
      continue;
    }

    catalog.set(resolved.id, resolved);
  }

  return catalog;
}

export function buildFamilyCatalogOptions(
  rows: WordFamilyRecord[],
): FamilyCatalogOption[] {
  return Array.from(buildPracticeFamilyCatalog(rows).values())
    .map((family) => ({
      value: family.id,
      label: family.label,
      category: formatCategoryLabel(family.category),
      description: family.description,
      teachingNote: family.teachingNote,
      priority: family.priority,
      source: family.source,
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.label.localeCompare(right.label);
    });
}

type RecommendedFamilyContext = {
  diagnosis: ErrorPattern | null;
  teachingMode: SpellingCategory | null;
  correctedWord: string;
  detectedFamilyId: string | null;
  parentOverrideFamilyId: string | null;
};

export function buildRecommendedFamilyOptions(
  rows: WordFamilyRecord[],
  allOptions: FamilyCatalogOption[],
  context: RecommendedFamilyContext,
): FamilyCatalogOption[] {
  const optionByValue = new Map(allOptions.map((option) => [option.value, option]));
  const correctedWordFamilyId =
    findWordFamilyForWord(context.correctedWord.toLowerCase())?.id ?? null;
  const candidates: Array<{ familyId: string; reason: string; priority: number }> = [];

  if (context.parentOverrideFamilyId) {
    candidates.push({
      familyId: context.parentOverrideFamilyId,
      reason: "Used before for a similar reviewed mistake",
      priority: 0,
    });
  }

  if (context.detectedFamilyId) {
    candidates.push({
      familyId: context.detectedFamilyId,
      reason: "Suggested by the current spelling analysis",
      priority: 1,
    });
  }

  getDiagnosisCandidateFamilyIds(
    context.diagnosis,
    correctedWordFamilyId,
    context.correctedWord.toLowerCase(),
  ).forEach(
    (familyId, index) => {
      candidates.push({
        familyId,
        reason: "Fits what went wrong in this spelling",
        priority: 10 + index,
      });
    },
  );

  if (correctedWordFamilyId) {
    candidates.push({
      familyId: correctedWordFamilyId,
      reason: "Matches the corrected word pattern",
      priority: 30,
    });
  }

  getTeachingModeCandidateFamilyIds(context.teachingMode).forEach(
    (familyId, index) => {
      candidates.push({
        familyId,
        reason: "Commonly useful for this teaching mode",
        priority: 40 + index,
      });
    },
  );

  const seen = new Set<string>();
  const recommendedOptions = candidates
    .map((candidate) => {
      const resolved = resolvePracticeFamily(candidate.familyId, rows);
      if (!resolved || seen.has(resolved.id)) {
        return null;
      }

      const option = optionByValue.get(resolved.id);
      if (!option) {
        return null;
      }

      seen.add(resolved.id);

      return {
        ...option,
        recommendationReason: candidate.reason,
        priority: candidate.priority,
      };
    })
    .filter(
      (
        option,
      ): option is FamilyCatalogOption & { recommendationReason: string } =>
        option !== null,
    );

  return recommendedOptions
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, 4);
}

type RelevantFamilyContext = RecommendedFamilyContext & {
  includeAllFallback?: boolean;
};

export function buildRelevantFamilyOptions(
  rows: WordFamilyRecord[],
  allOptions: FamilyCatalogOption[],
  context: RelevantFamilyContext,
): FamilyCatalogOption[] {
  const recommended = buildRecommendedFamilyOptions(rows, allOptions, context);
  const recommendedIds = new Set(recommended.map((option) => option.value));
  const correctedWordFamilyId =
    findWordFamilyForWord(context.correctedWord.toLowerCase())?.id ?? null;
  const teachingModeIds = new Set(
    getTeachingModeCandidateFamilyIds(context.teachingMode).filter(Boolean),
  );
  const diagnosisIds = new Set(
    getDiagnosisCandidateFamilyIds(
      context.diagnosis,
      correctedWordFamilyId,
      context.correctedWord.toLowerCase(),
    ).filter(Boolean),
  );
  const explicitIds = new Set(
    [
      context.parentOverrideFamilyId,
      context.detectedFamilyId,
      correctedWordFamilyId,
      ...Array.from(recommendedIds),
      ...Array.from(teachingModeIds),
      ...Array.from(diagnosisIds),
    ].filter(Boolean),
  );

  const filtered = allOptions.filter((option) => {
    return explicitIds.has(option.value);
  });

  if (filtered.length > 0 || !context.includeAllFallback) {
    return filtered.sort((left, right) => {
      const leftRecommended = recommendedIds.has(left.value) ? 0 : 1;
      const rightRecommended = recommendedIds.has(right.value) ? 0 : 1;
      if (leftRecommended !== rightRecommended) {
        return leftRecommended - rightRecommended;
      }

      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.label.localeCompare(right.label);
    });
  }

  return allOptions;
}

export function resolvePracticeFamily(
  familyId: string | null,
  rows: WordFamilyRecord[],
): ResolvedPracticeFamily | null {
  const normalisedFamilyId = normaliseWordFamilyId(familyId);
  if (!normalisedFamilyId) {
    return null;
  }

  const catalog = buildPracticeFamilyCatalog(rows);
  const directMatch = catalog.get(normalisedFamilyId);
  if (directMatch) {
    return directMatch;
  }

  const builtinId = asWordFamilyId(normalisedFamilyId);
  if (!builtinId) {
    return null;
  }

  return (
    Array.from(catalog.values())
      .filter((family) => family.builtinFamilyId === builtinId)
      .sort((left, right) => {
        if (left.source !== right.source) {
          return left.source === "supabase" ? -1 : 1;
        }

        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }

        return left.label.localeCompare(right.label);
      })[0] ?? null
  );
}

export function fitsResolvedPracticeFamily(
  word: string,
  family: ResolvedPracticeFamily | null,
): boolean {
  if (!family) {
    return false;
  }

  if (family.practiceWords.includes(word)) {
    return true;
  }

  if (family.builtinFamilyId === "tricky-words") {
    return true;
  }

  return family.builtinFamilyId
    ? matchesWordFamily(word, family.builtinFamilyId)
    : false;
}
