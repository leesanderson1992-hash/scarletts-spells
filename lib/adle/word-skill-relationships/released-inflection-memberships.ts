import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- release ledger rows precede generated database types */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ING_MICRO_SKILLS, ingWordBlockers } from "../ing/contracts";
import { COMPARATIVE_MICRO_SKILLS, adjectiveFamilyBlockers } from "../inflection/contracts";
import type { SpecialistMembershipAdapterRow } from "./adapters";

const ROUTES = ["ing_endings_word_lab", "comparative_superlative_word_lab"];

async function rows(client: SupabaseClient, table: string, columns: string, configure: (query: any) => any): Promise<any[]> {
  const result = await configure(client.from(table).select(columns));
  if (result.error) throw new Error(`inflection relationship ${table}: ${result.error.message}`);
  return result.data ?? [];
}

/** Interpret only immutable, enabled and fingerprint-matched specialist releases.
 * The returned facts still pass through the central pair-decision interpreter. */
export async function loadReleasedInflectionMemberships(
  client: SupabaseClient,
  environmentKey: "local" | "staging" | "production",
): Promise<SpecialistMembershipAdapterRow[]> {
  const heads = await rows(client, "adle_route_activation_heads", "current_revision_id,route_id,route_version,micro_skill_key", (query) =>
    query.eq("environment_key", environmentKey).in("route_id", ROUTES));
  if (!heads.length) return [];
  const revisions = await rows(client, "adle_route_activation_revisions", "id,release_manifest_id,release_manifest_sha256,dependency_fingerprint,activation_status,micro_skill_key", (query) =>
    query.in("id", [...new Set(heads.map((head) => head.current_revision_id))]));
  const active = revisions.filter((revision) => revision.activation_status === "enabled");
  if (!active.length) return [];
  const releaseIds = [...new Set(active.map((revision) => revision.release_manifest_id))];
  const [releases, dependencies] = await Promise.all([
    rows(client, "adle_curriculum_release_manifests", "id,release_key,route_id,route_version,release_manifest_sha256,dependency_fingerprint", (query) => query.in("id", releaseIds)),
    rows(client, "adle_curriculum_release_dependencies", "release_manifest_id,micro_skill_key,authority_id,authority_key,authority_type,semantic_fingerprint", (query) =>
      query.in("release_manifest_id", releaseIds).in("authority_type", ["ing_word_members", "adjective_degree_families"])),
  ]);
  const authorities = dependencies.length
    ? await rows(client, "adle_curriculum_dependency_authorities", "id,authority_key,authority_type,schema_version,semantic_projection,semantic_fingerprint", (query) =>
      query.in("id", [...new Set(dependencies.map((dependency) => dependency.authority_id))]))
    : [];
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
  const releaseById = new Map(releases.map((release) => [release.id, release]));
  const authorityById = new Map(authorities.map((authority) => [authority.id, authority]));
  const output: SpecialistMembershipAdapterRow[] = [];
  for (const head of heads) {
    const revision = revisionById.get(head.current_revision_id);
    if (!revision || revision.activation_status !== "enabled") continue;
    const release = releaseById.get(revision.release_manifest_id);
    if (!release || release.route_id !== head.route_id || release.route_version !== head.route_version ||
      revision.micro_skill_key !== head.micro_skill_key ||
      release.release_manifest_sha256 !== revision.release_manifest_sha256 ||
      release.dependency_fingerprint !== revision.dependency_fingerprint) {
      throw new Error(`inflection relationship release mismatch: ${head.current_revision_id}`);
    }
    const type = head.route_id === "ing_endings_word_lab" ? "ing_word_members" :
      head.route_id === "comparative_superlative_word_lab" ? "adjective_degree_families" : null;
    if (!type) continue;
    const allowed = type === "ing_word_members" ? ING_MICRO_SKILLS : COMPARATIVE_MICRO_SKILLS;
    if (!(allowed as readonly string[]).includes(head.micro_skill_key)) continue;
    const bindings = dependencies.filter((dependency) => dependency.release_manifest_id === release.id &&
      dependency.micro_skill_key === head.micro_skill_key && dependency.authority_type === type);
    if (bindings.length !== 1) throw new Error(`inflection relationship dependency mismatch: ${head.current_revision_id}`);
    const binding = bindings[0];
    const authority = authorityById.get(binding.authority_id);
    if (!authority || authority.authority_type !== type || authority.authority_key !== binding.authority_key ||
      authority.schema_version !== 1 || authority.semantic_fingerprint !== binding.semantic_fingerprint ||
      authority.semantic_projection?.microSkillKey !== head.micro_skill_key) {
      throw new Error(`inflection relationship authority mismatch: ${binding.authority_id}`);
    }
    const version = `inflection-release:${release.release_key}:${release.release_manifest_sha256}:${authority.semantic_fingerprint}`;
    if (type === "ing_word_members") {
      const words = authority.semantic_projection.words;
      if (!Array.isArray(words)) throw new Error(`inflection relationship words missing: ${authority.id}`);
      for (const word of words) {
        output.push({ sourceKind: "route_content", provenanceId: `${authority.id}:${word.canonicalWordId}`,
          canonicalWordId: word.canonicalWordId, microSkillKey: head.micro_skill_key,
          rowStatus: word.rowStatus, reviewStatus: word.reviewStatus,
          exactPairApproved: word.microSkillKey === head.micro_skill_key && ingWordBlockers(word).length === 0,
          releaseState: "released", authorityVersion: version, memberRole: "derived_target",
          metadata: { releaseManifestId: release.id, authorityId: authority.id } });
      }
    } else {
      const families = authority.semantic_projection.families;
      if (!Array.isArray(families)) throw new Error(`inflection relationship families missing: ${authority.id}`);
      for (const family of families) for (const word of family.words ?? []) {
        output.push({ sourceKind: "route_content", provenanceId: `${authority.id}:${family.familyKey}:${word.canonicalWordId}`,
          canonicalWordId: word.canonicalWordId, microSkillKey: head.micro_skill_key,
          rowStatus: family.rowStatus, reviewStatus: family.reviewStatus,
          exactPairApproved: family.microSkillKey === head.micro_skill_key && adjectiveFamilyBlockers(family).length === 0,
          releaseState: "released", authorityVersion: version,
          memberRole: word.degree === "base" ? "support_base" : "derived_target",
          metadata: { releaseManifestId: release.id, authorityId: authority.id, familyKey: family.familyKey } });
      }
    }
  }
  return output;
}
