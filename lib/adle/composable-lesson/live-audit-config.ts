export const ADLE_PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
export const ADLE_PRODUCTION_SUPABASE_HOST =
  `${ADLE_PRODUCTION_PROJECT_REF}.supabase.co`;

export interface LiveReadinessAuditConfig {
  supabaseUrl: string;
  productionHost: typeof ADLE_PRODUCTION_SUPABASE_HOST;
}

/** Identity is verified before credentials or database adapters are created. */
export function resolveLiveReadinessAuditConfig(input: {
  supabaseUrl?: string;
  acknowledgedProductionHost?: string;
}): LiveReadinessAuditConfig {
  if (!input.supabaseUrl?.trim()) {
    throw new Error("Live readiness audit requires a Supabase URL.");
  }
  let url: URL;
  try {
    url = new URL(input.supabaseUrl);
  } catch {
    throw new Error("Live readiness audit received a malformed Supabase URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== ADLE_PRODUCTION_SUPABASE_HOST
  ) {
    throw new Error(
      `Live readiness audit requires ${ADLE_PRODUCTION_SUPABASE_HOST}.`,
    );
  }
  if (
    input.acknowledgedProductionHost !== ADLE_PRODUCTION_SUPABASE_HOST
  ) {
    throw new Error(
      "Live readiness audit requires an exact production-host acknowledgement.",
    );
  }
  return {
    supabaseUrl: url.toString().replace(/\/$/, ""),
    productionHost: ADLE_PRODUCTION_SUPABASE_HOST,
  };
}

export const LIVE_READINESS_SELECT_ALLOWLIST = [
  "micro_skill_catalog",
  "canonical_teaching_dictionary_prefix_profiles",
  "canonical_teaching_dictionary_prefix_members",
  "canonical_teaching_dictionary_suffix_profiles",
  "canonical_teaching_dictionary_suffix_members",
  "canonical_teaching_dictionary_compound_profiles",
  "canonical_teaching_dictionary_compound_facts",
  "canonical_teaching_dictionary_base_word_families",
  "canonical_teaching_dictionary_base_word_family_members",
] as const;

export type LiveReadinessTable =
  (typeof LIVE_READINESS_SELECT_ALLOWLIST)[number];

export function assertLiveReadinessSelectAllowed(
  operation: string,
  table: string,
): asserts table is LiveReadinessTable {
  if (
    operation !== "select" ||
    !LIVE_READINESS_SELECT_ALLOWLIST.includes(table as LiveReadinessTable)
  ) {
    throw new Error(`Unsafe live readiness operation rejected: ${operation}:${table}`);
  }
}
