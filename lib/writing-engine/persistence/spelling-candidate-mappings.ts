import { createClient } from "@/lib/supabase/server";

export {
  createSupabaseSpellingCandidateMappingRepositoryBase,
  type ParentLocalPendingSpellingCandidateMappingRecord,
  type ParentLocalPromotedSpellingCandidateMappingRecord,
  type ParentLocalSpellingCandidateMappingRecord,
  type PendingSpellingCandidateMappingInsert,
  type SpellingCandidateMappingRecord,
  type SpellingCandidateMappingStatus,
  type SpellingCandidatePromotionScope,
} from "./spelling-candidate-mapping-repository";
export {
  type ParentLocalSpellingCandidateMappingUpdateResult,
} from "./spelling-candidate-mapping-promotion";

import { createSupabaseSpellingCandidateMappingRepositoryBase } from "./spelling-candidate-mapping-repository";
import { createSpellingCandidateMappingPromotionHelpers } from "./spelling-candidate-mapping-promotion";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseSpellingCandidateMappingRepository(
  supabase: SupabaseServerClient,
) {
  const baseRepository = createSupabaseSpellingCandidateMappingRepositoryBase(supabase);
  const promotionHelpers = createSpellingCandidateMappingPromotionHelpers({
    supabase,
    repository: baseRepository,
  });

  return {
    ...baseRepository,
    ...promotionHelpers,
  };
}
