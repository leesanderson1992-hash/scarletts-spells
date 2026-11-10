import { ING_RULE_FOR_SKILL, ingStem, type IngMicroSkill } from "@/lib/adle/ing/contracts";
import { bulkSenseChoiceError } from "./bulk-sense-approval";
import type { DictionarySenseSet } from "./senses";

export const LESSON_CANDIDATE_RULE_REVISION = "reviewed_overview_candidate_v1";
export type CandidateIssue = { code: string; message: string; href: string };
export type CandidateDecision = {
  status: "not_match" | "needs_facts" | "ready" | "legacy_review";
  ruleRevision: string;
  evidence: string[];
  issues: CandidateIssue[];
};
export type CandidateMorphology = {
  analysisStatus: string;
  reviewStatus: string;
  parts: unknown;
  joins: unknown;
  wordSum: string | null;
};
export type CandidateFamilyLink = { sense_id: string; family_key: string; component_part_id: string;
  relationship_kind: string };
export type CandidateInput = {
  wordId: string;
  displayWord: string;
  skillKey: string;
  senseId: string | undefined;
  senseSet: DictionarySenseSet | null;
  morphology: CandidateMorphology | null;
  familyLinks: readonly CandidateFamilyLink[];
};

const ingKeys = new Set(Object.keys(ING_RULE_FOR_SKILL));
const ableKey = "D4_MOR_SUFFIXES_ABLE_IBLE";
export const hasCandidateRule = (skillKey: string) => ingKeys.has(skillKey) || skillKey === ableKey;

/** Rules are evaluated from approved facts. A skill choice is never evidence by itself. */
export function evaluateLessonCandidate(input: CandidateInput): CandidateDecision {
  const href = `/admin/teaching-dictionary/${input.wordId}`;
  const issues: CandidateIssue[] = [];
  const evidence: string[] = [];
  const add = (code: string, message: string, fragment: string) =>
    issues.push({ code, message, href: `${href}#${fragment}` });
  const rawParts = Array.isArray(input.morphology?.parts) ? input.morphology.parts : [];
  const parts = rawParts.filter((part): part is Record<string, unknown> =>
    Boolean(part && typeof part === "object" && !Array.isArray(part)));
  const done = (status: CandidateDecision["status"]): CandidateDecision => ({
    status, ruleRevision: LESSON_CANDIDATE_RULE_REVISION, evidence, issues,
  });
  if (!hasCandidateRule(input.skillKey)) return done("legacy_review");
  const spelling = input.displayWord.toLocaleLowerCase("en-GB");
  if (ingKeys.has(input.skillKey) && !spelling.endsWith("ing")) return done("not_match");
  if (input.skillKey === ableKey && !/(?:able|ible)$/u.test(spelling)) return done("not_match");
  const senseIssue = bulkSenseChoiceError({ wordId: input.wordId, displayWord: input.displayWord,
    senseSet: input.senseSet, senseId: input.senseId });
  if (senseIssue) add("SENSE_FACTS", senseIssue, "td-definition");
  if (!input.morphology || input.morphology.analysisStatus !== "approved"
    || input.morphology.reviewStatus !== "approved_for_first_exposure"
    || !input.morphology.wordSum?.trim() || !Array.isArray(input.morphology.joins)
    || input.morphology.joins.length !== parts.length - 1
    || !parts.length || parts.some(part => !["base", "root", "prefix", "suffix"].includes(String(part.kind))
      || !String(part.sourceText ?? "").trim() || !String(part.surfaceText ?? "").trim())
    || parts.map(part => part.surfaceText).join("").toLocaleLowerCase("en-GB") !== spelling) {
    add("REVIEWED_PARTS", "Approve typed parts and joins that spell this word.", "td-canonical-parts");
    return done("needs_facts");
  }
  const suffix = parts.at(-1);
  const suffixSource = String(suffix?.sourceText ?? "").toLocaleLowerCase("en-GB");
  if (suffix?.kind !== "suffix" || (ingKeys.has(input.skillKey) ? suffixSource !== "ing"
    : !["able", "ible"].includes(suffixSource))) {
    add("SUFFIX_PART", `Review the ${ingKeys.has(input.skillKey) ? "-ing" : "-able/-ible"} suffix part.`, "td-canonical-parts");
  } else if (!String(suffix.gloss ?? "").trim()) {
    add("SUFFIX_MEANING", "Choose the reviewed meaning of this suffix.", "td-canonical-parts");
  } else evidence.push(`${suffixSource}: ${String(suffix.gloss)}`);
  const bases = parts.filter(part => part.kind === "base");
  const links = input.familyLinks.filter(row => row.sense_id === input.senseId);
  const expectedRelationship = ingKeys.has(input.skillKey) ? "regular_inflection" : "derived";
  const base = bases.find(part => links.some(link => link.component_part_id === part.id
    && link.relationship_kind === expectedRelationship));
  if (input.skillKey === ableKey && !bases.length && parts.some(part => part.kind === "root"))
    return done("not_match");
  if (!base) add("FAMILY_LINK", `Review a ${expectedRelationship.replaceAll("_", " ")} link to this meaning's free-base family.`, "td-base-family");
  else evidence.push(`Base ${String(base.sourceText)} linked to a reviewed family`);
  if (ingKeys.has(input.skillKey) && base) {
    const baseText = String(base.sourceText).toLocaleLowerCase("en-GB");
    const rule = ING_RULE_FOR_SKILL[input.skillKey as IngMicroSkill];
    const expected = `${ingStem(baseText, rule)}ing`;
    if (expected !== spelling) return done("not_match");
    if (rule === "drop_e" && (!baseText.endsWith("e") || baseText.endsWith("ie")))
      return done("not_match");
    if (rule === "ie_to_y" && !baseText.endsWith("ie")) return done("not_match");
    if (rule === "double_final_consonant" && !/[aeiou][b-df-hj-np-tv-z]$/.test(baseText))
      return done("not_match");
    evidence.push(`${String(base.sourceText)} + ing → ${spelling}`);
  }
  if (input.skillKey === ableKey && suffix && suffixSource !== spelling.slice(-suffixSource.length))
    return done("not_match");
  return done(issues.length ? "needs_facts" : "ready");
}
