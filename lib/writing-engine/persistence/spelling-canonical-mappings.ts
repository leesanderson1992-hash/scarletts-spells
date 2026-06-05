import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

export type SpellingCanonicalResolverVisibilityStatus =
  | "hidden"
  | "visible"
  | "disabled";

export type ResolverVisibleCanonicalExactPairResolved = {
  status: "resolved";
  source: "resolver_visible_canonical_exact_pair";
  mappingId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  dialectCode: string;
  normalizationVersion: string;
};

export type ResolverVisibleCanonicalExactPairUnresolved = {
  status: "unresolved";
  reason:
    | "missing_pair"
    | "no_visible_mapping"
    | "missing_visibility_enable_event"
    | "inactive_or_non_assignable_micro_skill";
};

export type ResolverVisibleCanonicalExactPairBlocked = {
  status: "blocked";
  reason:
    | "conflicting_visible_micro_skills"
    | "conflicting_visible_corrections";
  mappingIds: string[];
};

export type ResolverVisibleCanonicalExactPairResolution =
  | ResolverVisibleCanonicalExactPairResolved
  | ResolverVisibleCanonicalExactPairUnresolved
  | ResolverVisibleCanonicalExactPairBlocked;

type ResolverVisibleCanonicalMappingRow = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  mapping_status: string;
  dialect_code: string;
  normalization_version: string;
  resolver_visibility_status: SpellingCanonicalResolverVisibilityStatus;
};

type ResolverVisibleCanonicalMappingEventRow = {
  mapping_id: string;
};

type ResolverVisibleMicroSkillRow = {
  micro_skill_key: string;
};

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

function normalizeLookupText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLookupCode(
  value: string | null | undefined,
  fallback: string,
) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normaliseResolverVisibleCanonicalMappingRow(
  value: unknown,
): ResolverVisibleCanonicalMappingRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ResolverVisibleCanonicalMappingRow>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.misspelling_normalized !== "string" ||
    typeof candidate.correct_spelling_normalized !== "string" ||
    typeof candidate.micro_skill_key !== "string" ||
    candidate.mapping_status !== "active" ||
    typeof candidate.dialect_code !== "string" ||
    typeof candidate.normalization_version !== "string" ||
    candidate.resolver_visibility_status !== "visible"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    misspelling_normalized: candidate.misspelling_normalized,
    correct_spelling_normalized: candidate.correct_spelling_normalized,
    micro_skill_key: candidate.micro_skill_key,
    mapping_status: candidate.mapping_status,
    dialect_code: candidate.dialect_code,
    normalization_version: candidate.normalization_version,
    resolver_visibility_status: candidate.resolver_visibility_status,
  };
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

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

export async function findResolverVisibleExactPairMapping(input: {
  supabase?: ServiceRoleClient;
  misspellingNormalized: string | null | undefined;
  correctSpellingNormalized: string | null | undefined;
  dialectCode?: string | null;
  normalizationVersion?: string | null;
}): Promise<ResolverVisibleCanonicalExactPairResolution> {
  const misspellingNormalized = normalizeLookupText(input.misspellingNormalized);
  const correctSpellingNormalized = normalizeLookupText(
    input.correctSpellingNormalized,
  );

  if (!misspellingNormalized || !correctSpellingNormalized) {
    return {
      status: "unresolved",
      reason: "missing_pair",
    };
  }

  const dialectCode = normalizeLookupCode(input.dialectCode, "en-GB");
  const normalizationVersion = normalizeLookupCode(
    input.normalizationVersion,
    "spelling_normalize_v1",
  );
  const supabase = input.supabase ?? createServiceRoleClient();

  const { data: mappingRows, error: mappingError } = await supabase
    .from("spelling_canonical_mappings")
    .select(
      [
        "id",
        "misspelling_normalized",
        "correct_spelling_normalized",
        "micro_skill_key",
        "mapping_status",
        "dialect_code",
        "normalization_version",
        "resolver_visibility_status",
      ].join(", "),
    )
    .eq("misspelling_normalized", misspellingNormalized)
    .eq("dialect_code", dialectCode)
    .eq("normalization_version", normalizationVersion)
    .eq("mapping_status", "active")
    .eq("resolver_visibility_status", "visible")
    .order("created_at", { ascending: true });

  if (mappingError) {
    throw new Error(
      mappingError.message || "Failed to read resolver-visible mappings.",
    );
  }

  const visibleMappings = ((mappingRows ?? []) as unknown[])
    .map((row) => normaliseResolverVisibleCanonicalMappingRow(row))
    .filter(Boolean) as ResolverVisibleCanonicalMappingRow[];

  if (visibleMappings.length === 0) {
    return {
      status: "unresolved",
      reason: "no_visible_mapping",
    };
  }

  const conflictingCorrectionMappings = visibleMappings.filter(
    (mapping) =>
      mapping.correct_spelling_normalized !== correctSpellingNormalized,
  );

  if (conflictingCorrectionMappings.length > 0) {
    return {
      status: "blocked",
      reason: "conflicting_visible_corrections",
      mappingIds: conflictingCorrectionMappings.map((mapping) => mapping.id),
    };
  }

  const exactPairMappings = visibleMappings.filter(
    (mapping) =>
      mapping.correct_spelling_normalized === correctSpellingNormalized,
  );

  if (exactPairMappings.length === 0) {
    return {
      status: "unresolved",
      reason: "no_visible_mapping",
    };
  }

  const distinctMicroSkillKeys = dedupeStrings(
    exactPairMappings.map((mapping) => mapping.micro_skill_key),
  );

  if (distinctMicroSkillKeys.length !== 1) {
    return {
      status: "blocked",
      reason: "conflicting_visible_micro_skills",
      mappingIds: exactPairMappings.map((mapping) => mapping.id),
    };
  }

  const exactPairMappingIds = exactPairMappings.map((mapping) => mapping.id);
  const { data: eventRows, error: eventError } = await supabase
    .from("spelling_canonical_mapping_events")
    .select("mapping_id")
    .in("mapping_id", exactPairMappingIds)
    .eq("event_type", "resolver_visibility_enabled")
    .eq("new_resolver_visibility_status", "visible");

  if (eventError) {
    throw new Error(
      eventError.message ||
        "Failed to read resolver visibility audit events.",
    );
  }

  const mappingIdsWithEnableEvents = new Set(
    ((eventRows ?? []) as unknown[])
      .map((row) => row as Partial<ResolverVisibleCanonicalMappingEventRow>)
      .map((row) => row.mapping_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const auditedMappings = exactPairMappings.filter((mapping) =>
    mappingIdsWithEnableEvents.has(mapping.id),
  );

  if (auditedMappings.length === 0) {
    return {
      status: "unresolved",
      reason: "missing_visibility_enable_event",
    };
  }

  const selectedMapping = auditedMappings[0];

  if (!selectedMapping) {
    return {
      status: "unresolved",
      reason: "missing_visibility_enable_event",
    };
  }

  const { data: microSkillRow, error: microSkillError } = await supabase
    .from("micro_skill_catalog")
    .select("micro_skill_key")
    .eq("micro_skill_key", selectedMapping.micro_skill_key)
    .eq("mastery_domain_key", "D4")
    .eq("is_active", true)
    .eq("is_assignable", true)
    .maybeSingle();

  if (microSkillError) {
    throw new Error(
      microSkillError.message ||
        "Failed to validate resolver-visible micro-skill.",
    );
  }

  const typedMicroSkillRow =
    microSkillRow as ResolverVisibleMicroSkillRow | null;

  if (!typedMicroSkillRow?.micro_skill_key) {
    return {
      status: "unresolved",
      reason: "inactive_or_non_assignable_micro_skill",
    };
  }

  return {
    status: "resolved",
    source: "resolver_visible_canonical_exact_pair",
    mappingId: selectedMapping.id,
    misspellingNormalized: selectedMapping.misspelling_normalized,
    correctSpellingNormalized: selectedMapping.correct_spelling_normalized,
    microSkillKey: selectedMapping.micro_skill_key,
    dialectCode: selectedMapping.dialect_code,
    normalizationVersion: selectedMapping.normalization_version,
  };
}
