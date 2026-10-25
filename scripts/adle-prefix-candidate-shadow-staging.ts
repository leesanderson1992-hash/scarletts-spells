import assert from "node:assert/strict";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { loadRouteWordStatuses } from "../lib/teaching-dictionary-manager/route-word-status-service";
import { loadDynamicPrefixProfiles } from "../lib/adle/morphology/dynamic-prefix-profile-loader";
import { compareDynamicPrefixCandidates } from "../lib/adle/morphology/prefix-candidate-shadow";
import { loadCurrentPairDeassignments } from "../lib/adle/word-skill-relationships/pair-decision-veto";

async function main() {
  const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
  assert.equal(ref, "qkpjbajicacbrphthibk", "This proof is bound to the disposable staging project");
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`, "Refuse non-staging Supabase URL");
  assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, "staging", "Staging activation environment required");
  const microSkillKey = process.argv[2] ?? "D4_MOR_PREFIXES_UN";
  const childId = process.argv[3] ?? "00000000-0000-0000-0000-000000000000";
  assert.match(childId, /^[0-9a-f-]{36}$/i);
  const client = createServiceRoleClient();
  const route = await loadRouteWordStatuses({ routeId: "dynamic_prefix_word_lab", microSkillKey });
  const native = await loadDynamicPrefixProfiles(client, childId, { microSkillKeys: [microSkillKey], allowStagingProfiles: true });
  const deassignedPairs = await loadCurrentPairDeassignments({ client,
    environmentKey: "staging", pairs: native.profiles.flatMap((profile) =>
      [...profile.wordsByCanonicalId.keys()].map((canonicalWordId) =>
        ({ canonicalWordId, microSkillKey: profile.microSkillKey }))) });
  const report = compareDynamicPrefixCandidates({ microSkillKey,
    statuses: route.words.map((word) => word.status), profiles: native.profiles,
    learningItems: native.learningItems, deassignedPairs });
  console.log(JSON.stringify({ event: "adle_prefix_candidate_shadow_v1", microSkillKey,
    governedCount: report.governedCandidateIds.length, nativePoolCount: report.nativePoolIds.length,
    contractVersion: report.contractVersion,
    routeContentContractVersion: report.routeContentContractVersion,
    routeVersion: report.routeVersion,
    requiredActivityVariants: report.requiredActivityVariants,
    requiredFactsByActivity: report.requiredFactsByActivity,
    governedOnly: report.governedOnly, nativeOnly: report.nativeOnly,
    nativeSelectedCount: report.nativeSelectedIds.length,
    nativeSelectionCompiles: report.nativeSelectionCompiles,
    nativeCompilerBlockerCode: report.nativeCompilerBlockerCode,
    selectedWithoutAdminAdmission: report.selectedWithoutAdminAdmission,
    nativeSelectionMatchesAdmin: report.selectedWithoutAdminAdmission.length === 0,
    wordDecisions: report.wordDecisions.map((decision) => ({
      wordId: decision.wordId, nativeMember: decision.nativeMember,
      authenticQueueEligible: decision.authenticQueueEligible,
      approvedTransfer: decision.approvedTransfer,
      administrativeCandidate: decision.administrativeCandidate,
      nativeSelectable: decision.nativeSelectable, selected: decision.selected,
      technicalFacts: decision.technicalFacts, editorialApproved: decision.editorialApproved,
      relationshipApproved: decision.relationshipApproved,
      routeReleased: decision.routeReleased, routeActivated: decision.routeActivated,
      blockerCodes: decision.blockerCodes,
    })),
    routeActivated: report.routeActivated, routeReleased: report.routeReleased,
    routeCandidateCount: route.counts.candidates,
    routeApprovedRelationshipCount: route.counts.approvedRelationships }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
