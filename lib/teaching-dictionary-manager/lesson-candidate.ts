import { ING_RULE_FOR_SKILL, ingStem, type IngDoublingPattern, type IngMicroSkill } from "@/lib/adle/ing/contracts";
import { SHARED_AFFIX_PROFILE_REGISTRY } from "@/lib/adle/morphology/shared-affix-profile-registry";
import { generatedWordSum } from "./authoring";
import { bulkSenseChoiceError } from "./bulk-sense-approval";
import { auditCanonicalMorphology } from "./canonical-morphology";
import type { DictionaryPronunciation, DictionarySenseSet } from "./senses";

export const LESSON_CANDIDATE_RULE_REVISION = "reviewed_overview_candidate_v4";
export type CandidateIssue = { code: string; message: string; href: string };
export type CandidateDecision = {
  status: "not_match" | "needs_facts" | "ready" | "legacy_review";
  ruleRevision: string;
  evidence: string[];
  doublingPattern?: IngDoublingPattern;
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
const suffixForms: Record<string, readonly string[]> = Object.fromEntries(
  SHARED_AFFIX_PROFILE_REGISTRY.filter(profile => profile.position === "after")
    .map(profile => [profile.microSkillKey, profile.forms]));
const prefixForms: Record<string, readonly string[]> = Object.fromEntries(
  SHARED_AFFIX_PROFILE_REGISTRY.filter(profile => profile.position === "before")
    .map(profile => [profile.microSkillKey, profile.forms]));
const assimilatedInKey = "D4_MOR_PREFIXES_IN_IM_IL_IR";
function expectedInForm(base: string): "in" | "im" | "il" | "ir" {
  if (/^[bmp]/u.test(base)) return "im";
  if (base.startsWith("l")) return "il";
  if (base.startsWith("r")) return "ir";
  return "in";
}
export const hasCandidateRule = (skillKey: string) => ingKeys.has(skillKey)
  || Object.hasOwn(suffixForms, skillKey) || Object.hasOwn(prefixForms, skillKey);

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
  let doublingPattern: IngDoublingPattern | undefined;
  const done = (status: CandidateDecision["status"]): CandidateDecision => ({
    status, ruleRevision: LESSON_CANDIDATE_RULE_REVISION, evidence, issues,
    ...(doublingPattern ? { doublingPattern } : {}),
  });
  if (!hasCandidateRule(input.skillKey)) return done("legacy_review");
  const spelling = input.displayWord.toLocaleLowerCase("en-GB");
  if (ingKeys.has(input.skillKey) && !spelling.endsWith("ing")) return done("not_match");
  const acceptedSuffixes = suffixForms[input.skillKey];
  const acceptedPrefixes = prefixForms[input.skillKey];
  if (acceptedSuffixes && !acceptedSuffixes.some(form => spelling.endsWith(form))) return done("not_match");
  if (acceptedPrefixes && !acceptedPrefixes.some(form => spelling.startsWith(form))) return done("not_match");
  const senseIssue = bulkSenseChoiceError({ wordId: input.wordId, displayWord: input.displayWord,
    senseSet: input.senseSet, senseId: input.senseId });
  if (senseIssue) add("SENSE_FACTS", senseIssue, "td-definition");
  const selectedSense = input.senseSet?.senses.find(sense => sense.id === input.senseId);
  if (ingKeys.has(input.skillKey) && selectedSense && selectedSense.partOfSpeech !== "verb")
    return done("not_match");
  const morphologyAudit = input.morphology ? auditCanonicalMorphology({ parts: input.morphology.parts,
    joins: input.morphology.joins, displayWord: input.displayWord,
    linkedToFamily: input.familyLinks.length > 0 }) : null;
  if (!input.morphology || input.morphology.analysisStatus !== "approved"
    || input.morphology.reviewStatus !== "approved_for_first_exposure"
    || morphologyAudit?.status !== "canonical"
    || input.morphology.wordSum?.trim() !== generatedWordSum(parts, input.displayWord)) {
    const affix = acceptedPrefixes ? parts[0] : parts.at(-1);
    if (morphologyAudit?.reason === "unreviewed_part_fact" && affix?.kind === (acceptedPrefixes ? "prefix" : "suffix")
      && !String(affix.gloss ?? "").trim())
      add(acceptedPrefixes ? "PREFIX_MEANING" : "SUFFIX_MEANING",
        `Choose the reviewed meaning of this ${acceptedPrefixes ? "prefix" : "suffix"}.`, "td-canonical-parts");
    else add("REVIEWED_PARTS", "Approve typed parts and joins that spell this word.", "td-canonical-parts");
    return done("needs_facts");
  }
  const suffix = acceptedPrefixes ? undefined : parts.at(-1);
  const suffixSource = String(suffix?.sourceText ?? "").toLocaleLowerCase("en-GB");
  if (acceptedPrefixes) {
    const prefix = parts[0];
    const prefixSource = String(prefix?.sourceText ?? "").toLocaleLowerCase("en-GB");
    if (prefix?.kind !== "prefix" || !acceptedPrefixes.includes(prefixSource))
      add("PREFIX_PART", `Review the ${acceptedPrefixes.map(form => `${form}-`).join("/")} prefix part.`, "td-canonical-parts");
    else if (!String(prefix.gloss ?? "").trim())
      add("PREFIX_MEANING", "Choose the reviewed meaning of this prefix.", "td-canonical-parts");
    else evidence.push(`${prefixSource}: ${String(prefix.gloss)}`);
    if (prefix?.kind === "prefix" && acceptedPrefixes.includes(prefixSource)) {
      const visiblePrefix = String(prefix.surfaceText).toLocaleLowerCase("en-GB");
      if (!acceptedPrefixes.includes(visiblePrefix) || !spelling.startsWith(visiblePrefix))
        return done("not_match");
      if (input.skillKey === assimilatedInKey) {
        const baseSource = String(parts.find(part => part.kind === "base")?.sourceText ?? "")
          .toLocaleLowerCase("en-GB");
        if (!baseSource || visiblePrefix !== expectedInForm(baseSource)
          || (prefixSource !== "in" && prefixSource !== visiblePrefix)) return done("not_match");
      } else if (visiblePrefix !== prefixSource) return done("not_match");
    }
  } else if (suffix?.kind !== "suffix" || (ingKeys.has(input.skillKey) ? suffixSource !== "ing"
    : !acceptedSuffixes?.includes(suffixSource))) {
    const label = ingKeys.has(input.skillKey) ? "-ing" : acceptedSuffixes?.map(form => `-${form}`).join("/");
    add("SUFFIX_PART", `Review the ${label} suffix part.`, "td-canonical-parts");
  } else if (!String(suffix.gloss ?? "").trim()) {
    add("SUFFIX_MEANING", "Choose the reviewed meaning of this suffix.", "td-canonical-parts");
  } else evidence.push(`${suffixSource}: ${String(suffix.gloss)}`);
  const bases = parts.filter(part => part.kind === "base");
  const links = input.familyLinks.filter(row => row.sense_id === input.senseId);
  const expectedRelationship = ingKeys.has(input.skillKey) ? "regular_inflection" : "derived";
  const base = bases.find(part => links.some(link => link.component_part_id === part.id
    && link.relationship_kind === expectedRelationship));
  if ((acceptedSuffixes || acceptedPrefixes) && !bases.length && parts.some(part => part.kind === "root"))
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
    if (rule === "double_final_consonant") {
      if (!/[aeiou][b-df-hj-np-tv-z]$/.test(baseText)) return done("not_match");
      const pronunciation = input.senseSet?.pronunciations.find(item => item.id === selectedSense?.pronunciationId);
      doublingPattern = reviewedDoublingPattern(baseText, pronunciation);
      if (!doublingPattern) add("DOUBLING_STRESS",
        "Check the reviewed stress. The -ing syllable must be unstressed and the syllable before it must have primary stress.",
        "td-pronunciation");
    }
    evidence.push(`${String(base.sourceText)} + ing → ${spelling}`);
  }
  if (acceptedSuffixes && suffix && suffixSource !== spelling.slice(-suffixSource.length))
    return done("not_match");
  return done(issues.length ? "needs_facts" : "ready");
}


function reviewedDoublingPattern(base: string, pronunciation: DictionaryPronunciation | undefined): IngDoublingPattern | undefined {
  // In these regular inflections, syllabic -ing adds an unstressed syllable
  // and preserves the base stress. The preceding syllable is the base's last.
  const stress = pronunciation?.stressPattern.split("-") ?? [];
  if (stress.length !== pronunciation?.spokenSyllableCount
    || stress.at(-1) !== "unstressed" || stress.at(-2) !== "primary") return undefined;
  if (stress.length === 2 && base.length <= 4 && (base.match(/[aeiou]/g) ?? []).length === 1) return "short_cvc";
  if (stress.length >= 3 && base.length > 4) return "stressed_final_syllable";
  return undefined;
}
