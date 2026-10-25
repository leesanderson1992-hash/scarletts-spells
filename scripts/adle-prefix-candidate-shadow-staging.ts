import assert from "node:assert/strict";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { loadRouteWordStatuses } from "../lib/teaching-dictionary-manager/route-word-status-service";
import { loadDynamicPrefixProfiles } from "../lib/adle/morphology/dynamic-prefix-profile-loader";
import { compareDynamicPrefixCandidates } from "../lib/adle/morphology/prefix-candidate-shadow";

async function main() {
  const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
  assert.equal(ref, "qkpjbajicacbrphthibk", "This proof is bound to the disposable staging project");
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`, "Refuse non-staging Supabase URL");
  assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, "staging", "Staging activation environment required");
  const microSkillKey = process.argv[2] ?? "D4_MOR_PREFIXES_UN";
  const client = createServiceRoleClient();
  const route = await loadRouteWordStatuses({ routeId: "dynamic_prefix_word_lab", microSkillKey });
  const native = await loadDynamicPrefixProfiles(client, "00000000-0000-0000-0000-000000000000", { microSkillKeys: [microSkillKey] });
  const report = compareDynamicPrefixCandidates({ microSkillKey,
    statuses: route.words.map((word) => word.status), profiles: native.profiles, learningItems: native.learningItems });
  console.log(JSON.stringify({ event: "adle_prefix_candidate_shadow_v1", microSkillKey,
    governedCount: report.governedCandidateIds.length, nativePoolCount: report.nativePoolIds.length,
    governedOnly: report.governedOnly, nativeOnly: report.nativeOnly,
    nativeSelectedCount: report.nativeSelectedIds.length,
    nativeSelectionCompiles: report.nativeSelectionCompiles,
    nativeCompilerBlockerCode: report.nativeCompilerBlockerCode,
    routeCandidateCount: route.counts.candidates,
    routeApprovedRelationshipCount: route.counts.approvedRelationships }));
  if (report.nativeOnly.length > 0) throw new Error("NATIVE_POOL_CONTAINS_UNGOVERNED_WORD");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
