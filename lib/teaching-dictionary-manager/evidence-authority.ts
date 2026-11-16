import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { unstable_cache } from "next/cache";
import { gzipSync, gunzipSync } from "node:zlib";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadCanonicalWordSkillRelationshipAuthority } from "@/lib/adle/word-skill-relationships/repository";
import { withAdleReadMetrics } from "@/lib/adle/observability/read-metrics";
import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";

export const TEACHING_DICTIONARY_EVIDENCE_TAG = "teaching-dictionary-evidence";

/** The manager must display and reuse the same reviewed releases as the writing engine. */
export async function loadTeachingDictionaryEvidenceAuthority(client: SupabaseClient, environment: AdleRouteActivationEnvironment) {
  const explicitReviewedAssociations = loadPublishedWritingAssociations(client, environment);
  return loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment, explicitReviewedAssociations });
}

/** Bulk assignment still uses the governed interpreter for the chosen skill. */
export async function loadTeachingDictionaryEvidenceAuthorityForSkill(
  client: SupabaseClient, environment: AdleRouteActivationEnvironment, microSkillKey: string,
) {
  const explicitReviewedAssociations = loadPublishedWritingAssociations(client, environment);
  const authority = await loadCanonicalWordSkillRelationshipAuthority({
    client, environmentKey: environment, explicitReviewedAssociations, microSkillKey,
  });
  return authority.relationships.filter(row => row.microSkillKey === microSkillKey);
}

/** Word workspace read: preserve governed release and pair decisions without
 * transferring the complete relationship and review history on each visit. */
export async function loadTeachingDictionaryEvidenceAuthorityForWord(client: SupabaseClient, environment: AdleRouteActivationEnvironment, canonicalWordId: string) {
  const explicitReviewedAssociations = loadPublishedWritingAssociations(client, environment, canonicalWordId);
  return loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment, explicitReviewedAssociations, canonicalWordId });
}

/** Route/skill admin read: resolve a bounded set of identities in one governed
 * interpretation, including withdrawals and pair decisions. */
export async function loadTeachingDictionaryEvidenceAuthorityForWords(
  client: SupabaseClient, environment: AdleRouteActivationEnvironment, canonicalWordIds: readonly string[],
  microSkillKey?: string,
) {
  const explicitReviewedAssociations = loadPublishedWritingAssociations(client, environment, canonicalWordIds);
  return loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment, explicitReviewedAssociations, canonicalWordIds, microSkillKey });
}

/** Share a word's governed read between the detail render and its readiness
 * request. Admin Server Actions expire the evidence tag after governed writes;
 * out-of-band writes remain bounded by the 60-second TTL. */
export const loadCachedTeachingDictionaryEvidenceAuthorityForWord = unstable_cache(
  (environment: AdleRouteActivationEnvironment, canonicalWordId: string) =>
    loadTeachingDictionaryEvidenceAuthorityForWord(createServiceRoleClient(), environment, canonicalWordId),
  ["teaching-dictionary-word-evidence-v1"],
  { revalidate: 60, tags: [TEACHING_DICTIONARY_EVIDENCE_TAG] },
);

/** A list page needs decisions for its displayed words, not the full release
 * history. The bounded result also fits within Next's cache item limit. */
export const loadCachedTeachingDictionaryEvidenceAuthorityForWords = unstable_cache(
  (environment: AdleRouteActivationEnvironment, canonicalWordIds: string[]) =>
    withAdleReadMetrics("teaching_dictionary_catalogue_page_authority_rebuild", async () => {
      const authority = await loadTeachingDictionaryEvidenceAuthorityForWords(
        createServiceRoleClient(), environment, canonicalWordIds);
      return { relationships: authority.relationships.map(({ canonicalWordId, microSkillKey }) =>
        ({ canonicalWordId, microSkillKey })) };
    }),
  ["teaching-dictionary-page-evidence-v3"],
  { revalidate: 60, tags: [TEACHING_DICTIONARY_EVIDENCE_TAG] },
);

/** The two whole-dictionary filters still need global decisions. Production's
 * uncompressed authority exceeds Next's cache item limit; store the lossless
 * compressed snapshot so these filters can reuse it until invalidation. */
const loadCachedCompressedTeachingDictionaryEvidenceAuthority = unstable_cache(
  async (environment: AdleRouteActivationEnvironment) =>
    withAdleReadMetrics("teaching_dictionary_global_authority_rebuild", async () =>
      gzipSync(JSON.stringify(await loadTeachingDictionaryEvidenceAuthority(createServiceRoleClient(), environment))).toString("base64")),
  ["teaching-dictionary-evidence-compressed-v1"],
  { revalidate: 60, tags: [TEACHING_DICTIONARY_EVIDENCE_TAG] },
);

export async function loadCachedTeachingDictionaryEvidenceAuthority(environment: AdleRouteActivationEnvironment) {
  const compressed = await loadCachedCompressedTeachingDictionaryEvidenceAuthority(environment);
  return JSON.parse(gunzipSync(Buffer.from(compressed, "base64")).toString("utf8")) as Awaited<ReturnType<typeof loadTeachingDictionaryEvidenceAuthority>>;
}
