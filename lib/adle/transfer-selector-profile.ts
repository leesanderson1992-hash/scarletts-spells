/** Review-gated transfer selection for a pattern lesson.
 * The authentic word is supplied by the approved correction; this selector
 * never diagnoses a word or creates a word-to-skill link. */
export type TransferSelectorProfile = {
  microSkillKey: string; selectorKind: "affix" | "base_word_family";
  featureType: "prefix" | "suffix" | "base" | "root"; featureKey: string;
  permittedTransformations: readonly string[]; requiredTransferWords: number;
  allowedAgeBands: readonly string[]; rowStatus: "draft" | "active" | "retired";
  reviewStatus: string;
};
export type ReviewedWordMorphology = {
  canonicalWordId: string; featureKeys: readonly string[]; transformations: readonly string[];
  analysisStatus: "approved" | "not_applicable" | "rejected" | "in_review";
  rowStatus: "draft" | "active" | "retired"; reviewStatus: string;
};

export function selectTransferWords(params: {
  profile: TransferSelectorProfile | undefined; morphology: readonly ReviewedWordMorphology[];
  excludedCanonicalWordIds: ReadonlySet<string>; childAgeBand: string; take: number;
}): { ok: true; canonicalWordIds: string[] } | { ok: false; reason: "transfer_profile_unavailable" | "insufficient_transfer_words" } {
  const profile = params.profile;
  if (!profile || profile.rowStatus !== "active" || profile.reviewStatus !== "approved_for_first_exposure" || !profile.allowedAgeBands.includes(params.childAgeBand)) return { ok: false, reason: "transfer_profile_unavailable" };
  const feature = `${profile.featureType}:${profile.featureKey}`;
  const eligible = params.morphology
    .filter(row => row.analysisStatus === "approved" && row.rowStatus === "active" && row.reviewStatus === "approved_for_first_exposure" && row.featureKeys.includes(feature) && !params.excludedCanonicalWordIds.has(row.canonicalWordId) && (profile.permittedTransformations.length === 0 || row.transformations.every(value => profile.permittedTransformations.includes(value))))
    .sort((left, right) => left.canonicalWordId.localeCompare(right.canonicalWordId));
  const needed = Math.max(params.take, profile.requiredTransferWords);
  if (eligible.length < needed) return { ok: false, reason: "insufficient_transfer_words" };
  return { ok: true, canonicalWordIds: eligible.slice(0, params.take).map(row => row.canonicalWordId) };
}
