import type { CandidateFamilyLink, CandidateMorphology } from "./lesson-candidate";
import type { DictionarySenseSet } from "./senses";

export type CandidateAnalysisRow = {
  id: string;
  canonical_word_id: string;
  sense_id: string;
  morphology_parts: unknown;
  morphology_joins: unknown;
  word_sum: string | null;
};
export type CandidateLinkRow = CandidateFamilyLink & {
  id: string;
  canonical_word_id: string;
  sense_morphology_id?: string;
};
export type CandidateFactChoice = {
  source: "legacy" | "sense";
  morphologyId: string | null;
  morphology: CandidateMorphology | null;
  familyLinks: CandidateFamilyLink[];
  familyLinkIds: string[];
};

/** A multi-meaning word needs an explicit analysis for the selected meaning. */
export function candidateFactsForSense(input: {
  wordId: string;
  senseId: string | undefined;
  senseSet: DictionarySenseSet | null;
  legacyMorphology: (CandidateMorphology & { id: string }) | null;
  legacyLinks: readonly CandidateLinkRow[];
  senseAnalyses: readonly CandidateAnalysisRow[];
  senseLinks: readonly CandidateLinkRow[];
}): CandidateFactChoice {
  const selected = input.senseAnalyses.find(row => row.canonical_word_id === input.wordId
    && row.sense_id === input.senseId);
  if (selected) {
    const links = input.senseLinks.filter(row => row.canonical_word_id === input.wordId
      && row.sense_id === input.senseId && row.sense_morphology_id === selected.id);
    return {
      source: "sense", morphologyId: selected.id,
      morphology: { parts: selected.morphology_parts, joins: selected.morphology_joins,
        wordSum: selected.word_sum, analysisStatus: "approved",
        reviewStatus: "approved_for_first_exposure" },
      familyLinks: links, familyLinkIds: links.map(row => row.id).sort(),
    };
  }
  if ((input.senseSet?.senses.length ?? 0) > 1) return {
    source: "sense", morphologyId: null, morphology: null, familyLinks: [], familyLinkIds: [],
  };
  const links = input.legacyLinks.filter(row => row.canonical_word_id === input.wordId
    && row.sense_id === input.senseId);
  return {
    source: "legacy", morphologyId: input.legacyMorphology?.id ?? null,
    morphology: input.legacyMorphology,
    familyLinks: links, familyLinkIds: links.map(row => row.id).sort(),
  };
}
