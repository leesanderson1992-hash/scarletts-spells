export type ItyDerivedBlockerAction = {
  label: string;
  target: string | null;
};

/** These targets are the same controls used by the word readiness table. */
const ACTIONS: Record<string, ItyDerivedBlockerAction> = {
  word_not_reviewed: { label: "Review and publish the dictionary word", target: "td-word-editor" },
  morphology_not_reviewed: { label: "Review and publish canonical morphology", target: "td-canonical-parts" },
  word_banding_incomplete: { label: "Complete reviewed word metadata", target: "td-age-band" },
  dictation_not_reviewed: { label: "Review the dictation sentence and target", target: "td-dictation" },
  meaning_not_reviewed: { label: "Publish a shared definition", target: "td-definition" },
  meaning_group_ambiguous: { label: "This route needs a reviewed meaning choice", target: "td-route-D4_MOR_SUFFIXES_ITY-meaningBinKey" },
  two_part_analysis_required: { label: "Multi-part morphology needs route teaching content", target: "td-route-D4_MOR_SUFFIXES_ITY" },
  direct_suffix_reconstruction_failed: { label: "Review the spelling parts and suffix boundary", target: "td-canonical-parts" },
  base_meaning_missing: { label: "Add the reviewed base or root part meaning", target: "td-canonical-parts" },
  immutable_source_missing: { label: "Publish reviewed source facts", target: "td-source" },
  route_compiler_rejected: { label: "Review the generated question and answer", target: "td-route-D4_MOR_SUFFIXES_ITY" },
};

export function ityDerivedBlockerAction(code: string): ItyDerivedBlockerAction {
  return ACTIONS[code] ?? { label: code.replaceAll("_", " "), target: null };
}

const SHADOW_MESSAGES: Record<string, string> = {
  profile_not_enabled: "The released -ity profile is not enabled in this environment.",
  no_new_reviewed_candidates: "No additional dictionary word passes the reviewed -ity checks. Complete a direct word's reviewed facts; multi-part words need route content until a separate adapter is released.",
  no_selectable_child_group: "This learner has no selectable four-word -ity group. Review the learner's authentic target states.",
  new_candidate_not_selected_for_child: "The new word is not chosen for this learner's question roles.",
  released_compiler_blocked: "The current released selection failed the question compiler.",
};

export function ityShadowBlockerMessage(code: string): string {
  return SHADOW_MESSAGES[code] ?? `The question compiler reported ${code.replaceAll("_", " ")}.`;
}
