import { UN_PREFIX_SKILL } from "./prefix-content";
import { ingReviewEnvironment } from "./ing-staging-scope";

export const DIS_MIS_PREFIX_SKILL = "D4_MOR_PREFIXES_DIS_MIS";
export const RE_PRE_PREFIX_SKILL = "D4_MOR_PREFIXES_RE_PRE";
export const NEGATIVE_PREFIX_SKILL = "D4_MOR_PREFIXES_IN_IM_IL_IR";
export const SUB_INTER_SUPER_PREFIX_SKILL = "D4_MOR_PREFIXES_SUB_INTER_SUPER";
export const PREFIX_WORKBOOK_ROUTE = "dynamic_prefix_word_lab";
export const PREFIX_PUBLISH_BATCH_SIZE = 30;
export const IN_PREFIX_FORMS = ["in", "im", "il", "ir"] as const;
export const IN_PREFIX_MEANINGS = [
  { id: "not", label: "not", gloss: "not" },
  { id: "in_or_upon", label: "in or upon", gloss: "in or upon" },
  { id: "make", label: "make", gloss: "make" },
] as const;

type PrefixWorkbookChoice = { id: string; label: string; prefix: string; gloss: string };

export const prefixWorkbooks = {
  [UN_PREFIX_SKILL]: {
    title: "Prefix un-",
    source: "Reviewed un- Bulk review",
    choices: [
      { id: "not", label: "Not", prefix: "un", gloss: "not" },
      { id: "reverse", label: "Reverse", prefix: "un", gloss: "reverse" },
    ],
  },
  [DIS_MIS_PREFIX_SKILL]: {
    title: "Prefixes dis- and mis-",
    source: "Reviewed dis- and mis- Bulk review",
    choices: [
      { id: "not_or_opposite", label: "Not or opposite", prefix: "dis", gloss: "not or opposite" },
      { id: "wrongly_or_badly", label: "Wrongly or badly", prefix: "mis", gloss: "wrongly or badly" },
    ],
  },
  [RE_PRE_PREFIX_SKILL]: {
    title: "Prefixes re- and pre-",
    source: "Reviewed re- and pre- Bulk review",
    choices: [
      { id: "again_back", label: "Again or back", prefix: "re", gloss: "again or back" },
      { id: "before", label: "Before", prefix: "pre", gloss: "before" },
    ],
  },
  [NEGATIVE_PREFIX_SKILL]: {
    title: "Prefixes in-, im-, il- and ir-",
    source: "Reviewed in-, im-, il- and ir- Bulk review",
    choices: [
      ...IN_PREFIX_MEANINGS.map(meaning => ({ ...meaning, prefix: "in" })),
    ],
  },
  [SUB_INTER_SUPER_PREFIX_SKILL]: {
    title: "Prefixes sub-, inter- and super-",
    source: "Reviewed sub-, inter- and super- Bulk review",
    choices: [
      { id: "under", label: "Under", prefix: "sub", gloss: "under" },
      { id: "between", label: "Between", prefix: "inter", gloss: "between" },
      { id: "above_beyond", label: "Above or beyond", prefix: "super", gloss: "above or beyond" },
    ],
  },
} satisfies Record<string, { title: string; source: string; choices: PrefixWorkbookChoice[] }>;

export type PrefixWorkbookSkill = keyof typeof prefixWorkbooks;

export function isPrefixWorkbookSkill(skill: unknown): skill is PrefixWorkbookSkill {
  return typeof skill === "string" && Object.hasOwn(prefixWorkbooks, skill);
}

export function prefixWorkbookEnabled(skill: unknown): skill is PrefixWorkbookSkill {
  return ingReviewEnvironment() !== null && isPrefixWorkbookSkill(skill);
}

export function prefixWorkbookFieldLabel(skill: string) {
  return isPrefixWorkbookSkill(skill) ? "Prefix meaning group" : "Meaning group";
}

export function prefixWorkbookForms(skill: PrefixWorkbookSkill): readonly string[] {
  return skill === NEGATIVE_PREFIX_SKILL ? IN_PREFIX_FORMS : [...new Set(prefixWorkbooks[skill].choices.map(choice => choice.prefix))];
}

/** Spelling is independent of meaning. Historical form-only sheets may infer
 * only a reviewed gloss; an empty/unknown gloss needs an editorial choice. */
export function inPrefixMeaning(value: unknown) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return IN_PREFIX_MEANINGS.find(choice => choice.id === text || choice.label === text);
}

export function prefixMeaningFromParts(parts: readonly unknown[]) {
  const prefix = parts.find(part => part && typeof part === "object" && "kind" in part && part.kind === "prefix");
  return prefix && typeof prefix === "object" && "gloss" in prefix ? inPrefixMeaning(prefix.gloss) : undefined;
}

export function negativePrefixForBase(base: string) {
  const initial = base[0]?.toLowerCase();
  if (initial === "l") return "il";
  if (initial === "r") return "ir";
  if (initial === "b" || initial === "m" || initial === "p") return "im";
  return "in";
}

export function prefixWorkbookChoice(skill: PrefixWorkbookSkill, meaning: unknown) {
  return prefixWorkbooks[skill].choices.find(choice => choice.id === meaning);
}
