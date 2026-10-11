import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadCanonicalWordSkillRelationshipAuthority } from "@/lib/adle/word-skill-relationships/repository";
import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";

/** The manager must display and reuse the same reviewed releases as the writing engine. */
export async function loadTeachingDictionaryEvidenceAuthority(client: SupabaseClient, environment: AdleRouteActivationEnvironment) {
  const explicitReviewedAssociations = await loadPublishedWritingAssociations(client, environment);
  return loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment, explicitReviewedAssociations });
}

export const TEACHING_DICTIONARY_EVIDENCE_TAG = "teaching-dictionary-evidence";

/** Shared admin read model. Manager actions expire it immediately; independent
 * releases are picked up within a minute without caching the approval writer. */
export const loadCachedTeachingDictionaryEvidenceAuthority = unstable_cache(
  (environment: AdleRouteActivationEnvironment) =>
    loadTeachingDictionaryEvidenceAuthority(createServiceRoleClient(), environment),
  ["teaching-dictionary-evidence-v1"],
  { revalidate: 60, tags: [TEACHING_DICTIONARY_EVIDENCE_TAG] },
);
