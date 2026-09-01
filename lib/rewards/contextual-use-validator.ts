export const GOLD_BAR_CONTEXT_VALIDATOR_VERSION =
  "gold_bar_contextual_use_rules_v1" as const;

export type ContextualUseStatus = "NOT_REQUIRED" | "VALID" | "INVALID" | "UNCERTAIN";

export interface ContextualUseValidationInput {
  canonicalWord: string;
  containingSentence: string;
  contextRequired: boolean;
}

export interface ContextualUseValidationResult {
  status: ContextualUseStatus;
  validatorVersion: typeof GOLD_BAR_CONTEXT_VALIDATOR_VERSION;
  reasonCodes: string[];
}

const WORD_PATTERN = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;

function words(value: string): string[] {
  return (value.normalize("NFC").toLowerCase().match(WORD_PATTERN) ?? [])
    .map((word) => word.replace("’", "'"));
}

const POSSESSIVE_NOUNS = new Set([
  "answer", "answers", "book", "books", "brother", "brothers", "cat", "cats",
  "choice", "choices", "dog", "dogs", "family", "friend", "friends", "home",
  "house", "idea", "ideas", "name", "names", "parent", "parents", "school",
  "sister", "sisters", "story", "stories", "teacher", "teachers", "work",
]);

const PREDICATE_WORDS = new Set([
  "able", "afraid", "coming", "doing", "going", "happy", "here", "late", "ready",
  "running", "sad", "staying", "sure", "there", "tired", "working", "wrong",
]);

const BASE_VERBS = new Set([
  "be", "come", "do", "eat", "find", "finish", "go", "help", "learn", "look",
  "make", "play", "read", "run", "say", "see", "stay", "try", "use", "walk",
  "work", "write",
]);

const NUMBER_WORDS = new Set([
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
]);

function decision(
  status: Exclude<ContextualUseStatus, "NOT_REQUIRED">,
  reasonCode: string,
): ContextualUseValidationResult {
  return {
    status,
    validatorVersion: GOLD_BAR_CONTEXT_VALIDATOR_VERSION,
    reasonCodes: [reasonCode],
  };
}

/**
 * Conservative lexical-choice validator. It admits only high-confidence
 * constructions, rejects a bounded set of high-confidence conflicts, and
 * returns UNCERTAIN for every other context. UNCERTAIN never earns reward.
 */
export function validateContextualGoldBarUse(
  input: ContextualUseValidationInput,
): ContextualUseValidationResult {
  if (!input.contextRequired) {
    return {
      status: "NOT_REQUIRED",
      validatorVersion: GOLD_BAR_CONTEXT_VALIDATOR_VERSION,
      reasonCodes: ["CONTEXT_VALIDATION_NOT_REQUIRED"],
    };
  }

  const tokens = words(input.containingSentence);
  const target = input.canonicalWord.normalize("NFC").toLowerCase().replace("’", "'");
  const index = tokens.indexOf(target);
  if (index < 0) return decision("UNCERTAIN", "TARGET_NOT_FOUND_IN_CONTEXT");
  const previous = tokens[index - 1] ?? null;
  const next = tokens[index + 1] ?? null;
  const afterNext = tokens[index + 2] ?? null;

  if (target === "their") {
    if (next && PREDICATE_WORDS.has(next)) return decision("INVALID", "THEIR_BEFORE_PREDICATE");
    if (next === "own" || (next && POSSESSIVE_NOUNS.has(next))) {
      return decision("VALID", "THEIR_BEFORE_POSSESSED_NOUN");
    }
  }
  if (target === "there") {
    if (next && POSSESSIVE_NOUNS.has(next)) return decision("INVALID", "THERE_BEFORE_POSSESSED_NOUN");
    if (["is", "are", "was", "were", "will", "seems", "stood", "lived"].includes(next ?? "")) {
      return decision("VALID", "THERE_EXISTENTIAL_OR_LOCATION");
    }
  }
  if (target === "they're") {
    if (next && (PREDICATE_WORDS.has(next) || next === "a" || next === "an" || next === "the")) {
      return decision("VALID", "THEYRE_EXPANDS_TO_THEY_ARE");
    }
    if (next && POSSESSIVE_NOUNS.has(next)) return decision("INVALID", "THEYRE_BEFORE_BARE_NOUN");
  }
  if (target === "your") {
    if (next && PREDICATE_WORDS.has(next)) return decision("INVALID", "YOUR_BEFORE_PREDICATE");
    if (next === "own" || (next && POSSESSIVE_NOUNS.has(next))) {
      return decision("VALID", "YOUR_BEFORE_POSSESSED_NOUN");
    }
  }
  if (target === "you're") {
    if (next && (PREDICATE_WORDS.has(next) || next === "a" || next === "an" || next === "the")) {
      return decision("VALID", "YOURE_EXPANDS_TO_YOU_ARE");
    }
    if (next && POSSESSIVE_NOUNS.has(next)) return decision("INVALID", "YOURE_BEFORE_BARE_NOUN");
  }
  if (target === "to") {
    if (next && (NUMBER_WORDS.has(next) || next === "many" || next === "much")) {
      return decision("INVALID", "TO_IN_QUANTITY_CONTEXT");
    }
    if (next && BASE_VERBS.has(next)) return decision("VALID", "TO_BEFORE_BASE_VERB");
  }
  if (target === "too") {
    if (next === null || (next && PREDICATE_WORDS.has(next)) || next === "many" || next === "much") {
      return decision("VALID", "TOO_EXCESS_OR_ADDITIVE_CONTEXT");
    }
    if (next && BASE_VERBS.has(next)) return decision("INVALID", "TOO_BEFORE_BASE_VERB");
  }
  if (target === "two") {
    if (next && (POSSESSIVE_NOUNS.has(next) || NUMBER_WORDS.has(next))) {
      return decision("VALID", "TWO_QUANTITY_CONTEXT");
    }
    if (next && BASE_VERBS.has(next)) return decision("INVALID", "TWO_BEFORE_BASE_VERB");
  }
  if (target === "weather") {
    if (next === "or" && afterNext === "not") return decision("INVALID", "WEATHER_IN_WHETHER_OR_NOT_PHRASE");
    if (previous === "the" || ["forecast", "rain", "sun", "wind"].includes(next ?? "")) {
      return decision("VALID", "WEATHER_CLIMATE_CONTEXT");
    }
  }
  if (target === "whether") {
    if (next === "or" || afterNext === "or") return decision("VALID", "WHETHER_ALTERNATIVE_CONTEXT");
    if (previous === "the") return decision("INVALID", "WHETHER_AFTER_DEFINITE_ARTICLE");
  }
  if (target === "whose") {
    if (next && POSSESSIVE_NOUNS.has(next)) return decision("VALID", "WHOSE_POSSESSIVE_QUESTION");
  }
  if (target === "who's") {
    if (next && (PREDICATE_WORDS.has(next) || next === "a" || next === "the")) {
      return decision("VALID", "WHOS_EXPANDS_TO_WHO_IS");
    }
    if (next && POSSESSIVE_NOUNS.has(next)) return decision("INVALID", "WHOS_BEFORE_POSSESSED_NOUN");
  }

  return decision("UNCERTAIN", "NO_HIGH_CONFIDENCE_CONTEXT_RULE");
}

export function sentenceContainingSpan(
  writing: string,
  startOffset: number,
  endOffset: number,
): string {
  const left = Math.max(
    writing.lastIndexOf(".", startOffset - 1),
    writing.lastIndexOf("!", startOffset - 1),
    writing.lastIndexOf("?", startOffset - 1),
    writing.lastIndexOf("\n", startOffset - 1),
  );
  const endings = [".", "!", "?", "\n"]
    .map((mark) => writing.indexOf(mark, endOffset))
    .filter((offset) => offset >= 0);
  const right = endings.length > 0 ? Math.min(...endings) : writing.length;
  return writing.slice(left + 1, right).trim();
}
