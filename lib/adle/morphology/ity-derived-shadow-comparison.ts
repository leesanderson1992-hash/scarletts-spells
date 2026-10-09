import type { LearningItemFact } from "../learning-items";
import { selectDynamicAffixWordLab, type DynamicAffixProfile, type DynamicAffixSelection } from "./affix-word-lab";
import { compileDynamicAffixWordLabDecision } from "./dynamic-affix-compiler-rollout";
import type { DerivedSuffixCandidateAudit } from "./derived-suffix-candidate-loader";

export const ITY_DERIVED_SHADOW_COMPARISON_VERSION = "ity_derived_shadow_comparison_v1" as const;

type SelectionResult = {
  wordIds: readonly string[];
  authenticWordIds: readonly string[];
  transferWordIds: readonly string[];
  compiler: "ready" | "blocked";
  blockerCode: string | null;
};

function compileSelection(selection: DynamicAffixSelection | null): SelectionResult | null {
  if (!selection) return null;
  const decision = compileDynamicAffixWordLabDecision(selection, {
    mode: "shared_authoritative", sourceKind: "teaching_dictionary", purpose: "readiness_preview",
  });
  const authenticWordIds = selection.authenticTargets.map((item) => item.canonicalWordId);
  const transferWordIds = selection.transfers.map((word) => word.canonicalWordId);
  return {
    wordIds: [...authenticWordIds, ...transferWordIds], authenticWordIds, transferWordIds,
    compiler: decision.ok ? "ready" : "blocked",
    blockerCode: decision.ok ? null : decision.blockerCode ?? "compiler_blocked",
  };
}

/** Read-only comparison. It never creates an assignment or enables the selector. */
export function compareItyDerivedSelection(input: {
  profile: DynamicAffixProfile;
  learningItems: readonly LearningItemFact[];
  audit: DerivedSuffixCandidateAudit;
}) {
  const { profile, learningItems, audit } = input;
  if (profile.microSkillKey !== "D4_MOR_SUFFIXES_ITY" || audit.profileKey !== profile.microSkillKey) {
    throw new Error("ITY_SHADOW_PROFILE_MISMATCH");
  }
  const released = compileSelection(selectDynamicAffixWordLab({ profiles: [profile], learningItems }));
  const candidateIds = new Set(audit.newlyEligible.map((word) => word.canonicalWordId));
  const shadowProfile = { ...profile, wordsByCanonicalId: new Map([
    ...profile.wordsByCanonicalId,
    ...audit.newlyEligible.map((word) => [word.canonicalWordId, word] as const),
  ]) };
  const shadow = compileSelection(selectDynamicAffixWordLab({ profiles: [shadowProfile], learningItems }));
  const selectedNewWordIds = shadow?.wordIds.filter((id) => candidateIds.has(id)) ?? [];
  const relevantItems = learningItems.filter((item) => item.microSkillKey === profile.microSkillKey);
  const learningItemStatuses = Object.fromEntries([...new Set(relevantItems.map((item) => item.itemStatus))]
    .map((status) => [status, relevantItems.filter((item) => item.itemStatus === status).length]));
  const blockers: string[] = [];
  if (!profile.productionEnabled) blockers.push("profile_not_enabled");
  if (candidateIds.size === 0) blockers.push("no_new_reviewed_candidates");
  if (!shadow) blockers.push("no_selectable_child_group");
  else {
    if (shadow.compiler !== "ready") blockers.push(shadow.blockerCode ?? "compiler_blocked");
    if (selectedNewWordIds.length === 0) blockers.push("new_candidate_not_selected_for_child");
  }
  if (released?.compiler === "blocked") blockers.push("released_compiler_blocked");
  return {
    version: ITY_DERIVED_SHADOW_COMPARISON_VERSION,
    releasedPoolSize: profile.wordsByCanonicalId.size,
    newCandidateCount: candidateIds.size,
    learningItemCount: relevantItems.length,
    learningItemStatuses,
    released,
    shadow,
    selectedNewWordIds,
    selectionChanged: JSON.stringify(released?.wordIds ?? []) !== JSON.stringify(shadow?.wordIds ?? []),
    compilerReadyForChild: blockers.length === 0,
    blockers,
  };
}
