import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

type OptionalRows<T> = {
  rows: T[];
  available: boolean;
  error?: string;
};

type SupabaseLike = {
  from(table: string): any;
};

type MisspellingInstanceRow = {
  id: string;
  writing_sample_id: string;
  child_id: string;
  parent_user_id: string;
  misspelled_word: string;
  corrected_word: string;
  context_text: string | null;
  error_type: string | null;
  secondary_error_type: string | null;
  confidence_score: number | null;
  suggested_word: string | null;
  is_parent_overridden: boolean;
  is_false_positive: boolean;
  created_at: string;
};

type WritingIssueSuggestionRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  misspelling_instance_id: string | null;
  source_type: string;
  suggestion_status: string;
  observed_text: string | null;
  suggested_replacement: string | null;
  context_text: string | null;
  suggested_micro_skill_key: string;
  metadata: JsonRecord;
  created_at: string;
};

type WritingIssueRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  source_suggestion_id: string | null;
  source_misspelling_instance_id: string | null;
  issue_status: string;
  final_classification: string | null;
  observed_text: string | null;
  suggested_replacement: string | null;
  approved_replacement: string | null;
  context_text: string | null;
  micro_skill_key: string;
  metadata: JsonRecord;
  created_at: string;
};

type CandidateMappingRow = {
  id: string;
  parent_user_id: string;
  child_id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  source_suggestion_id: string | null;
  source_misspelling_instance_id: string | null;
  source_provenance: string;
  reviewed_event_source_entity_id: string;
  original_child_spelling: string | null;
  original_correct_spelling: string | null;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  candidate_status: string;
  promotion_scope: string;
  metadata: JsonRecord;
  created_at: string;
};

type CatalogReviewCaseRow = {
  id: string;
  parent_user_id: string;
  child_id: string;
  task_submission_id: string;
  writing_sample_id: string | null;
  source_suggestion_id: string | null;
  source_misspelling_instance_id: string;
  source_provenance: string;
  reviewed_event_source_entity_id: string;
  original_child_spelling: string | null;
  original_correct_spelling: string | null;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  case_status: string;
  metadata: JsonRecord;
  created_at: string;
};

type PcrmRecommendationRow = {
  id: string;
  parent_user_id: string;
  child_id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  source_misspelling_instance_id: string | null;
  source_writing_issue_id: string | null;
  source_correction_attempt_id: string | null;
  parent_verification_id: string | null;
  source_suggestion_id: string | null;
  candidate_mapping_id: string | null;
  source_row_type: string;
  source_provenance: string;
  reviewed_event_source_entity_id: string | null;
  original_child_spelling: string | null;
  original_correct_spelling: string | null;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  recommendation_status: string;
  canonical_mapping_id: string | null;
  metadata: JsonRecord;
  created_at: string;
};

type CanonicalMappingRow = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  mapping_status: string;
  dialect_code: string;
  normalization_version: string;
  metadata: JsonRecord;
  created_at: string;
};

type MicroSkillCatalogRow = {
  id: string;
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string | null;
  micro_skill_key: string;
  display_name: string;
  practice_route: string;
  is_assignable: boolean;
  is_active: boolean;
  metadata: JsonRecord;
  created_at: string;
};

type LearningItemRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  source_writing_issue_id: string | null;
  micro_skill_key: string;
  progress_state: string;
  is_active: boolean;
  practice_route: string | null;
  review_due_at: string | null;
  metadata: JsonRecord;
  created_at: string;
};

type WordMapDiagnosticExampleRow = {
  id: string;
  misspelling_normalised: string;
  correction_normalised: string;
  micro_skill_key: string;
  confidence: string;
  row_status: string;
  review_status: string | null;
  resolver_visible_candidate: boolean;
  created_at: string;
};

type WordMapWordRow = {
  id: string;
  micro_skill_key: string;
  normalised_word: string;
  word_role: string;
  micro_skill_role: string;
  practice_route: string;
  row_status: string;
  review_status: string | null;
  approved_for_assignment: boolean;
  created_at: string;
};

type RouteSupportRow = {
  id: string;
  micro_skill_key: string;
  route: string;
  row_status: string;
  review_status: string | null;
  enabled_for_mvp: boolean;
  created_at: string;
};

type AuditData = {
  misspellings: MisspellingInstanceRow[];
  suggestions: WritingIssueSuggestionRow[];
  issues: WritingIssueRow[];
  candidateMappings: CandidateMappingRow[];
  catalogReviewCases: CatalogReviewCaseRow[];
  pcrmRecommendations: OptionalRows<PcrmRecommendationRow>;
  canonicalMappings: CanonicalMappingRow[];
  microSkills: MicroSkillCatalogRow[];
  learningItems: LearningItemRow[];
  wordMapDiagnosticExamples: OptionalRows<WordMapDiagnosticExampleRow>;
  wordMapWords: OptionalRows<WordMapWordRow>;
  wordMapRouteSupport: OptionalRows<RouteSupportRow>;
};

type PairAggregate = {
  misspelling: string;
  correction: string;
  key: string;
  rawMisspellingCount: number;
  suggestionCount: number;
  issueCount: number;
  unresolvedSuggestionCount: number;
  unresolvedIssueCount: number;
  unknownMicroSkillCount: number;
  parentAddedCount: number;
  parentLocalPromotedCount: number;
  pendingCandidateCount: number;
  openCatalogCaseCount: number;
  acceptedUnadoptedPcrmCount: number;
  activeCanonicalCount: number;
  wordMapDiagnosticCount: number;
  falsePositiveCount: number;
  wordLevelOnlyCount: number;
  microSkillCounts: Map<string, number>;
  sourceIds: {
    misspellingInstanceIds: string[];
    suggestionIds: string[];
    writingIssueIds: string[];
    candidateMappingIds: string[];
    catalogCaseIds: string[];
    pcrmRecommendationIds: string[];
    canonicalMappingIds: string[];
    wordMapDiagnosticExampleIds: string[];
  };
};

type RankedOpportunity = {
  rank: number;
  score: number;
  misspelling: string;
  correction: string;
  evidenceCount: number;
  unresolvedCount: number;
  parentAddedCount: number;
  parentLocalPromotedCount: number;
  openCatalogCaseCount: number;
  acceptedUnadoptedPcrmCount: number;
  wordMapDiagnosticCount: number;
  falsePositiveCount: number;
  wordLevelOnlyCount: number;
  activeCanonicalCount: number;
  suggestedMicroSkillKeys: Array<{
    microSkillKey: string;
    count: number;
    catalogStatus: string;
  }>;
  recommendedReviewAction: string;
  safetyBoundary: string;
  sampleIds: PairAggregate["sourceIds"];
};

const READ_PAGE_SIZE = 1000;
const QUERY_TIMEOUT_MS = 10_000;
const TOP_LIMIT = 50;
const MUTATION_METHODS = new Set(["insert", "update", "upsert", "delete"]);
const OPTIONAL_MISSING_CODES = new Set(["42P01", "PGRST205"]);
const UNKNOWN_SKILL_VALUES = new Set(["", "unknown", "no_matching_skill"]);
const PROTECTED_TABLES = [
  "misspelling_instances",
  "writing_issue_suggestions",
  "writing_issues",
  "parent_verified_spelling_candidate_mappings",
  "spelling_catalog_review_cases",
  "spelling_canonical_mapping_recommendations",
  "spelling_canonical_mappings",
  "micro_skill_catalog",
  "learning_items",
  "assignment_items",
] as const;

function loadDotEnvLocal() {
  if (!existsSync(".env.local")) {
    return;
  }

  const content = readFileSync(".env.local", "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValueParts] = trimmed.split("=");
    const key = rawKey.trim();

    if (process.env[key]) {
      continue;
    }

    const rawValue = rawValueParts.join("=").trim();
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function isLocalSupabaseUrl(url: string) {
  const parsed = new URL(url);
  return (
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
    parsed.port === "54321"
  );
}

function getAuditConfig() {
  const url =
    readEnv("SPELLING_POPULATION_AUDIT_SUPABASE_URL") ??
    readEnv("NEXT_PUBLIC_SUPABASE_URL") ??
    "http://127.0.0.1:54321";
  const key =
    readEnv("SPELLING_POPULATION_AUDIT_SUPABASE_KEY") ??
    readEnv("SUPABASE_SERVICE_ROLE_KEY") ??
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!key) {
    throw new Error(
      "Missing Supabase key. Set SPELLING_POPULATION_AUDIT_SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const local = isLocalSupabaseUrl(url);
  const hostedReadOnlyApproved =
    readEnv("SPELLING_POPULATION_AUDIT_ALLOW_HOSTED_READ_ONLY") === "true";

  if (!local && !hostedReadOnlyApproved) {
    throw new Error(
      `Refusing hosted/non-local audit target without SPELLING_POPULATION_AUDIT_ALLOW_HOSTED_READ_ONLY=true: ${url}`,
    );
  }

  return {
    url,
    key,
    target: local ? "local_dev" : "hosted_read_only_explicit",
  } as const;
}

function createReadOnlySupabase(url: string, key: string) {
  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "rpc") {
        return () => {
          throw new Error("Read-only spelling population audit refuses rpc calls.");
        };
      }

      if (property === "from") {
        return (table: string) => {
          const builder = target.from(table);

          return new Proxy(builder, {
            get(builderTarget, builderProperty, builderReceiver) {
              if (
                typeof builderProperty === "string" &&
                MUTATION_METHODS.has(builderProperty)
              ) {
                return () => {
                  throw new Error(
                    `Read-only spelling population audit refuses ${builderProperty} on ${table}.`,
                  );
                };
              }

              return Reflect.get(builderTarget, builderProperty, builderReceiver);
            },
          });
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

async function fetchAll<T>({
  supabase,
  table,
  select,
  orderColumn = "created_at",
}: {
  supabase: SupabaseLike;
  table: string;
  select: string;
  orderColumn?: string;
}): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += READ_PAGE_SIZE) {
    const to = from + READ_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: true })
      .range(from, to)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

    if (error) {
      throw new Error(`Unable to read ${table}: ${error.message}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < READ_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function fetchOptionalAll<T>({
  supabase,
  table,
  select,
  orderColumn = "created_at",
}: {
  supabase: SupabaseLike;
  table: string;
  select: string;
  orderColumn?: string;
}): Promise<OptionalRows<T>> {
  try {
    const rows = await fetchAll<T>({ supabase, table, select, orderColumn });
    return { rows, available: true };
  } catch (error) {
    const candidate = error as { code?: string; message?: string };
    const message = candidate.message ?? String(error);
    const missingByMessage =
      message.includes("does not exist") ||
      message.includes("Could not find the table");

    if (
      (candidate.code && OPTIONAL_MISSING_CODES.has(candidate.code)) ||
      missingByMessage
    ) {
      return { rows: [], available: false, error: message };
    }

    throw error;
  }
}

async function countRows(supabase: SupabaseLike, table: string) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

  if (error) {
    const code = (error as { code?: string }).code;
    const missingByMessage =
      error.message.includes("does not exist") ||
      error.message.includes("Could not find the table");

    if ((code && OPTIONAL_MISSING_CODES.has(code)) || missingByMessage) {
      return null;
    }

    throw new Error(`Unable to count ${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function readGuardCounts(supabase: SupabaseLike) {
  const entries = await Promise.all(
    PROTECTED_TABLES.map(async (table) => [
      table,
      await countRows(supabase, table),
    ] as const),
  );

  return Object.fromEntries(entries) as Record<(typeof PROTECTED_TABLES)[number], number | null>;
}

async function loadAuditData(supabase: SupabaseLike): Promise<AuditData> {
  const [
    misspellings,
    suggestions,
    issues,
    candidateMappings,
    catalogReviewCases,
    pcrmRecommendations,
    canonicalMappings,
    microSkills,
    learningItems,
    wordMapDiagnosticExamples,
    wordMapWords,
    wordMapRouteSupport,
  ] = await Promise.all([
    fetchAll<MisspellingInstanceRow>({
      supabase,
      table: "misspelling_instances",
      select:
        "id, writing_sample_id, child_id, parent_user_id, misspelled_word, corrected_word, context_text, error_type, secondary_error_type, confidence_score, suggested_word, is_parent_overridden, is_false_positive, created_at",
    }),
    fetchAll<WritingIssueSuggestionRow>({
      supabase,
      table: "writing_issue_suggestions",
      select:
        "id, child_id, parent_user_id, task_submission_id, writing_sample_id, misspelling_instance_id, source_type, suggestion_status, observed_text, suggested_replacement, context_text, suggested_micro_skill_key, metadata, created_at",
    }),
    fetchAll<WritingIssueRow>({
      supabase,
      table: "writing_issues",
      select:
        "id, child_id, parent_user_id, task_submission_id, writing_sample_id, source_suggestion_id, source_misspelling_instance_id, issue_status, final_classification, observed_text, suggested_replacement, approved_replacement, context_text, micro_skill_key, metadata, created_at",
    }),
    fetchAll<CandidateMappingRow>({
      supabase,
      table: "parent_verified_spelling_candidate_mappings",
      select:
        "id, parent_user_id, child_id, task_submission_id, writing_sample_id, source_suggestion_id, source_misspelling_instance_id, source_provenance, reviewed_event_source_entity_id, original_child_spelling, original_correct_spelling, misspelling_normalized, correct_spelling_normalized, micro_skill_key, candidate_status, promotion_scope, metadata, created_at",
    }),
    fetchAll<CatalogReviewCaseRow>({
      supabase,
      table: "spelling_catalog_review_cases",
      select:
        "id, parent_user_id, child_id, task_submission_id, writing_sample_id, source_suggestion_id, source_misspelling_instance_id, source_provenance, reviewed_event_source_entity_id, original_child_spelling, original_correct_spelling, misspelling_normalized, correct_spelling_normalized, case_status, metadata, created_at",
    }),
    fetchOptionalAll<PcrmRecommendationRow>({
      supabase,
      table: "spelling_canonical_mapping_recommendations",
      select:
        "id, parent_user_id, child_id, task_submission_id, writing_sample_id, source_misspelling_instance_id, source_writing_issue_id, source_correction_attempt_id, parent_verification_id, source_suggestion_id, candidate_mapping_id, source_row_type, source_provenance, reviewed_event_source_entity_id, original_child_spelling, original_correct_spelling, misspelling_normalized, correct_spelling_normalized, micro_skill_key, recommendation_status, canonical_mapping_id, metadata, created_at",
    }),
    fetchAll<CanonicalMappingRow>({
      supabase,
      table: "spelling_canonical_mappings",
      select:
        "id, misspelling_normalized, correct_spelling_normalized, micro_skill_key, mapping_status, dialect_code, normalization_version, metadata, created_at",
    }),
    fetchAll<MicroSkillCatalogRow>({
      supabase,
      table: "micro_skill_catalog",
      select:
        "id, mastery_domain_key, skill_family_key, skill_cluster_key, micro_skill_key, display_name, practice_route, is_assignable, is_active, metadata, created_at",
    }),
    fetchAll<LearningItemRow>({
      supabase,
      table: "learning_items",
      select:
        "id, child_id, parent_user_id, source_writing_issue_id, micro_skill_key, progress_state, is_active, practice_route, review_due_at, metadata, created_at",
    }),
    fetchOptionalAll<WordMapDiagnosticExampleRow>({
      supabase,
      table: "canonical_spelling_word_map_diagnostic_examples",
      select:
        "id, misspelling_normalised, correction_normalised, micro_skill_key, confidence, row_status, review_status, resolver_visible_candidate, created_at",
    }),
    fetchOptionalAll<WordMapWordRow>({
      supabase,
      table: "canonical_spelling_word_map_words",
      select:
        "id, micro_skill_key, normalised_word, word_role, micro_skill_role, practice_route, row_status, review_status, approved_for_assignment, created_at",
    }),
    fetchOptionalAll<RouteSupportRow>({
      supabase,
      table: "canonical_spelling_word_map_route_support",
      select:
        "id, micro_skill_key, route, row_status, review_status, enabled_for_mvp, created_at",
    }),
  ]);

  return {
    misspellings,
    suggestions,
    issues,
    candidateMappings,
    catalogReviewCases,
    pcrmRecommendations,
    canonicalMappings,
    microSkills,
    learningItems,
    wordMapDiagnosticExamples,
    wordMapWords,
    wordMapRouteSupport,
  };
}

function normalizeWord(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function pairKey(misspelling: string | null | undefined, correction: string | null | undefined) {
  const normalizedMisspelling = normalizeWord(misspelling);
  const normalizedCorrection = normalizeWord(correction);

  if (!normalizedMisspelling || !normalizedCorrection) {
    return null;
  }

  if (normalizedMisspelling === normalizedCorrection) {
    return null;
  }

  return `${normalizedMisspelling}->${normalizedCorrection}`;
}

function splitPairKey(key: string) {
  const [misspelling, correction] = key.split("->");
  return { misspelling, correction };
}

function isUnknownMicroSkill(value: string | null | undefined) {
  return UNKNOWN_SKILL_VALUES.has((value ?? "").trim().toLowerCase());
}

function isActiveAssignableD4(skill: MicroSkillCatalogRow | undefined) {
  return Boolean(
    skill &&
      skill.mastery_domain_key === "D4" &&
      skill.is_active &&
      skill.is_assignable,
  );
}

function addId(target: string[], id: string | null | undefined) {
  if (id && !target.includes(id)) {
    target.push(id);
  }
}

function ensurePair(aggregates: Map<string, PairAggregate>, key: string) {
  let aggregate = aggregates.get(key);

  if (!aggregate) {
    const { misspelling, correction } = splitPairKey(key);
    aggregate = {
      misspelling,
      correction,
      key,
      rawMisspellingCount: 0,
      suggestionCount: 0,
      issueCount: 0,
      unresolvedSuggestionCount: 0,
      unresolvedIssueCount: 0,
      unknownMicroSkillCount: 0,
      parentAddedCount: 0,
      parentLocalPromotedCount: 0,
      pendingCandidateCount: 0,
      openCatalogCaseCount: 0,
      acceptedUnadoptedPcrmCount: 0,
      activeCanonicalCount: 0,
      wordMapDiagnosticCount: 0,
      falsePositiveCount: 0,
      wordLevelOnlyCount: 0,
      microSkillCounts: new Map(),
      sourceIds: {
        misspellingInstanceIds: [],
        suggestionIds: [],
        writingIssueIds: [],
        candidateMappingIds: [],
        catalogCaseIds: [],
        pcrmRecommendationIds: [],
        canonicalMappingIds: [],
        wordMapDiagnosticExampleIds: [],
      },
    };
    aggregates.set(key, aggregate);
  }

  return aggregate;
}

function addMicroSkillCount(aggregate: PairAggregate, microSkillKey: string | null | undefined) {
  if (isUnknownMicroSkill(microSkillKey)) {
    aggregate.unknownMicroSkillCount += 1;
    return;
  }

  const key = microSkillKey?.trim();
  if (!key) {
    aggregate.unknownMicroSkillCount += 1;
    return;
  }

  aggregate.microSkillCounts.set(key, (aggregate.microSkillCounts.get(key) ?? 0) + 1);
}

function pairSummary(aggregate: PairAggregate, microSkillsByKey: Map<string, MicroSkillCatalogRow>) {
  const evidenceCount =
    aggregate.rawMisspellingCount +
    aggregate.suggestionCount +
    aggregate.issueCount +
    aggregate.pendingCandidateCount +
    aggregate.parentLocalPromotedCount +
    aggregate.openCatalogCaseCount +
    aggregate.acceptedUnadoptedPcrmCount +
    aggregate.wordMapDiagnosticCount;
  const unresolvedCount =
    aggregate.unresolvedSuggestionCount +
    aggregate.unresolvedIssueCount +
    aggregate.pendingCandidateCount +
    aggregate.openCatalogCaseCount +
    aggregate.acceptedUnadoptedPcrmCount;

  return {
    misspelling: aggregate.misspelling,
    correction: aggregate.correction,
    evidenceCount,
    unresolvedCount,
    rawMisspellingCount: aggregate.rawMisspellingCount,
    suggestionCount: aggregate.suggestionCount,
    issueCount: aggregate.issueCount,
    parentAddedCount: aggregate.parentAddedCount,
    parentLocalPromotedCount: aggregate.parentLocalPromotedCount,
    openCatalogCaseCount: aggregate.openCatalogCaseCount,
    acceptedUnadoptedPcrmCount: aggregate.acceptedUnadoptedPcrmCount,
    wordMapDiagnosticCount: aggregate.wordMapDiagnosticCount,
    falsePositiveCount: aggregate.falsePositiveCount,
    wordLevelOnlyCount: aggregate.wordLevelOnlyCount,
    activeCanonicalCount: aggregate.activeCanonicalCount,
    microSkillCandidates: [...aggregate.microSkillCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([microSkillKey, count]) => {
        const skill = microSkillsByKey.get(microSkillKey);
        return {
          microSkillKey,
          count,
          catalogStatus: isActiveAssignableD4(skill)
            ? "active_assignable_d4"
            : skill
              ? "not_active_assignable_d4"
              : "missing_catalog_row",
        };
      }),
    sampleIds: aggregate.sourceIds,
  };
}

function scoreOpportunity(aggregate: PairAggregate) {
  const evidenceCount =
    aggregate.rawMisspellingCount +
    aggregate.suggestionCount +
    aggregate.issueCount +
    aggregate.pendingCandidateCount +
    aggregate.parentLocalPromotedCount +
    aggregate.openCatalogCaseCount +
    aggregate.acceptedUnadoptedPcrmCount +
    aggregate.wordMapDiagnosticCount;
  const unresolvedCount =
    aggregate.unresolvedSuggestionCount +
    aggregate.unresolvedIssueCount +
    aggregate.pendingCandidateCount +
    aggregate.openCatalogCaseCount +
    aggregate.acceptedUnadoptedPcrmCount;

  return (
    evidenceCount * 3 +
    unresolvedCount * 5 +
    aggregate.parentAddedCount * 3 +
    aggregate.parentLocalPromotedCount * 4 +
    aggregate.openCatalogCaseCount * 6 +
    aggregate.acceptedUnadoptedPcrmCount * 8 +
    aggregate.wordMapDiagnosticCount * 2 +
    aggregate.unknownMicroSkillCount * 3 -
    aggregate.activeCanonicalCount * 6 -
    aggregate.falsePositiveCount * 5 -
    aggregate.wordLevelOnlyCount * 4
  );
}

function recommendedAction(aggregate: PairAggregate) {
  if (aggregate.acceptedUnadoptedPcrmCount > 0) {
    return "review_accepted_pcrm_for_explicit_admin_adoption";
  }

  if (aggregate.openCatalogCaseCount > 0) {
    return "triage_open_catalog_review_case";
  }

  if (aggregate.parentLocalPromotedCount > 0 && aggregate.activeCanonicalCount === 0) {
    return "consider_parent_local_mapping_for_admin_canonical_review";
  }

  if (aggregate.wordMapDiagnosticCount > 0 && aggregate.activeCanonicalCount === 0) {
    return "compare_word_map_diagnostic_candidate_with_reviewed_evidence";
  }

  if (aggregate.unknownMicroSkillCount > 0) {
    return "rank_micro_skill_suggestions_before_parent_or_admin_confirmation";
  }

  return "review_repeated_pair_for_child_local_or_canonical_mapping";
}

function buildAggregates(data: AuditData) {
  const aggregates = new Map<string, PairAggregate>();

  data.misspellings.forEach((row) => {
    const key = pairKey(row.misspelled_word, row.corrected_word);
    if (!key) {
      return;
    }

    const aggregate = ensurePair(aggregates, key);
    aggregate.rawMisspellingCount += 1;
    addId(aggregate.sourceIds.misspellingInstanceIds, row.id);

    if (row.is_false_positive) {
      aggregate.falsePositiveCount += 1;
    }
  });

  data.suggestions.forEach((row) => {
    const key = pairKey(row.observed_text, row.suggested_replacement);
    if (!key) {
      return;
    }

    const aggregate = ensurePair(aggregates, key);
    aggregate.suggestionCount += 1;
    addId(aggregate.sourceIds.suggestionIds, row.id);
    addMicroSkillCount(aggregate, row.suggested_micro_skill_key);

    if (row.suggestion_status === "pending") {
      aggregate.unresolvedSuggestionCount += 1;
    }

    if (row.source_type === "parent_manual") {
      aggregate.parentAddedCount += 1;
    }
  });

  data.issues.forEach((row) => {
    const key = pairKey(
      row.observed_text,
      row.approved_replacement ?? row.suggested_replacement,
    );
    if (!key) {
      return;
    }

    const aggregate = ensurePair(aggregates, key);
    aggregate.issueCount += 1;
    addId(aggregate.sourceIds.writingIssueIds, row.id);
    addMicroSkillCount(aggregate, row.micro_skill_key);

    if (row.issue_status !== "finalised") {
      aggregate.unresolvedIssueCount += 1;
    }

    if (row.final_classification === "not_an_issue") {
      aggregate.falsePositiveCount += 1;
    }
  });

  data.candidateMappings.forEach((row) => {
    const key = pairKey(row.misspelling_normalized, row.correct_spelling_normalized);
    if (!key) {
      return;
    }

    const aggregate = ensurePair(aggregates, key);
    addId(aggregate.sourceIds.candidateMappingIds, row.id);
    addMicroSkillCount(aggregate, row.micro_skill_key);

    if (row.candidate_status === "parent_local_promoted") {
      aggregate.parentLocalPromotedCount += 1;
    } else if (row.candidate_status === "pending_parent_promotion") {
      aggregate.pendingCandidateCount += 1;
    }

    if (row.source_provenance === "lesson_submission_parent_added_missed_word") {
      aggregate.parentAddedCount += 1;
    }
  });

  data.catalogReviewCases.forEach((row) => {
    const key = pairKey(row.misspelling_normalized, row.correct_spelling_normalized);
    if (!key) {
      return;
    }

    const aggregate = ensurePair(aggregates, key);
    addId(aggregate.sourceIds.catalogCaseIds, row.id);

    if (row.case_status === "open") {
      aggregate.openCatalogCaseCount += 1;
    }

    if (row.case_status === "word_level_only") {
      aggregate.wordLevelOnlyCount += 1;
    }

    if (row.case_status === "not_a_learning_issue") {
      aggregate.falsePositiveCount += 1;
    }

    if (row.source_provenance === "lesson_submission_parent_added_missed_word") {
      aggregate.parentAddedCount += 1;
    }
  });

  data.pcrmRecommendations.rows.forEach((row) => {
    const key = pairKey(row.misspelling_normalized, row.correct_spelling_normalized);
    if (!key) {
      return;
    }

    const aggregate = ensurePair(aggregates, key);
    addId(aggregate.sourceIds.pcrmRecommendationIds, row.id);
    addMicroSkillCount(aggregate, row.micro_skill_key);

    if (row.recommendation_status === "accepted" && !row.canonical_mapping_id) {
      aggregate.acceptedUnadoptedPcrmCount += 1;
    }
  });

  data.canonicalMappings.forEach((row) => {
    const key = pairKey(row.misspelling_normalized, row.correct_spelling_normalized);
    if (!key) {
      return;
    }

    const aggregate = ensurePair(aggregates, key);
    addId(aggregate.sourceIds.canonicalMappingIds, row.id);
    addMicroSkillCount(aggregate, row.micro_skill_key);

    if (row.mapping_status === "active") {
      aggregate.activeCanonicalCount += 1;
    }
  });

  data.wordMapDiagnosticExamples.rows.forEach((row) => {
    const key = pairKey(row.misspelling_normalised, row.correction_normalised);
    if (!key || row.row_status !== "active") {
      return;
    }

    const aggregate = ensurePair(aggregates, key);
    aggregate.wordMapDiagnosticCount += 1;
    addId(aggregate.sourceIds.wordMapDiagnosticExampleIds, row.id);
    addMicroSkillCount(aggregate, row.micro_skill_key);
  });

  return aggregates;
}

function summarizeUnknownMicroSkillRows(data: AuditData) {
  return {
    suggestions: data.suggestions
      .filter((row) => isUnknownMicroSkill(row.suggested_micro_skill_key))
      .slice(0, TOP_LIMIT)
      .map((row) => ({
        id: row.id,
        sourceType: row.source_type,
        suggestionStatus: row.suggestion_status,
        pair: pairKey(row.observed_text, row.suggested_replacement),
        createdAt: row.created_at,
      })),
    issues: data.issues
      .filter((row) => isUnknownMicroSkill(row.micro_skill_key))
      .slice(0, TOP_LIMIT)
      .map((row) => ({
        id: row.id,
        issueStatus: row.issue_status,
        finalClassification: row.final_classification,
        pair: pairKey(row.observed_text, row.approved_replacement ?? row.suggested_replacement),
        createdAt: row.created_at,
      })),
    learningItems: data.learningItems
      .filter((row) => isUnknownMicroSkill(row.micro_skill_key))
      .slice(0, TOP_LIMIT)
      .map((row) => ({
        id: row.id,
        isActive: row.is_active,
        progressState: row.progress_state,
        sourceWritingIssueId: row.source_writing_issue_id,
        createdAt: row.created_at,
      })),
  };
}

function summarizeMissingD4Coverage(data: AuditData) {
  const microSkillsByKey = new Map(
    data.microSkills.map((skill) => [skill.micro_skill_key, skill]),
  );

  const referencedKeys = new Map<string, Set<string>>();
  const addReference = (microSkillKey: string | null | undefined, source: string) => {
    if (isUnknownMicroSkill(microSkillKey)) {
      return;
    }

    const key = microSkillKey?.trim();
    if (!key) {
      return;
    }

    referencedKeys.set(key, new Set([...(referencedKeys.get(key) ?? []), source]));
  };

  data.suggestions.forEach((row) =>
    addReference(row.suggested_micro_skill_key, "writing_issue_suggestions"),
  );
  data.issues.forEach((row) => addReference(row.micro_skill_key, "writing_issues"));
  data.candidateMappings.forEach((row) =>
    addReference(row.micro_skill_key, "parent_verified_spelling_candidate_mappings"),
  );
  data.catalogReviewCases.forEach((row) => {
    const linkedSkill = typeof row.metadata?.linked_micro_skill_key === "string"
      ? row.metadata.linked_micro_skill_key
      : null;
    addReference(linkedSkill, "spelling_catalog_review_cases.metadata");
  });
  data.pcrmRecommendations.rows.forEach((row) =>
    addReference(row.micro_skill_key, "spelling_canonical_mapping_recommendations"),
  );
  data.canonicalMappings.forEach((row) =>
    addReference(row.micro_skill_key, "spelling_canonical_mappings"),
  );
  data.wordMapDiagnosticExamples.rows.forEach((row) =>
    addReference(row.micro_skill_key, "canonical_spelling_word_map_diagnostic_examples"),
  );
  data.wordMapWords.rows.forEach((row) =>
    addReference(row.micro_skill_key, "canonical_spelling_word_map_words"),
  );
  data.wordMapRouteSupport.rows.forEach((row) =>
    addReference(row.micro_skill_key, "canonical_spelling_word_map_route_support"),
  );

  return [...referencedKeys.entries()]
    .flatMap(([microSkillKey, sources]) => {
      const skill = microSkillsByKey.get(microSkillKey);
      if (isActiveAssignableD4(skill)) {
        return [];
      }

      return [{
        microSkillKey,
        catalogStatus: skill
          ? {
              masteryDomainKey: skill.mastery_domain_key,
              isActive: skill.is_active,
              isAssignable: skill.is_assignable,
              displayName: skill.display_name,
            }
          : "missing_catalog_row",
        referencedBy: [...sources].sort(),
      }];
    })
    .sort((left, right) => left.microSkillKey.localeCompare(right.microSkillKey))
    .slice(0, TOP_LIMIT);
}

function summarizeRepeatedCorrectionTargets(aggregates: Map<string, PairAggregate>) {
  const grouped = new Map<string, PairAggregate[]>();

  aggregates.forEach((aggregate) => {
    grouped.set(aggregate.correction, [
      ...(grouped.get(aggregate.correction) ?? []),
      aggregate,
    ]);
  });

  return [...grouped.entries()]
    .map(([correction, pairs]) => ({
      correction,
      pairCount: pairs.length,
      totalEvidenceCount: pairs.reduce(
        (total, pair) =>
          total +
          pair.rawMisspellingCount +
          pair.suggestionCount +
          pair.issueCount +
          pair.parentLocalPromotedCount +
          pair.openCatalogCaseCount +
          pair.acceptedUnadoptedPcrmCount,
        0,
      ),
      pairs: pairs
        .sort((left, right) => scoreOpportunity(right) - scoreOpportunity(left))
        .slice(0, 10)
        .map((pair) => ({
          misspelling: pair.misspelling,
          unresolvedCount:
            pair.unresolvedIssueCount +
            pair.unresolvedSuggestionCount +
            pair.pendingCandidateCount +
            pair.openCatalogCaseCount,
        })),
    }))
    .filter((row) => row.pairCount > 1 || row.totalEvidenceCount > 1)
    .sort(
      (left, right) =>
        right.totalEvidenceCount - left.totalEvidenceCount ||
        right.pairCount - left.pairCount ||
        left.correction.localeCompare(right.correction),
    )
    .slice(0, TOP_LIMIT);
}

function summarizeRepeatedPatternCandidates(
  aggregates: Map<string, PairAggregate>,
  microSkillsByKey: Map<string, MicroSkillCatalogRow>,
) {
  const grouped = new Map<string, PairAggregate[]>();

  aggregates.forEach((aggregate) => {
    aggregate.microSkillCounts.forEach((_count, microSkillKey) => {
      grouped.set(microSkillKey, [
        ...(grouped.get(microSkillKey) ?? []),
        aggregate,
      ]);
    });
  });

  return [...grouped.entries()]
    .map(([microSkillKey, pairs]) => {
      const skill = microSkillsByKey.get(microSkillKey);
      return {
        microSkillKey,
        displayName: skill?.display_name ?? null,
        catalogStatus: isActiveAssignableD4(skill)
          ? "active_assignable_d4"
          : skill
            ? "not_active_assignable_d4"
            : "missing_catalog_row",
        pairCount: pairs.length,
        unresolvedCount: pairs.reduce(
          (total, pair) =>
            total +
            pair.unresolvedIssueCount +
            pair.unresolvedSuggestionCount +
            pair.pendingCandidateCount +
            pair.openCatalogCaseCount +
            pair.acceptedUnadoptedPcrmCount,
          0,
        ),
        examplePairs: pairs
          .sort((left, right) => scoreOpportunity(right) - scoreOpportunity(left))
          .slice(0, 10)
          .map((pair) => `${pair.misspelling}->${pair.correction}`),
      };
    })
    .filter((row) => row.pairCount > 1 || row.unresolvedCount > 0)
    .sort(
      (left, right) =>
        right.unresolvedCount - left.unresolvedCount ||
        right.pairCount - left.pairCount ||
        left.microSkillKey.localeCompare(right.microSkillKey),
    )
    .slice(0, TOP_LIMIT);
}

function summarizeAudit(data: AuditData, writeGuardBefore: Record<string, number | null>, writeGuardAfter: Record<string, number | null>) {
  const microSkillsByKey = new Map(
    data.microSkills.map((skill) => [skill.micro_skill_key, skill]),
  );
  const aggregates = buildAggregates(data);
  const pairSummaries = [...aggregates.values()].map((aggregate) =>
    pairSummary(aggregate, microSkillsByKey),
  );
  const topOpportunities: RankedOpportunity[] = [...aggregates.values()]
    .map((aggregate) => ({
      aggregate,
      score: scoreOpportunity(aggregate),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.aggregate.openCatalogCaseCount - left.aggregate.openCatalogCaseCount ||
        left.aggregate.key.localeCompare(right.aggregate.key),
    )
    .slice(0, TOP_LIMIT)
    .map(({ aggregate, score }, index) => {
      const summary = pairSummary(aggregate, microSkillsByKey);
      return {
        rank: index + 1,
        score,
        misspelling: aggregate.misspelling,
        correction: aggregate.correction,
        evidenceCount: summary.evidenceCount,
        unresolvedCount: summary.unresolvedCount,
        parentAddedCount: aggregate.parentAddedCount,
        parentLocalPromotedCount: aggregate.parentLocalPromotedCount,
        openCatalogCaseCount: aggregate.openCatalogCaseCount,
        acceptedUnadoptedPcrmCount: aggregate.acceptedUnadoptedPcrmCount,
        wordMapDiagnosticCount: aggregate.wordMapDiagnosticCount,
        falsePositiveCount: aggregate.falsePositiveCount,
        wordLevelOnlyCount: aggregate.wordLevelOnlyCount,
        activeCanonicalCount: aggregate.activeCanonicalCount,
        suggestedMicroSkillKeys: summary.microSkillCandidates.slice(0, 3),
        recommendedReviewAction: recommendedAction(aggregate),
        safetyBoundary:
          "audit_only_candidate; parent/admin confirmation still required before reusable truth",
        sampleIds: aggregate.sourceIds,
      };
    });

  const guardUnchanged = JSON.stringify(writeGuardBefore) === JSON.stringify(writeGuardAfter);

  return {
    counts: {
      misspellingInstances: data.misspellings.length,
      writingIssueSuggestions: data.suggestions.length,
      writingIssues: data.issues.length,
      parentVerifiedCandidateMappings: data.candidateMappings.length,
      spellingCatalogReviewCases: data.catalogReviewCases.length,
      spellingCanonicalMappingRecommendations: data.pcrmRecommendations.rows.length,
      spellingCanonicalMappings: data.canonicalMappings.length,
      microSkillCatalogRows: data.microSkills.length,
      activeAssignableD4MicroSkills: data.microSkills.filter(isActiveAssignableD4).length,
      learningItems: data.learningItems.length,
      canonicalWordMapDiagnosticExamples: data.wordMapDiagnosticExamples.rows.length,
      canonicalWordMapWords: data.wordMapWords.rows.length,
      canonicalWordMapRouteSupport: data.wordMapRouteSupport.rows.length,
    },
    tableAvailability: {
      spellingCanonicalMappingRecommendations: {
        available: data.pcrmRecommendations.available,
        error: data.pcrmRecommendations.error ?? null,
      },
      canonicalWordMapDiagnosticExamples: {
        available: data.wordMapDiagnosticExamples.available,
        error: data.wordMapDiagnosticExamples.error ?? null,
      },
      canonicalWordMapWords: {
        available: data.wordMapWords.available,
        error: data.wordMapWords.error ?? null,
      },
      canonicalWordMapRouteSupport: {
        available: data.wordMapRouteSupport.available,
        error: data.wordMapRouteSupport.error ?? null,
      },
    },
    writeGuard: {
      protectedTableCountsBefore: writeGuardBefore,
      protectedTableCountsAfter: writeGuardAfter,
      countsUnchanged: guardUnchanged,
    },
    audit: {
      unresolvedSpellingPairs: pairSummaries
        .filter((row) => row.unresolvedCount > 0)
        .sort(
          (left, right) =>
            right.unresolvedCount - left.unresolvedCount ||
            right.evidenceCount - left.evidenceCount ||
            left.misspelling.localeCompare(right.misspelling),
        )
        .slice(0, TOP_LIMIT),
      unknownMicroSkillRows: summarizeUnknownMicroSkillRows(data),
      repeatedMisspellingCorrectionPairs: pairSummaries
        .filter((row) => row.evidenceCount > 1)
        .sort(
          (left, right) =>
            right.evidenceCount - left.evidenceCount ||
            right.unresolvedCount - left.unresolvedCount ||
            left.misspelling.localeCompare(right.misspelling),
        )
        .slice(0, TOP_LIMIT),
      repeatedCorrectionTargets: summarizeRepeatedCorrectionTargets(aggregates),
      repeatedPatternMicroSkillCandidates: summarizeRepeatedPatternCandidates(
        aggregates,
        microSkillsByKey,
      ),
      parentAddedRowsNotYetReusable: pairSummaries
        .filter((row) => row.parentAddedCount > 0 && row.parentLocalPromotedCount === 0)
        .slice(0, TOP_LIMIT),
      parentLocalMappingsThatMayMeritAdminCanonicalReview: pairSummaries
        .filter((row) => row.parentLocalPromotedCount > 0 && row.activeCanonicalCount === 0)
        .slice(0, TOP_LIMIT),
      openCatalogReviewCases: pairSummaries
        .filter((row) => row.openCatalogCaseCount > 0)
        .slice(0, TOP_LIMIT),
      acceptedUnadoptedPcrmRecommendations: pairSummaries
        .filter((row) => row.acceptedUnadoptedPcrmCount > 0)
        .slice(0, TOP_LIMIT),
      wordLevelOnlyCandidates: pairSummaries
        .filter((row) => row.wordLevelOnlyCount > 0)
        .slice(0, TOP_LIMIT),
      likelyFalsePositives: pairSummaries
        .filter((row) => row.falsePositiveCount > 0)
        .slice(0, TOP_LIMIT),
      missingD4MicroSkillCoverage: summarizeMissingD4Coverage(data),
      top50SuggestedMappingMicroSkillSeedOpportunities: topOpportunities,
    },
    safetyBoundaries: [
      "read-only Supabase client proxy refuses rpc, insert, update, upsert, and delete",
      "audit output is candidate evidence only and must not be treated as resolver truth",
      "no Review Work, resolver, assignment generation, mastery, reward, dashboard, analytics, scoring, or template behavior is changed by this script",
      "no unreviewed raw evidence becomes reusable truth",
    ],
  };
}

async function main() {
  loadDotEnvLocal();

  const config = getAuditConfig();
  const supabase = createReadOnlySupabase(config.url, config.key) as unknown as SupabaseLike;
  const writeGuardBefore = await readGuardCounts(supabase);
  const data = await loadAuditData(supabase);
  const writeGuardAfter = await readGuardCounts(supabase);
  const summary = summarizeAudit(data, writeGuardBefore, writeGuardAfter);

  console.log(
    JSON.stringify(
      {
        status: "writing-engine-spelling-population-audit: ok",
        generatedAt: new Date().toISOString(),
        target: config.target,
        ...summary,
      },
      null,
      2,
    ),
  );
}

void main();
