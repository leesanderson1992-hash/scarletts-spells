import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadCanonicalWordSkillRelationshipAuthority } from "@/lib/adle/word-skill-relationships/repository";
import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";

export const TEACHING_DICTIONARY_EVIDENCE_TAG = "teaching-dictionary-evidence";

/** The manager must display and reuse the same reviewed releases as the writing engine. */
export async function loadTeachingDictionaryEvidenceAuthority(client: SupabaseClient, environment: AdleRouteActivationEnvironment) {
  const explicitReviewedAssociations = await loadPublishedWritingAssociations(client, environment);
  return loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment, explicitReviewedAssociations });
}

/** Word workspace read: preserve governed release and pair decisions without
 * transferring the complete relationship and review history on each visit. */
export async function loadTeachingDictionaryEvidenceAuthorityForWord(client: SupabaseClient, environment: AdleRouteActivationEnvironment, canonicalWordId: string) {
  const explicitReviewedAssociations = await loadPublishedWritingAssociations(client, environment, canonicalWordId);
  return loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment, explicitReviewedAssociations, canonicalWordId });
}

/** Share a word's governed read between the detail render and its readiness
 * request. The existing evidence tag invalidates manager mutations; external
 * publication/withdrawal changes remain bounded by the same 60-second TTL. */
export const loadCachedTeachingDictionaryEvidenceAuthorityForWord = unstable_cache(
  (environment: AdleRouteActivationEnvironment, canonicalWordId: string) =>
    loadTeachingDictionaryEvidenceAuthorityForWord(createServiceRoleClient(), environment, canonicalWordId),
  ["teaching-dictionary-word-evidence-v1"],
  { revalidate: 60, tags: [TEACHING_DICTIONARY_EVIDENCE_TAG] },
);

/** Shared admin read model. Manager actions expire it immediately; independent
 * releases are picked up within a minute without caching the approval writer. */
export const loadCachedTeachingDictionaryEvidenceAuthority = unstable_cache(
  (environment: AdleRouteActivationEnvironment) =>
    loadTeachingDictionaryEvidenceAuthority(createServiceRoleClient(), environment),
  ["teaching-dictionary-evidence-v1"],
  { revalidate: 60, tags: [TEACHING_DICTIONARY_EVIDENCE_TAG] },
);
