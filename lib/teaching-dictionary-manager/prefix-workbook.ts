import { UN_PREFIX_SKILL } from "./prefix-content";
import { ingReviewEnvironment } from "./ing-staging-scope";

export const DIS_MIS_PREFIX_SKILL = "D4_MOR_PREFIXES_DIS_MIS";
export const RE_PRE_PREFIX_SKILL = "D4_MOR_PREFIXES_RE_PRE";
export const NEGATIVE_PREFIX_SKILL = "D4_MOR_PREFIXES_IN_IM_IL_IR";
export const SUB_INTER_SUPER_PREFIX_SKILL = "D4_MOR_PREFIXES_SUB_INTER_SUPER";
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
  [NEGATIVE_PREFIX_SKILL]: {
    title: "Negative prefixes in-, im-, il- and ir-",
    source: "Reviewed in-, im-, il- and ir- Bulk review",
    choices: [
      { id: "in", label: "in-", prefix: "in", gloss: "not" },
      { id: "im", label: "im-", prefix: "im", gloss: "not" },
      { id: "il", label: "il-", prefix: "il", gloss: "not" },
      { id: "ir", label: "ir-", prefix: "ir", gloss: "not" },
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
  const environment = ingReviewEnvironment();
  return isPrefixWorkbookSkill(skill) &&
    (environment === "staging" || (environment === "production" && skill !== SUB_INTER_SUPER_PREFIX_SKILL));
}

export function prefixWorkbookFieldLabel(skill: string) {
  return skill === NEGATIVE_PREFIX_SKILL ? "Prefix form" : "Prefix meaning group";
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
