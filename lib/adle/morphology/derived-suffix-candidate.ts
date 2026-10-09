import { extractAuthoredTargetToken } from "./payload";
import type { DynamicAffixProfile, DynamicAffixWord } from "./affix-word-lab";
import { getSharedAffixProfileMapping } from "./shared-affix-profile-registry";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export type ReviewedSuffixCandidateFacts = {
  word: {
    id: string; displayWord: string; sourceRowHash: string;
    ageBand: string | null; frequencyBand: string | null; complexityBand: string | null;
    rowStatus: string; reviewStatus: string;
  };
  morphology: {
    id: string; parts: unknown; joins: unknown; wordSum: string | null;
    analysisStatus: string; reviewStatus: string; sourceRowHash: string;
    sourceName: string | null;
  } | null;
  metadata: {
    syllables: string | null; phonemeHint: string | null;
    stressPattern: string | null; hasSchwa: boolean | null;
    rowStatus: string; reviewStatus: string;
  } | null;
  dictation: {
    id: string; sourceRowHash: string; sentence: string;
    targetTokenIndex: number; audioText: string;
    rowStatus: string; reviewStatus: string;
  } | null;
  definition: string | null;
};

export type DerivedSuffixCandidate = {
  word: DynamicAffixWord | null;
  blockers: readonly string[];
};

/**
 * A deliberately narrow first derivation: direct, reviewed two-part suffix
 * analyses only. It never guesses morphology, a semantic base, or a meaning
 * category from letters or free-text notes. More complex words remain editable
 * through reviewed teaching facts.
 */
export function deriveReviewedSuffixCandidate(
  profile: Pick<DynamicAffixProfile, "microSkillKey" | "meaningBins" | "position">,
  facts: ReviewedSuffixCandidateFacts,
): DerivedSuffixCandidate {
  const blockers: string[] = [];
  const mapping = getSharedAffixProfileMapping(profile.microSkillKey);
  if (!mapping || mapping.position !== "after" || profile.position !== "after") {
    blockers.push("profile_not_suffix_route");
  }
  if (facts.word.rowStatus !== "active" || facts.word.reviewStatus !== "approved_for_first_exposure") {
    blockers.push("word_not_reviewed");
  }
  const morphology = facts.morphology;
  if (!morphology || morphology.analysisStatus !== "approved"
    || morphology.reviewStatus !== "approved_for_first_exposure"
    || !nonempty(morphology.wordSum)) blockers.push("morphology_not_reviewed");
  const metadata = facts.metadata;
  if (!metadata || metadata.rowStatus !== "active"
    || metadata.reviewStatus !== "approved_for_first_exposure"
    || !nonempty(metadata.syllables) || !nonempty(metadata.phonemeHint)
    || !nonempty(metadata.stressPattern) || typeof metadata.hasSchwa !== "boolean"
    || !nonempty(facts.word.ageBand) || !nonempty(facts.word.frequencyBand)
    || !nonempty(facts.word.complexityBand)) blockers.push("word_banding_incomplete");
  const dictation = facts.dictation;
  if (!dictation || dictation.rowStatus !== "active"
    || dictation.reviewStatus !== "approved_for_first_exposure"
    || !nonempty(dictation.sentence) || dictation.audioText !== dictation.sentence
    || extractAuthoredTargetToken(dictation.sentence, dictation.targetTokenIndex) !== facts.word.displayWord) {
    blockers.push("dictation_not_reviewed");
  }
  if (!nonempty(facts.definition)) blockers.push("meaning_not_reviewed");
  if (profile.meaningBins.length !== 1) blockers.push("meaning_group_ambiguous");

  const rawParts = Array.isArray(morphology?.parts) ? morphology.parts : [];
  if (rawParts.length !== 2 || !rawParts.every(record)) blockers.push("two_part_analysis_required");
  const first = record(rawParts[0]) ? rawParts[0] : {};
  const last = record(rawParts[1]) ? rawParts[1] : {};
  const rawFirstRole = first.kind ?? first.role ?? first.type ?? first.partType;
  const firstRole = rawFirstRole === "free_base" || rawFirstRole === "bound_base" ? "base"
    : rawFirstRole === "bound_root" ? "root" : rawFirstRole;
  const suffixRole = last.kind ?? last.role ?? last.type ?? last.partType;
  const baseSurface = first.surfaceText ?? first.text;
  const suffixSurface = last.surfaceText ?? last.text;
  const baseSource = first.sourceText ?? baseSurface;
  const suffixSource = last.sourceText ?? suffixSurface;
  const baseGloss = first.gloss ?? first.meaning;
  if ((firstRole !== "base" && firstRole !== "root") || suffixRole !== "suffix"
    || !nonempty(baseSurface) || !nonempty(suffixSurface)
    || !nonempty(baseSource) || !nonempty(suffixSource)
    || !mapping?.forms.includes(suffixSurface)
    || `${baseSurface}${suffixSurface}` !== facts.word.displayWord
    || baseSource !== baseSurface || suffixSource !== suffixSurface) {
    blockers.push("direct_suffix_reconstruction_failed");
  }
  if (!nonempty(baseGloss)) blockers.push("base_meaning_missing");
  if (!morphology || !nonempty(morphology.id)
    || !/^[a-f0-9]{64}$/.test(morphology.sourceRowHash)
    || !/^[a-f0-9]{64}$/.test(facts.word.sourceRowHash)
    || !dictation || !/^[a-f0-9]{64}$/.test(dictation.sourceRowHash)) {
    blockers.push("immutable_source_missing");
  }
  if (blockers.length) return { word: null, blockers };

  const base = baseSurface as string;
  const suffix = suffixSurface as string;
  const part1 = { id: "part_1", text: base, sourceText: base, role: firstRole as "base" | "root",
    gloss: baseGloss as string, start: 0, end: base.length };
  const part2 = { id: "part_2", text: suffix, sourceText: suffix, role: "suffix" as const,
    start: base.length, end: facts.word.displayWord.length };
  const join = { afterPartId: "part_1", beforePartId: "part_2", joinType: "none" as const };
  return {
    blockers: [],
    word: {
      canonicalWordId: facts.word.id,
      displayWord: facts.word.displayWord,
      audioText: dictation!.audioText,
      semanticBaseText: base,
      semanticBaseKind: firstRole as "base" | "root",
      teachingBaseText: base,
      baseMeaning: baseGloss as string,
      derivedMeaning: facts.definition as string,
      effect: profile.meaningBins[0]!.id,
      affixVariant: suffix,
      parts: [part1, part2],
      joins: [join],
      splitPoints: [base.length],
      dictationSentence: dictation!.sentence,
      dictationTargetTokenIndex: dictation!.targetTokenIndex,
      trueMorphology: {
        parts: [part1, part2], joins: [join], transformations: [],
        notes: "Reviewed direct suffix analysis; no spelling transformation.",
        provenance: { sourceRowHash: morphology!.sourceRowHash,
          sourceName: morphology!.sourceName ?? "reviewed canonical morphology",
          derivationRuleVersion: "reviewed_direct_suffix_v1" },
      },
      approvedTransfer: true,
      governance: {
        sourceKind: "reviewed_morphology",
        memberId: morphology!.id,
        memberSourceRowHash: morphology!.sourceRowHash,
        dictionaryWordSourceRowHash: facts.word.sourceRowHash,
        dictationId: dictation!.id,
        dictationSourceRowHash: dictation!.sourceRowHash,
      },
    },
  };
}
