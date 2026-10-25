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
 * request. Admin Server Actions expire the evidence tag after governed writes;
 * out-of-band writes remain bounded by the 60-second TTL. */
export const loadCachedTeachingDictionaryEvidenceAuthorityForWord = unstable_cache(
  (environment: AdleRouteActivationEnvironment, canonicalWordId: string) =>
    loadTeachingDictionaryEvidenceAuthorityForWord(createServiceRoleClient(), environment, canonicalWordId),
  ["teaching-dictionary-word-evidence-v1"],
  { revalidate: 60, tags: [TEACHING_DICTIONARY_EVIDENCE_TAG] },
);

/** Shared admin read model. Governed admin actions expire it immediately;
 * out-of-band releases are picked up within a minute. */
export const loadCachedTeachingDictionaryEvidenceAuthority = unstable_cache(
  (environment: AdleRouteActivationEnvironment) =>
    loadTeachingDictionaryEvidenceAuthority(createServiceRoleClient(), environment),
  ["teaching-dictionary-evidence-v1"],
  { revalidate: 60, tags: [TEACHING_DICTIONARY_EVIDENCE_TAG] },
);
