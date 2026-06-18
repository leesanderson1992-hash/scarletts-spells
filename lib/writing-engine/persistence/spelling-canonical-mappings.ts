import "server-only";

import { createServiceRoleClient } from "../../supabase/service-role";

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

type RecommendationCanonicalExactPairMappingRow = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  mapping_status: string;
  resolver_visibility_status: SpellingCanonicalResolverVisibilityStatus;
};

export type RecommendationCanonicalExactPairMappingSignal = {
  mappingId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  resolverVisibilityStatus: SpellingCanonicalResolverVisibilityStatus;
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

export type SetResolverVisibilityForCanonicalMappingInput = {
  mappingId: string;
  adminUserId: string;
  adminEmail?: string | null;
  note: string;
  metadata?: Record<string, unknown>;
};

export type AdoptSpellingCanonicalMappingRecommendationInput = {
  recommendationId: string;
  adminUserId: string;
  adminEmail?: string | null;
  note: string;
  dialectCode?: string;
  normalizationVersion?: string;
  metadata?: Record<string, unknown>;
};

export type AdoptSeedImportRowHiddenCanonicalInput = {
  seedImportRowId: string;
  adminUserId: string;
  adminEmail?: string | null;
  note: string;
  metadata?: Record<string, unknown>;
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

function normaliseRecommendationCanonicalExactPairMappingRow(
  value: unknown,
): RecommendationCanonicalExactPairMappingRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RecommendationCanonicalExactPairMappingRow>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.misspelling_normalized !== "string" ||
    typeof candidate.correct_spelling_normalized !== "string" ||
    typeof candidate.micro_skill_key !== "string" ||
    candidate.mapping_status !== "active" ||
    (
      candidate.resolver_visibility_status !== "hidden" &&
      candidate.resolver_visibility_status !== "visible" &&
      candidate.resolver_visibility_status !== "disabled"
    )
  ) {
    return null;
  }

  return {
    id: candidate.id,
    misspelling_normalized: candidate.misspelling_normalized,
    correct_spelling_normalized: candidate.correct_spelling_normalized,
    micro_skill_key: candidate.micro_skill_key,
    mapping_status: candidate.mapping_status,
    resolver_visibility_status: candidate.resolver_visibility_status,
  };
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

async function setResolverVisibilityForCanonicalMappingAdmin(input: {
  supabase?: ServiceRoleClient;
  targetStatus: "visible" | "disabled";
  mapping: SetResolverVisibilityForCanonicalMappingInput;
}) {
  const supabase = input.supabase ?? createServiceRoleClient();
  const { mapping } = input;

  const { data, error } = await supabase.rpc(
    "set_spelling_canonical_mapping_resolver_visibility_admin",
    {
      p_admin_email: mapping.adminEmail ?? null,
      p_admin_user_id: mapping.adminUserId,
      p_mapping_id: mapping.mappingId,
      p_metadata: mapping.metadata ?? {},
      p_new_resolver_visibility_status: input.targetStatus,
      p_note: mapping.note,
    },
  );

  if (error) {
    throw new Error(
      error.message || "Failed to update resolver visibility.",
    );
  }

  if (typeof data !== "string") {
    throw new Error("Resolver visibility RPC did not return a mapping id.");
  }

  return data;
}

export async function enableResolverVisibilityForCanonicalMappingAdmin(input: {
  supabase?: ServiceRoleClient;
  mapping: SetResolverVisibilityForCanonicalMappingInput;
}) {
  return setResolverVisibilityForCanonicalMappingAdmin({
    supabase: input.supabase,
    targetStatus: "visible",
    mapping: input.mapping,
  });
}

export async function disableResolverVisibilityForCanonicalMappingAdmin(input: {
  supabase?: ServiceRoleClient;
  mapping: SetResolverVisibilityForCanonicalMappingInput;
}) {
  return setResolverVisibilityForCanonicalMappingAdmin({
    supabase: input.supabase,
    targetStatus: "disabled",
    mapping: input.mapping,
  });
}

export async function adoptSpellingCanonicalMappingRecommendationAdmin(input: {
  supabase?: ServiceRoleClient;
  adoption: AdoptSpellingCanonicalMappingRecommendationInput;
}) {
  const supabase = input.supabase ?? createServiceRoleClient();
  const { adoption } = input;

  const { data, error } = await supabase.rpc(
    "adopt_spelling_canonical_mapping_recommendation_admin",
    {
      p_admin_email: adoption.adminEmail ?? null,
      p_admin_user_id: adoption.adminUserId,
      p_dialect_code: adoption.dialectCode ?? "en-GB",
      p_metadata: {
        ...(adoption.metadata ?? {}),
        resolver_visible: false,
        resolver_visibility_status: "hidden",
      },
      p_normalization_version:
        adoption.normalizationVersion ?? "spelling_normalize_v1",
      p_note: adoption.note,
      p_recommendation_id: adoption.recommendationId,
    },
  );

  if (error) {
    throw new Error(
      error.message || "Failed to adopt PCRM recommendation.",
    );
  }

  if (typeof data !== "string") {
    throw new Error("PCRM canonical adoption RPC did not return a mapping id.");
  }

  return data;
}

export async function adoptSeedImportRowHiddenCanonicalAdmin(input: {
  supabase?: ServiceRoleClient;
  adoption: AdoptSeedImportRowHiddenCanonicalInput;
}) {
  const supabase = input.supabase ?? createServiceRoleClient();
  const { adoption } = input;

  const { data, error } = await supabase.rpc(
    "adopt_seed_import_row_hidden_canonical_admin",
    {
      p_admin_email: adoption.adminEmail ?? null,
      p_admin_user_id: adoption.adminUserId,
      p_metadata: {
        ...(adoption.metadata ?? {}),
        resolver_visible: false,
        resolver_visibility_status: "hidden",
      },
      p_note: adoption.note,
      p_seed_import_row_id: adoption.seedImportRowId,
    },
  );

  if (error) {
    throw new Error(
      error.message || "Failed to adopt seed import row into hidden canonical truth.",
    );
  }

  if (typeof data !== "string") {
    throw new Error("Seed import hidden canonical adoption RPC did not return a mapping id.");
  }

  return data;
}

export async function findRecommendationCanonicalExactPairMappings(input: {
  supabase?: ServiceRoleClient;
  misspellingNormalized: string | null | undefined;
  correctSpellingNormalized: string | null | undefined;
  dialectCode?: string | null;
  normalizationVersion?: string | null;
}): Promise<RecommendationCanonicalExactPairMappingSignal[]> {
  const misspellingNormalized = normalizeLookupText(input.misspellingNormalized);
  const correctSpellingNormalized = normalizeLookupText(
    input.correctSpellingNormalized,
  );

  if (!misspellingNormalized || !correctSpellingNormalized) {
    return [];
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
        "resolver_visibility_status",
      ].join(", "),
    )
    .eq("misspelling_normalized", misspellingNormalized)
    .eq("correct_spelling_normalized", correctSpellingNormalized)
    .eq("dialect_code", dialectCode)
    .eq("normalization_version", normalizationVersion)
    .eq("mapping_status", "active")
    .order("created_at", { ascending: true });

  if (mappingError) {
    throw new Error(
      mappingError.message ||
        "Failed to read recommendation canonical exact-pair mappings.",
    );
  }

  const mappings = ((mappingRows ?? []) as unknown[])
    .map((row) => normaliseRecommendationCanonicalExactPairMappingRow(row))
    .filter(Boolean) as RecommendationCanonicalExactPairMappingRow[];

  if (mappings.length === 0) {
    return [];
  }

  const candidateMicroSkillKeys = dedupeStrings(
    mappings.map((mapping) => mapping.micro_skill_key),
  );

  const { data: microSkillRows, error: microSkillError } = await supabase
    .from("micro_skill_catalog")
    .select("micro_skill_key")
    .in("micro_skill_key", candidateMicroSkillKeys)
    .eq("mastery_domain_key", "D4")
    .eq("is_active", true)
    .eq("is_assignable", true);

  if (microSkillError) {
    throw new Error(
      microSkillError.message ||
        "Failed to validate recommendation canonical exact-pair micro-skills.",
    );
  }

  const validMicroSkillKeys = new Set(
    ((microSkillRows ?? []) as unknown[])
      .map((row) => row as Partial<ResolverVisibleMicroSkillRow>)
      .map((row) => row.micro_skill_key)
      .filter((value): value is string => typeof value === "string"),
  );
  const selectedByMicroSkill = new Map<string, RecommendationCanonicalExactPairMappingRow>();

  for (const mapping of mappings) {
    if (!validMicroSkillKeys.has(mapping.micro_skill_key)) {
      continue;
    }

    if (!selectedByMicroSkill.has(mapping.micro_skill_key)) {
      selectedByMicroSkill.set(mapping.micro_skill_key, mapping);
    }
  }

  return [...selectedByMicroSkill.values()].map((mapping) => ({
    mappingId: mapping.id,
    misspellingNormalized: mapping.misspelling_normalized,
    correctSpellingNormalized: mapping.correct_spelling_normalized,
    microSkillKey: mapping.micro_skill_key,
    resolverVisibilityStatus: mapping.resolver_visibility_status,
  }));
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
