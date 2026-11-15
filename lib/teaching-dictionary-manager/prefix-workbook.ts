import { UN_PREFIX_SKILL } from "./prefix-content";
import { ingReviewEnvironment } from "./ing-staging-scope";

export const DIS_MIS_PREFIX_SKILL = "D4_MOR_PREFIXES_DIS_MIS";
export const RE_PRE_PREFIX_SKILL = "D4_MOR_PREFIXES_RE_PRE";
export const PREFIX_WORKBOOK_ROUTE = "dynamic_prefix_word_lab";
export const PREFIX_PUBLISH_BATCH_SIZE = 30;

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
} satisfies Record<string, { title: string; source: string; choices: PrefixWorkbookChoice[] }>;

export type PrefixWorkbookSkill = keyof typeof prefixWorkbooks;

export function isPrefixWorkbookSkill(skill: unknown): skill is PrefixWorkbookSkill {
  return typeof skill === "string" && Object.hasOwn(prefixWorkbooks, skill);
}

export function prefixWorkbookEnabled(skill: unknown): skill is PrefixWorkbookSkill {
  const environment = ingReviewEnvironment();
  return isPrefixWorkbookSkill(skill) &&
    (environment === "staging" || (environment === "production" && skill !== RE_PRE_PREFIX_SKILL));
}

export function prefixWorkbookChoice(skill: PrefixWorkbookSkill, meaning: unknown) {
  return prefixWorkbooks[skill].choices.find(choice => choice.id === meaning);
}
