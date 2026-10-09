import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { loadCanonicalWordSkillRelationshipAuthority } from "@/lib/adle/word-skill-relationships/repository";
import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";

/** The manager must display and reuse the same reviewed releases as the writing engine. */
export async function loadTeachingDictionaryEvidenceAuthority(client: SupabaseClient, environment: AdleRouteActivationEnvironment) {
  const explicitReviewedAssociations = await loadPublishedWritingAssociations(client, environment);
  return loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment, explicitReviewedAssociations });
}
