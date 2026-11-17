import { COMPOUND_WORD_MICRO_SKILL_KEYS, type CompoundWordMicroSkillKey } from "@/lib/adle/morphology/compound-word-structure-v2";

export const COMPOUND_WORKBOOK_ROUTE = "compound_word_lab";
export const isCompoundWorkbookSkill = (value: unknown): value is CompoundWordMicroSkillKey =>
  COMPOUND_WORD_MICRO_SKILL_KEYS.some(skill => skill === value);
export const compoundWorkbookTitle = (skill: CompoundWordMicroSkillKey) =>
  skill.endsWith("CLOSED_COMPOUNDS") ? "Closed compound words" : "Separated and hyphenated compound words";
export const compoundWorkbookSource = (skill: CompoundWordMicroSkillKey) => `Reviewed compound workbook: ${skill}`;
export type CompoundWorkbookFacts = { componentToWholeRelationship: string };
