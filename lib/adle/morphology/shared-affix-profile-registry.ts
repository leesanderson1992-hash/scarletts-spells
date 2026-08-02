import type { SharedAffixLessonPolicyV1 } from "./shared-affix-contracts";

export interface SharedAffixProfileMappingV1 {
  microSkillKey: string;
  routeId: "dynamic_prefix_word_lab" | "dynamic_affix_word_lab";
  routeVersion: "v2" | "v3";
  recipeKey: "dynamic_prefix_word_lab" | "dynamic_affix_word_lab";
  recipeVersion: "v2" | "v3";
  position: "before" | "after";
  forms: readonly string[];
  policy: SharedAffixLessonPolicyV1;
  prefixFallbackIntroduction?: {
    title: string;
    paragraphs: string[];
    profileTitle?: string;
    profileParagraphs?: string[];
  };
}

const PREFIX_GENERIC_INTRO = {
  title: "Today’s prefix choices",
  paragraphs: ["A prefix goes at the beginning of a word. Different prefix forms can change what a word means."],
} as const;

interface PrefixFallbackIntroduction {
  title: string;
  paragraphs: readonly string[];
  profileTitle?: string;
  profileParagraphs?: readonly string[];
}

const prefixPolicy = (
  overrides: Partial<SharedAffixLessonPolicyV1> = {},
): SharedAffixLessonPolicyV1 => ({
  lessonWordCount: 4,
  authenticTargetCount: { min: 1, max: 4 },
  transferCount: { min: 0, max: 3 },
  requiredFormCoverage: { kind: "minimum_distinct", count: 1 },
  requiredMeaningCoverage: { kind: "minimum_distinct", count: 1 },
  split: { kind: "first_words", count: 1 },
  primaryBuild: { kind: "different_form_from_first_or_first" },
  build: { kind: "different_form_from_first_or_first", count: 1 },
  meaning: { kind: "sort_all_words" },
  choiceOrder: { kind: "declared" },
  legacyGuidedShape: "omit",
  schedule: { kind: "authentic_targets" },
  reward: { kind: "all_lesson_words" },
  expectedAssignmentItemCount: 16,
  ...overrides,
});

const suffixPolicy = (includeMeaningSort: boolean): SharedAffixLessonPolicyV1 => ({
  lessonWordCount: 4,
  authenticTargetCount: { min: 1, max: 4 },
  transferCount: { min: 0, max: 3 },
  requiredFormCoverage: { kind: "minimum_distinct", count: 1 },
  requiredMeaningCoverage: { kind: "minimum_distinct", count: 1 },
  split: { kind: "one_per_form_else_direct_and_changed", count: 2 },
  primaryBuild: { kind: "first_guided_build" },
  build: includeMeaningSort
    ? { kind: "one_per_represented_form_prefer_non_split" }
    : { kind: "every_lesson_word" },
  meaning: includeMeaningSort ? { kind: "sort_all_words" } : { kind: "none" },
  choiceOrder: { kind: "stable_suffix_rotation" },
  legacyGuidedShape: "explicit",
  schedule: { kind: "all_lesson_words" },
  reward: { kind: "all_lesson_words" },
  expectedAssignmentItemCount: includeMeaningSort ? 18 : 16,
});

const prefix = (
  microSkillKey: string,
  forms: readonly string[],
  policy: SharedAffixLessonPolicyV1 = prefixPolicy(),
  prefixFallbackIntroduction: PrefixFallbackIntroduction = PREFIX_GENERIC_INTRO,
): SharedAffixProfileMappingV1 => ({
  microSkillKey,
  routeId: "dynamic_prefix_word_lab",
  routeVersion: "v2",
  recipeKey: "dynamic_prefix_word_lab",
  recipeVersion: "v2",
  position: "before",
  forms,
  policy,
  prefixFallbackIntroduction: {
    title: prefixFallbackIntroduction.title,
    paragraphs: [...prefixFallbackIntroduction.paragraphs],
    ...(prefixFallbackIntroduction.profileTitle ? { profileTitle: prefixFallbackIntroduction.profileTitle } : {}),
    ...(prefixFallbackIntroduction.profileParagraphs ? { profileParagraphs: [...prefixFallbackIntroduction.profileParagraphs] } : {}),
  },
});

const suffix = (
  microSkillKey: string,
  forms: readonly string[],
  includeMeaningSort = false,
): SharedAffixProfileMappingV1 => ({
  microSkillKey,
  routeId: "dynamic_affix_word_lab",
  routeVersion: "v3",
  recipeKey: "dynamic_affix_word_lab",
  recipeVersion: "v3",
  position: "after",
  forms,
  policy: suffixPolicy(includeMeaningSort),
});

export const SHARED_AFFIX_PROFILE_REGISTRY = [
  prefix("D4_MOR_PREFIXES_UN", ["un"]),
  prefix("D4_MOR_PREFIXES_DIS_MIS", ["dis", "mis"]),
  prefix(
    "D4_MOR_PREFIXES_IN_IM_IL_IR",
    ["in", "im", "il", "ir"],
    prefixPolicy({
      split: { kind: "guided_budget_after_form_builds", guidedSlotCount: 6 },
      build: { kind: "one_per_represented_form", formOrder: ["in", "im", "il", "ir"] },
      meaning: { kind: "none" },
      legacyGuidedShape: "explicit",
    }),
    {
      title: "What is a prefix?",
      paragraphs: ["A prefix is a group of letters added to the beginning of a word. It can help to make a new word and change its meaning."],
      profileTitle: "Meet the in- prefix family",
      profileParagraphs: [
        "In this lesson, in-, im-, il- and ir- are different forms of the same prefix family. They can make a word mean not.",
        "Use im- before b, m or p; il- before l; and ir- before r. Use in- before the other letters.",
      ],
    },
  ),
  prefix("D4_MOR_PREFIXES_RE_PRE", ["re", "pre"]),
  prefix(
    "D4_MOR_PREFIXES_SUB_INTER_SUPER",
    ["sub", "inter", "super"],
    prefixPolicy({
      split: { kind: "distinct_forms_then_fill", count: 3 },
      legacyGuidedShape: "explicit",
      expectedAssignmentItemCount: 18,
    }),
  ),
  suffix("D4_MOR_SUFFIXES_NESS", ["ness"]),
  suffix("D4_MOR_SUFFIXES_ABLE_IBLE", ["able", "ible"]),
  suffix("D4_MOR_SUFFIXES_MENT", ["ment"]),
  suffix("D4_MOR_SUFFIXES_FUL_LESS", ["ful", "less"], true),
  suffix("D4_MOR_SUFFIXES_AL", ["al"]),
  suffix("D4_MOR_SUFFIXES_ITY", ["ity"]),
  suffix("D4_MOR_SUFFIXES_LY", ["ly"]),
  suffix("D4_MOR_SUFFIXES_OUS", ["ous"]),
  suffix("D4_MOR_SUFFIXES_TION", ["tion"]),
  suffix("D4_MOR_SUFFIXES_SION", ["sion"]),
] as const satisfies readonly SharedAffixProfileMappingV1[];

export type SharedAffixProductionMicroSkillKey =
  (typeof SHARED_AFFIX_PROFILE_REGISTRY)[number]["microSkillKey"];

export function getSharedAffixProfileMapping(
  microSkillKey: string,
): SharedAffixProfileMappingV1 | null {
  return SHARED_AFFIX_PROFILE_REGISTRY.find(
    (profile) => profile.microSkillKey === microSkillKey,
  ) ?? null;
}

export function validateSharedAffixProfileRegistry(): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const profile of SHARED_AFFIX_PROFILE_REGISTRY) {
    if (keys.has(profile.microSkillKey)) errors.push(`duplicate_profile:${profile.microSkillKey}`);
    keys.add(profile.microSkillKey);
    if (profile.forms.length === 0 || new Set(profile.forms).size !== profile.forms.length) {
      errors.push(`invalid_forms:${profile.microSkillKey}`);
    }
    if (profile.position === "before" && profile.routeId !== "dynamic_prefix_word_lab") {
      errors.push(`position_route_mismatch:${profile.microSkillKey}`);
    }
    if (profile.position === "after" && profile.routeId !== "dynamic_affix_word_lab") {
      errors.push(`position_route_mismatch:${profile.microSkillKey}`);
    }
  }
  return errors.sort();
}
