import type { WordRouteStatus } from "@/lib/teaching-dictionary-manager/word-route-status";
import { routeContentContractFor } from "../composable-lesson/route-content-contract";
import type { LearningItemFact } from "../learning-items";
import { selectableLearningItems } from "../learning-items";
import { compileDynamicPrefixWordLabDecision } from "./dynamic-prefix-compiler-rollout";
import { excludeDeassignedDynamicPrefixWords } from "./dynamic-prefix-pair-eligibility";
import {
  selectDynamicPrefixWordLab,
  type DynamicPrefixProfile,
} from "./dynamic-prefix-word-lab";

export const DYNAMIC_PREFIX_STATUS_CONTRACT_VERSION = "dynamic_prefix_status_contract_v1";

export type PrefixCandidateDecision = {
  wordId: string;
  contentRole: string | null;
  dictionaryApproved: boolean;
  relationshipApproved: boolean;
  technicalFacts: WordRouteStatus["technicalFacts"];
  editorialApproved: boolean;
  routeReleased: boolean;
  routeActivated: boolean;
  nativeMember: boolean;
  authenticQueueEligible: boolean;
  approvedTransfer: boolean;
  administrativeCandidate: boolean;
  nativeSelectable: boolean;
  selected: boolean;
  blockerCodes: string[];
};

export type PrefixCandidateShadow = {
  contractVersion: typeof DYNAMIC_PREFIX_STATUS_CONTRACT_VERSION;
  routeContentContractVersion: string;
  routeVersion: string;
  requiredActivityVariants: string[];
  requiredFactsByActivity: Array<{ activity: string; wordScope: string;
    facts: Array<{ key: string; owner: string }> }>;
  wordDecisions: PrefixCandidateDecision[];
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
  deassignedPairs: ReadonlySet<string>;
}): PrefixCandidateShadow {
  const contract = routeContentContractFor("dynamic_prefix_word_lab", input.microSkillKey);
  if (!contract) throw new Error(`DYNAMIC_PREFIX_STATUS_CONTRACT_UNAVAILABLE:${input.microSkillKey}`);
  const activeProfiles = excludeDeassignedDynamicPrefixWords(input.profiles, input.deassignedPairs)
    .filter((profile) => profile.microSkillKey === input.microSkillKey && profile.productionEnabled);
  const governed = new Set(input.statuses.filter((status) => status.routeId === "dynamic_prefix_word_lab"
    && status.microSkillKey === input.microSkillKey && status.administrativeCandidate).map((status) => status.wordId));
  const nativeWords = new Map(activeProfiles.flatMap((profile) => [...profile.wordsByCanonicalId.entries()]));
  const native = new Set(nativeWords.keys());
  const authenticQueue = new Set(selectableLearningItems(input.learningItems)
    .filter((item) => item.microSkillKey === input.microSkillKey
      && item.sourceKind === "verified_misspelling" && native.has(item.canonicalWordId))
    .map((item) => item.canonicalWordId));
  const transfer = new Set(activeProfiles.flatMap((profile) => profile.transferCanonicalWordIds));
  const selection = selectDynamicPrefixWordLab({ profiles: activeProfiles,
    learningItems: input.learningItems.filter((item) => item.microSkillKey === input.microSkillKey) });
  const compile = selection ? compileDynamicPrefixWordLabDecision(selection, { sourceKind: "teaching_dictionary" }) : null;
  const sorted = (ids: Iterable<string>) => [...ids].sort();
  const selectedIds = selection ? sorted([
    ...selection.authenticTargets.map((item) => item.canonicalWordId),
    ...selection.transfers.map((word) => word.canonicalWordId),
  ]) : [];
  const selectedSet = new Set(selectedIds);
  const statusById = new Map(input.statuses.filter((status) => status.routeId === contract.routeId
    && status.microSkillKey === input.microSkillKey).map((status) => [status.wordId, status]));
  const wordDecisions: PrefixCandidateDecision[] = sorted(new Set([...statusById.keys(), ...native]))
    .map((wordId) => {
      const status = statusById.get(wordId);
      const word = nativeWords.get(wordId);
      const authenticQueueEligible = authenticQueue.has(wordId);
      const approvedTransfer = Boolean(word?.approvedTransfer && transfer.has(wordId));
      const blockerCodes = [...new Set([
        ...(status?.blockerDetails?.map((blocker) => blocker.code) ?? []),
        ...(!status ? ["ADMIN_STATUS_MISSING"] : []),
        ...(!word ? ["NATIVE_MEMBER_MISSING"] : []),
        ...(word && !authenticQueueEligible && !approvedTransfer ? ["NATIVE_ROLE_NOT_SELECTABLE"] : []),
      ])];
      return {
        wordId, contentRole: status?.contentRole ?? null,
        dictionaryApproved: status?.dictionaryApproved === true,
        relationshipApproved: status?.relationshipApproved === true,
        technicalFacts: status?.technicalFacts ?? "not_evaluated",
        editorialApproved: status?.editorialApproved === true,
        routeReleased: status?.routeReleased === true,
        routeActivated: status?.routeActivated === true,
        nativeMember: Boolean(word), authenticQueueEligible, approvedTransfer,
        administrativeCandidate: status?.administrativeCandidate === true,
        nativeSelectable: Boolean(word && (authenticQueueEligible || approvedTransfer)),
        selected: selectedSet.has(wordId), blockerCodes,
      };
    });
  return {
    contractVersion: DYNAMIC_PREFIX_STATUS_CONTRACT_VERSION,
    routeContentContractVersion: contract.contractVersion,
    routeVersion: contract.routeVersion,
    requiredActivityVariants: contract.activities.filter((activity) => activity.enabled)
      .map((activity) => `${activity.kind}:${activity.variantKey}`),
    requiredFactsByActivity: contract.activities.filter((activity) => activity.enabled)
      .map((activity) => ({ activity: `${activity.kind}:${activity.variantKey}`,
        wordScope: activity.wordScope,
        facts: activity.requiredFacts.map((fact) => ({ key: fact.factKey, owner: fact.owner })) })),
    wordDecisions,
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
