export const WRITING_ENGINE_SPELLING_ERROR_CATEGORY_CODES = [
  "phonic",
  "pattern_rule",
  "morphology",
  "homophone",
  "irregular_tricky_memory_word",
  "careless_performance_error",
] as const;

export type WritingEngineSpellingErrorCategoryCode =
  (typeof WRITING_ENGINE_SPELLING_ERROR_CATEGORY_CODES)[number];

export const WRITING_ENGINE_SPELLING_ERROR_CATEGORY_LABELS = [
  "Phonic",
  "Pattern/rule",
  "Morphology",
  "Homophone",
  "Irregular/tricky memory word",
  "Careless performance error",
] as const;

export type WritingEngineSpellingErrorCategoryLabel =
  (typeof WRITING_ENGINE_SPELLING_ERROR_CATEGORY_LABELS)[number];

export type WritingEngineSpellingErrorCategoryDefinition = {
  code: WritingEngineSpellingErrorCategoryCode;
  label: WritingEngineSpellingErrorCategoryLabel;
  meaning: string;
  aliases: string[];
};

export type WritingEngineResolvedSpellingErrorCategory = {
  status: "resolved";
  category: WritingEngineSpellingErrorCategoryDefinition;
  normalizedInput: string;
};

export type WritingEngineUnresolvedSpellingErrorCategory = {
  status: "unresolved";
  reason: "missing_category" | "unknown_category" | "ambiguous_category";
  normalizedInput: string | null;
  matchingCodes: WritingEngineSpellingErrorCategoryCode[];
};

export type WritingEngineSpellingErrorCategoryResolution =
  | WritingEngineResolvedSpellingErrorCategory
  | WritingEngineUnresolvedSpellingErrorCategory;

const SPELLING_ERROR_CATEGORY_DEFINITIONS = [
  {
    code: "phonic",
    label: "Phonic",
    meaning:
      "The error mainly reflects sound-to-spelling choice, phoneme-grapheme selection, or vowel/consonant representation.",
    aliases: ["phonic"],
  },
  {
    code: "pattern_rule",
    label: "Pattern/rule",
    meaning:
      "The error mainly reflects an orthographic pattern, convention, or spelling rule rather than a whole-word memory issue.",
    aliases: ["pattern_rule", "pattern/rule", "pattern-rule", "pattern rule"],
  },
  {
    code: "morphology",
    label: "Morphology",
    meaning:
      "The error mainly reflects prefix, suffix, root, or word-structure knowledge.",
    aliases: ["morphology"],
  },
  {
    code: "homophone",
    label: "Homophone",
    meaning:
      "The error mainly reflects meaning-choice confusion between words that sound the same.",
    aliases: ["homophone"],
  },
  {
    code: "irregular_tricky_memory_word",
    label: "Irregular/tricky memory word",
    meaning:
      "The error mainly reflects a word that must be secured through irregular-pattern or memory knowledge rather than simple sound mapping.",
    aliases: [
      "irregular_tricky_memory_word",
      "irregular/tricky memory word",
      "irregular-tricky-memory-word",
      "irregular tricky memory word",
    ],
  },
  {
    code: "careless_performance_error",
    label: "Careless performance error",
    meaning:
      "The error looks like a performance slip such as transposition or inattention rather than a clear underlying concept gap.",
    aliases: [
      "careless_performance_error",
      "careless performance error",
      "careless-performance-error",
    ],
  },
] as const satisfies readonly WritingEngineSpellingErrorCategoryDefinition[];

function normalizeAlias(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, " ")
    .replace(/\s*\/\s*/g, "/");
}

export function getWritingEngineSpellingErrorCategoryVocabulary() {
  return SPELLING_ERROR_CATEGORY_DEFINITIONS.map((category) => ({
    ...category,
    aliases: [...category.aliases],
  }));
}

export function resolveWritingEngineSpellingErrorCategory(
  input: string | null | undefined,
): WritingEngineSpellingErrorCategoryResolution {
  if (typeof input !== "string" || input.trim().length === 0) {
    return {
      status: "unresolved",
      reason: "missing_category",
      normalizedInput: null,
      matchingCodes: [],
    };
  }

  const normalizedInput = normalizeAlias(input);
  const matches = SPELLING_ERROR_CATEGORY_DEFINITIONS.filter((category) => {
    if (normalizeAlias(category.code) === normalizedInput) {
      return true;
    }

    if (normalizeAlias(category.label) === normalizedInput) {
      return true;
    }

    return category.aliases.some((alias) => normalizeAlias(alias) === normalizedInput);
  });

  if (matches.length === 1) {
    return {
      status: "resolved",
      category: {
        ...matches[0],
        aliases: [...matches[0].aliases],
      },
      normalizedInput,
    };
  }

  if (matches.length > 1) {
    return {
      status: "unresolved",
      reason: "ambiguous_category",
      normalizedInput,
      matchingCodes: matches.map((category) => category.code),
    };
  }

  return {
    status: "unresolved",
    reason: "unknown_category",
    normalizedInput,
    matchingCodes: [],
  };
}
