import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

export type CreateSpellingCanonicalMappingInput = {
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  adminUserId: string;
  adminEmail?: string | null;
  sourceCaseId?: string | null;
  sourceDecisionId?: string | null;
  decisionNote?: string | null;
  dialectCode?: string;
  normalizationVersion?: string;
  metadata?: Record<string, unknown>;
  eventMetadata?: Record<string, unknown>;
};

export async function createSpellingCanonicalMappingAdmin(input: {
  supabase?: ServiceRoleClient;
  mapping: CreateSpellingCanonicalMappingInput;
}) {
  const supabase = input.supabase ?? createServiceRoleClient();
  const { mapping } = input;

  const { data, error } = await supabase.rpc(
    "create_spelling_canonical_mapping_admin",
    {
      p_admin_email: mapping.adminEmail ?? null,
      p_admin_user_id: mapping.adminUserId,
      p_correct_spelling_normalized: mapping.correctSpellingNormalized,
      p_decision_note: mapping.decisionNote ?? null,
      p_dialect_code: mapping.dialectCode ?? "en-GB",
      p_event_metadata: mapping.eventMetadata ?? {},
      p_metadata: {
        ...(mapping.metadata ?? {}),
        resolver_visible: false,
      },
      p_micro_skill_key: mapping.microSkillKey,
      p_misspelling_normalized: mapping.misspellingNormalized,
      p_normalization_version:
        mapping.normalizationVersion ?? "spelling_normalize_v1",
      p_source_case_id: mapping.sourceCaseId ?? null,
      p_source_decision_id: mapping.sourceDecisionId ?? null,
    },
  );

  if (error) {
    throw new Error(error.message || "Failed to create canonical spelling mapping.");
  }

  if (typeof data !== "string") {
    throw new Error("Canonical spelling mapping RPC did not return an id.");
  }

  return data;
}
