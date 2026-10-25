import type { WordRouteStatus } from "@/lib/teaching-dictionary-manager/word-route-status";
import type { LearningItemFact } from "../learning-items";
import { compileDynamicPrefixWordLabDecision } from "./dynamic-prefix-compiler-rollout";
import {
  selectDynamicPrefixWordLab,
  type DynamicPrefixProfile,
} from "./dynamic-prefix-word-lab";

export type PrefixCandidateShadow = {
  microSkillKey: string;
  routeActivated: boolean;
  routeReleased: boolean;
  governedCandidateIds: string[];
  nativePoolIds: string[];
  presentInBoth: string[];
  governedOnly: string[];
  nativeOnly: string[];
  nativeSelectedIds: string[];
  selectedWithoutAdminAdmission: string[];
  nativeSelectionCompiles: boolean;
  nativeCompilerBlockerCode: string | null;
};

/** Diagnostic only. The native profile, child queue and compiler still own
 * assignment admission. No candidate from this projection is passed to them. */
export function compareDynamicPrefixCandidates(input: {
  microSkillKey: string;
  statuses: readonly WordRouteStatus[];
  profiles: readonly DynamicPrefixProfile[];
  learningItems: readonly LearningItemFact[];
}): PrefixCandidateShadow {
  const activeProfiles = input.profiles.filter((profile) => profile.microSkillKey === input.microSkillKey && profile.productionEnabled);
  const governed = new Set(input.statuses.filter((status) => status.routeId === "dynamic_prefix_word_lab"
    && status.microSkillKey === input.microSkillKey && status.administrativeCandidate).map((status) => status.wordId));
  const native = new Set(activeProfiles.flatMap((profile) => [...profile.wordsByCanonicalId.keys()]));
  const selection = selectDynamicPrefixWordLab({ profiles: activeProfiles,
    learningItems: input.learningItems.filter((item) => item.microSkillKey === input.microSkillKey) });
  const compile = selection ? compileDynamicPrefixWordLabDecision(selection, { sourceKind: "teaching_dictionary" }) : null;
  const sorted = (ids: Iterable<string>) => [...ids].sort();
  const selectedIds = selection ? sorted([
    ...selection.authenticTargets.map((item) => item.canonicalWordId),
    ...selection.transfers.map((word) => word.canonicalWordId),
  ]) : [];
  return {
    microSkillKey: input.microSkillKey,
    routeActivated: input.statuses.some((status) => status.routeId === "dynamic_prefix_word_lab"
      && status.microSkillKey === input.microSkillKey && status.routeActivated),
    routeReleased: input.statuses.some((status) => status.routeId === "dynamic_prefix_word_lab"
      && status.microSkillKey === input.microSkillKey && status.routeReleased),
    governedCandidateIds: sorted(governed),
    nativePoolIds: sorted(native),
    presentInBoth: sorted([...governed].filter((id) => native.has(id))),
    governedOnly: sorted([...governed].filter((id) => !native.has(id))),
    nativeOnly: sorted([...native].filter((id) => !governed.has(id))),
    nativeSelectedIds: selectedIds,
    selectedWithoutAdminAdmission: selectedIds.filter((id) => !governed.has(id)),
    nativeSelectionCompiles: compile?.ok === true,
    nativeCompilerBlockerCode: compile && !compile.ok ? compile.blockerCode ?? "compiler_blocked" : null,
  };
}
