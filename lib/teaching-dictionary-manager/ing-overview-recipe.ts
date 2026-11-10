import { ING_RULE_FOR_SKILL, ingWordBlockers, type IngDictionaryWordV1,
  type IngMicroSkill } from "@/lib/adle/ing/contracts";
import { evaluateLessonCandidate, type CandidateInput, type CandidateIssue } from "./lesson-candidate";

export type GeneratedIngWord = Omit<IngDictionaryWordV1,
  "reviewerRef" | "approvalRef" | "rowStatus" | "reviewStatus"> & {
    senseId: string; pronunciationId: string; pronunciationIpa: string;
  };
export type IngRecipeResult =
  | { status: "ready"; word: GeneratedIngWord; issues: [] }
  | { status: "needs_facts" | "not_match"; word: null; issues: CandidateIssue[] };

/** A current reviewed word–sense–skill approval supplies the release identity. */
export function approvedGeneratedIngWord(input: {
  generated: GeneratedIngWord; reviewerRef: string; approvalRef: string;
}): IngDictionaryWordV1 | null {
  if (!input.reviewerRef.trim() || !input.approvalRef.trim()) return null;
  const word: IngDictionaryWordV1 = { ...input.generated, rowStatus: "active",
    reviewStatus: "approved_for_first_exposure", reviewerRef: input.reviewerRef,
    approvalRef: input.approvalRef };
  return ingWordBlockers(word).length ? null : word;
}

/** Build lesson content from one selected, reviewed Overview meaning. The
 * approval and release references are attached only by the governed release. */
export function generateIngWordFromOverview(input: CandidateInput & {
  provenance: { sourceName: string | null; sourceUrl: string | null };
}): IngRecipeResult {
  const decision = evaluateLessonCandidate(input);
  if (!(input.skillKey in ING_RULE_FOR_SKILL)) return {
    status: "not_match", word: null, issues: [],
  };
  if (decision.status !== "ready") return { status: decision.status === "not_match"
    ? "not_match" : "needs_facts", word: null, issues: decision.issues };
  const href = `/admin/teaching-dictionary/${input.wordId}`;
  const issues: CandidateIssue[] = [];
  const sense = input.senseSet?.senses.find(item => item.id === input.senseId);
  const sentence = sense?.dictationSentence?.trim() ?? "";
  if (!sentence || !Number.isInteger(sense?.dictationTargetTokenIndex)) issues.push({
    code: "LESSON_SENTENCE", message: "Add a reviewed sentence and target position for this meaning.",
    href: `${href}#td-definition`,
  });
  const source = input.provenance.sourceUrl?.trim() || input.provenance.sourceName?.trim() || "";
  if (!source) issues.push({ code: "LESSON_SOURCE", message: "Add reviewed Overview provenance.",
    href: `${href}#td-source` });
  const parts = Array.isArray(input.morphology?.parts) ? input.morphology.parts as Record<string, unknown>[] : [];
  const link = input.familyLinks.find(item => item.sense_id === input.senseId
    && item.relationship_kind === "regular_inflection");
  const base = parts.find(part => part.kind === "base" && part.id === link?.component_part_id);
  if (!base) issues.push({ code: "LESSON_BASE", message: "Choose the reviewed free-base family part.",
    href: `${href}#td-base-family` });
  const pronunciation = input.senseSet?.pronunciations.find(item => item.id === sense?.pronunciationId);
  if (!pronunciation?.ipa.trim())
    issues.push({ code: "LESSON_PRONUNCIATION", message: "Review this meaning's pronunciation.",
      href: `${href}#td-pronunciation` });
  if (issues.length || !sense || !base) return { status: "needs_facts", word: null, issues };
  const word: GeneratedIngWord = {
    canonicalWordId: input.wordId, microSkillKey: input.skillKey as IngMicroSkill,
    senseId: sense.id, pronunciationId: sense.pronunciationId!, pronunciationIpa: pronunciation!.ipa,
    base: String(base.sourceText).toLocaleLowerCase("en-GB"),
    word: input.displayWord.toLocaleLowerCase("en-GB"), meaning: sense.definition,
    dictationSentence: sentence, audioText: sentence, sourceRefs: [source],
  };
  const blockers = ingWordBlockers({ ...word, rowStatus: "active",
    reviewStatus: "approved_for_first_exposure", reviewerRef: "Overview recipe preview",
    approvalRef: "Overview recipe preview" }, true);
  if (blockers.length) return { status: "needs_facts", word: null,
    issues: blockers.map(code => ({ code: `ING_${code.toUpperCase()}`,
      message: code === "content_missing" ? "Use the word exactly once in its reviewed sentence."
        : `Review the -ing lesson fact: ${code.replaceAll("_", " ")}.`,
      href: `${href}#${code === "content_missing" ? "td-definition" : "td-canonical-parts"}` })) };
  return { status: "ready", word, issues: [] };
}
