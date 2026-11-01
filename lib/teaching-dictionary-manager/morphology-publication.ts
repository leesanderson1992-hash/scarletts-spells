import { isDeepStrictEqual } from "node:util";
import type { WordDraftPayload } from "./contracts";

type ActiveMorphology = {
  raw_morpholex_segmentation: string | null;
  raw_morpholex_pos: string | null;
  morphology_parts: unknown;
  feature_keys: unknown;
  morphology_joins: unknown;
  morphology_transformations: unknown;
  transformation_notes: string | null;
  word_sum: string | null;
  analysis_status: string;
  review_notes: string | null;
};

/** Historical shapes may be republished only when the morphology is
 * identical to the active row. New or edited morphology must use the
 * canonical parts format. This mirrors the publication RPC's morphology fields. */
export function changesMorphologyForPublication(
  morphology: WordDraftPayload["canonicalMorphology"],
  active: ActiveMorphology | null,
): boolean {
  if (!active) return true;
  const sameText = (left: string, right: string | null) => left === (right ?? "");
  return !sameText(morphology.rawSegmentation, active.raw_morpholex_segmentation)
    || !sameText(morphology.rawPartOfSpeech, active.raw_morpholex_pos)
    || !isDeepStrictEqual(morphology.parts, active.morphology_parts)
    || !isDeepStrictEqual(morphology.featureKeys, active.feature_keys)
    || !isDeepStrictEqual(morphology.joins, active.morphology_joins)
    || (morphology.transformations !== undefined &&
      !isDeepStrictEqual(morphology.transformations, active.morphology_transformations))
    || !sameText(morphology.transformationNotes, active.transformation_notes)
    || !sameText(morphology.wordSum, active.word_sum)
    || morphology.analysisStatus !== active.analysis_status
    || !sameText(morphology.reviewNotes, active.review_notes);
}
