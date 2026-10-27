import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAdleReadPage } from "../observability/read-metrics";
import type { SpecialistMembershipAdapterRow } from "./adapters";

type MembershipRow = {
  canonical_word_id: string;
  micro_skill_key: string;
  member_role: string;
  row_status: string;
  review_status: string;
  content_valid: boolean;
  provenance_id: string;
  release_manifest_id: string;
  release_key: string;
  release_manifest_sha256: string;
  authority_id: string;
  authority_fingerprint: string;
  family_key: string | null;
};

/** The database checks the active release and expands only requested member
 * identities. This keeps large reviewed family JSON inside Postgres. */
export async function loadReleasedInflectionMemberships(
  client: SupabaseClient,
  environmentKey: "local" | "staging" | "production",
  canonicalWordIds?: readonly string[],
): Promise<SpecialistMembershipAdapterRow[]> {
  if (canonicalWordIds && canonicalWordIds.length === 0) return [];
  const output: MembershipRow[] = [];
  const batches = canonicalWordIds
    ? Array.from({ length: Math.ceil(canonicalWordIds.length / 100) }, (_, index) => canonicalWordIds.slice(index * 100, (index + 1) * 100))
    : [null];
  for (const batch of batches) {
    const started = performance.now();
    const { data, error } = await client.rpc("adle_released_inflection_memberships_v1", {
      p_environment_key: environmentKey,
      p_word_ids: batch,
    });
    recordAdleReadPage("adle_released_inflection_memberships_v1", data ?? [], performance.now() - started);
    if (error) throw new Error(`inflection relationship projection: ${error.message}`);
    output.push(...(data ?? []) as MembershipRow[]);
  }
  return output.map((row) => ({
    sourceKind: "route_content",
    provenanceId: row.provenance_id,
    canonicalWordId: row.canonical_word_id,
    microSkillKey: row.micro_skill_key,
    rowStatus: row.row_status,
    reviewStatus: row.review_status,
    exactPairApproved: row.content_valid,
    releaseState: "released",
    authorityVersion: `inflection-release:${row.release_key}:${row.release_manifest_sha256}:${row.authority_fingerprint}`,
    memberRole: row.member_role,
    metadata: { releaseManifestId: row.release_manifest_id, authorityId: row.authority_id,
      ...(row.family_key ? { familyKey: row.family_key } : {}) },
  }));
}
