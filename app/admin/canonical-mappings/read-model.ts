import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const CANONICAL_MAPPING_OPERATIONS_PAGE_SIZE = 25;
export const CANONICAL_MAPPING_OPERATIONS_EXPORT_LIMIT = 5000;

export const CANONICAL_MAPPING_STATUS_FILTERS = [
  "all",
  "active",
  "disabled",
  "deprecated",
  "superseded",
] as const;

export const CANONICAL_MAPPING_VISIBILITY_FILTERS = [
  "all",
  "hidden",
  "visible",
  "disabled",
] as const;

export const CANONICAL_MAPPING_SOURCE_FILTERS = [
  "all",
  "catalog",
  "pcrm",
  "seed",
  "direct",
] as const;

export type CanonicalMappingStatusFilter =
  (typeof CANONICAL_MAPPING_STATUS_FILTERS)[number];
export type CanonicalMappingVisibilityFilter =
  (typeof CANONICAL_MAPPING_VISIBILITY_FILTERS)[number];
export type CanonicalMappingSourceFilter =
  (typeof CANONICAL_MAPPING_SOURCE_FILTERS)[number];

export type CanonicalMappingOperationsFilters = {
  page: number;
  q: string;
  status: CanonicalMappingStatusFilter;
  visibility: CanonicalMappingVisibilityFilter;
  source: CanonicalMappingSourceFilter;
};

export type CanonicalMappingOperationsRow = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  mapping_status: string;
  resolver_visibility_status: string;
  dialect_code: string;
  normalization_version: string;
  source_case_id: string | null;
  source_decision_id: string | null;
  source_recommendation_id: string | null;
  source_seed_import_row_id: string | null;
  created_by_admin_email: string | null;
  created_at: string;
  updated_at: string;
  micro_skill_display_name: string | null;
  latest_event_type: string | null;
  latest_event_at: string | null;
  latest_event_admin_email: string | null;
  latest_event_note: string | null;
  event_count: number;
};

export type ReturnedCorrectionReplayRecommendationRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  writing_issue_id: string;
  source_misspelling_instance_id: string | null;
  admin_case_id: string | null;
  canonical_mapping_id: string | null;
  admin_decision_id: string | null;
  micro_skill_key: string | null;
  route_source: string;
  replay_status: string;
  planner_snapshot: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type CanonicalMappingTableRow = Omit<
  CanonicalMappingOperationsRow,
  | "micro_skill_display_name"
  | "latest_event_type"
  | "latest_event_at"
  | "latest_event_admin_email"
  | "latest_event_note"
  | "event_count"
>;

type MicroSkillRow = {
  micro_skill_key: string;
  display_name: string | null;
};

type CanonicalMappingEventRow = {
  id: string;
  mapping_id: string;
  event_type: string;
  admin_email: string | null;
  note: string | null;
  created_at: string;
};

type CanonicalMappingFilterQuery = {
  eq(column: string, value: unknown): CanonicalMappingFilterQuery;
  ilike(column: string, pattern: string): CanonicalMappingFilterQuery;
  is(column: string, value: null): CanonicalMappingFilterQuery;
  not(
    column: string,
    operator: string,
    value: unknown,
  ): CanonicalMappingFilterQuery;
  or(filters: string): CanonicalMappingFilterQuery;
};

export type CanonicalMappingOperationsSummary = {
  totalCount: number;
  activeCount: number;
  visibleCount: number;
  hiddenCount: number;
  disabledVisibilityCount: number;
};

export type CanonicalMappingOperationsPage = {
  filters: CanonicalMappingOperationsFilters;
  rows: CanonicalMappingOperationsRow[];
  replayRecommendations: ReturnedCorrectionReplayRecommendationRow[];
  totalCount: number;
  pageCount: number;
  totalPages: number;
  summary: CanonicalMappingOperationsSummary;
};

function parsePositivePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "1", 10);

  return Number.isFinite(page) && page > 0 ? page : 1;
}

async function fetchReplayRecommendations() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("returned_correction_replay_recommendations")
    .select(
      [
        "id",
        "child_id",
        "parent_user_id",
        "writing_issue_id",
        "source_misspelling_instance_id",
        "admin_case_id",
        "canonical_mapping_id",
        "admin_decision_id",
        "micro_skill_key",
        "route_source",
        "replay_status",
        "planner_snapshot",
        "metadata",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .in("replay_status", ["pending", "blocked"])
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) {
    if ("code" in error && error.code === "PGRST205") {
      return [];
    }

    throw error;
  }

  return (data ?? []) as unknown as ReturnedCorrectionReplayRecommendationRow[];
}

function parseEnum<TValue extends string>(
  value: string | string[] | undefined,
  allowed: readonly TValue[],
  fallback: TValue,
) {
  const raw = Array.isArray(value) ? value[0] : value;

  return allowed.includes(raw as TValue) ? (raw as TValue) : fallback;
}

function parseQuery(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;

  return (raw ?? "").trim().slice(0, 120);
}

export function parseCanonicalMappingOperationsFilters(searchParams?: {
  page?: string | string[];
  q?: string | string[];
  status?: string | string[];
  visibility?: string | string[];
  source?: string | string[];
}): CanonicalMappingOperationsFilters {
  return {
    page: parsePositivePage(searchParams?.page),
    q: parseQuery(searchParams?.q),
    status: parseEnum(searchParams?.status, CANONICAL_MAPPING_STATUS_FILTERS, "all"),
    visibility: parseEnum(
      searchParams?.visibility,
      CANONICAL_MAPPING_VISIBILITY_FILTERS,
      "all",
    ),
    source: parseEnum(searchParams?.source, CANONICAL_MAPPING_SOURCE_FILTERS, "all"),
  };
}

export function buildCanonicalMappingOperationsSearchParams(
  filters: Partial<CanonicalMappingOperationsFilters>,
) {
  const params = new URLSearchParams();

  if (filters.page && filters.page > 1) {
    params.set("page", String(filters.page));
  }

  if (filters.q) {
    params.set("q", filters.q);
  }

  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }

  if (filters.visibility && filters.visibility !== "all") {
    params.set("visibility", filters.visibility);
  }

  if (filters.source && filters.source !== "all") {
    params.set("source", filters.source);
  }

  return params;
}

function escapeLikeQuery(value: string) {
  return value.replace(/[%,]/g, " ").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function applyMappingFilters(
  query: unknown,
  filters: CanonicalMappingOperationsFilters,
  options?: {
    includeVisibility?: boolean;
  },
) {
  let next = query as CanonicalMappingFilterQuery;

  if (filters.status !== "all") {
    next = next.eq("mapping_status", filters.status) as typeof next;
  }

  if (options?.includeVisibility !== false && filters.visibility !== "all") {
    next = next.eq(
      "resolver_visibility_status",
      filters.visibility,
    ) as typeof next;
  }

  if (filters.source === "catalog") {
    next = next.or(
      "source_case_id.not.is.null,source_decision_id.not.is.null",
    ) as typeof next;
  } else if (filters.source === "pcrm") {
    next = next.not("source_recommendation_id", "is", null) as typeof next;
  } else if (filters.source === "seed") {
    next = next.not("source_seed_import_row_id", "is", null) as typeof next;
  } else if (filters.source === "direct") {
    next = next.is("source_case_id", null);
    next = next.is("source_decision_id", null);
    next = next.is("source_recommendation_id", null);
    next = next.is("source_seed_import_row_id", null);
  }

  const q = escapeLikeQuery(filters.q);
  if (q) {
    const pattern = `%${q}%`;
    const searchClauses = [
      `misspelling_normalized.ilike.${pattern}`,
      `correct_spelling_normalized.ilike.${pattern}`,
      `micro_skill_key.ilike.${pattern}`,
    ];

    if (isUuid(q)) {
      searchClauses.push(`id.eq.${q}`);
    }

    next = next.or(searchClauses.join(",")) as typeof next;
  }

  return next;
}

async function fetchMicroSkillNames(keys: string[]) {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  if (uniqueKeys.length === 0) {
    return new Map<string, string | null>();
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("micro_skill_catalog")
    .select("micro_skill_key, display_name")
    .in("micro_skill_key", uniqueKeys);

  if (error) {
    throw error;
  }

  return new Map(
    ((data ?? []) as MicroSkillRow[]).map((row) => [
      row.micro_skill_key,
      row.display_name,
    ]),
  );
}

async function fetchEventSummaries(mappingIds: string[]) {
  const uniqueIds = Array.from(new Set(mappingIds.filter(Boolean)));
  const summaries = new Map<
    string,
    {
      latest_event_type: string | null;
      latest_event_at: string | null;
      latest_event_admin_email: string | null;
      latest_event_note: string | null;
      event_count: number;
    }
  >();

  if (uniqueIds.length === 0) {
    return summaries;
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("spelling_canonical_mapping_events")
    .select("id, mapping_id, event_type, admin_email, note, created_at")
    .in("mapping_id", uniqueIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  for (const event of (data ?? []) as CanonicalMappingEventRow[]) {
    const current = summaries.get(event.mapping_id);

    if (!current) {
      summaries.set(event.mapping_id, {
        latest_event_type: event.event_type,
        latest_event_at: event.created_at,
        latest_event_admin_email: event.admin_email,
        latest_event_note: event.note,
        event_count: 1,
      });
      continue;
    }

    current.event_count += 1;
  }

  return summaries;
}

async function countMappings(
  filters: CanonicalMappingOperationsFilters,
  overrides?: {
    status?: CanonicalMappingStatusFilter;
    visibility?: CanonicalMappingVisibilityFilter;
    includeVisibility?: boolean;
  },
) {
  const supabase = createServiceRoleClient();
  const countFilters = {
    ...filters,
    status: overrides?.status ?? filters.status,
    visibility: overrides?.visibility ?? filters.visibility,
  };
  const query = applyMappingFilters(
    supabase
      .from("spelling_canonical_mappings")
      .select("id", { count: "exact", head: true }),
    countFilters,
    { includeVisibility: overrides?.includeVisibility },
  ) as unknown as PromiseLike<{ count: number | null; error: Error | null }>;
  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function attachOperationsMetadata(rows: CanonicalMappingTableRow[]) {
  const microSkillNames = await fetchMicroSkillNames(
    rows.map((row) => row.micro_skill_key),
  );
  const eventSummaries = await fetchEventSummaries(rows.map((row) => row.id));

  return rows.map((row): CanonicalMappingOperationsRow => {
    const eventSummary = eventSummaries.get(row.id);

    return {
      ...row,
      micro_skill_display_name:
        microSkillNames.get(row.micro_skill_key) ?? null,
      latest_event_type: eventSummary?.latest_event_type ?? null,
      latest_event_at: eventSummary?.latest_event_at ?? null,
      latest_event_admin_email: eventSummary?.latest_event_admin_email ?? null,
      latest_event_note: eventSummary?.latest_event_note ?? null,
      event_count: eventSummary?.event_count ?? 0,
    };
  });
}

export async function loadCanonicalMappingOperationsPage(
  filters: CanonicalMappingOperationsFilters,
): Promise<CanonicalMappingOperationsPage> {
  const supabase = createServiceRoleClient();
  const page = Math.max(1, filters.page);
  const offset = (page - 1) * CANONICAL_MAPPING_OPERATIONS_PAGE_SIZE;
  const to = offset + CANONICAL_MAPPING_OPERATIONS_PAGE_SIZE - 1;
  const baseQuery = supabase
    .from("spelling_canonical_mappings")
    .select(
      [
        "id",
        "misspelling_normalized",
        "correct_spelling_normalized",
        "micro_skill_key",
        "mapping_status",
        "resolver_visibility_status",
        "dialect_code",
        "normalization_version",
        "source_case_id",
        "source_decision_id",
        "source_recommendation_id",
        "source_seed_import_row_id",
        "created_by_admin_email",
        "created_at",
        "updated_at",
      ].join(", "),
      { count: "exact" },
    );
  const query = applyMappingFilters(baseQuery, filters) as unknown as {
    order(column: string, options: { ascending: boolean }): {
      range(from: number, to: number): PromiseLike<{
        data: unknown;
        count: number | null;
        error: Error | null;
      }>;
    };
  };
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, to);

  if (error) {
    throw error;
  }

  const rows = await attachOperationsMetadata(
    ((data ?? []) as unknown) as CanonicalMappingTableRow[],
  );
  const totalCount = count ?? 0;
  const summaryFilters = { ...filters, visibility: "all" as const };
  const [
    activeCount,
    visibleCount,
    hiddenCount,
    disabledVisibilityCount,
    replayRecommendations,
  ] =
    await Promise.all([
      countMappings(summaryFilters, {
        status: "active",
        includeVisibility: false,
      }),
      countMappings(summaryFilters, {
        visibility: "visible",
      }),
      countMappings(summaryFilters, {
        visibility: "hidden",
      }),
      countMappings(summaryFilters, {
        visibility: "disabled",
      }),
      fetchReplayRecommendations(),
    ]);

  return {
    filters,
    rows,
    replayRecommendations,
    totalCount,
    pageCount: rows.length,
    totalPages: Math.max(
      1,
      Math.ceil(totalCount / CANONICAL_MAPPING_OPERATIONS_PAGE_SIZE),
    ),
    summary: {
      totalCount,
      activeCount,
      visibleCount,
      hiddenCount,
      disabledVisibilityCount,
    },
  };
}

export async function loadCanonicalMappingOperationsExportRows(
  filters: CanonicalMappingOperationsFilters,
) {
  const supabase = createServiceRoleClient();
  const exportFilters = { ...filters, page: 1 };
  const query = applyMappingFilters(
    supabase
      .from("spelling_canonical_mappings")
      .select(
        [
          "id",
          "misspelling_normalized",
          "correct_spelling_normalized",
          "micro_skill_key",
          "mapping_status",
          "resolver_visibility_status",
          "dialect_code",
          "normalization_version",
          "source_case_id",
          "source_decision_id",
          "source_recommendation_id",
          "source_seed_import_row_id",
          "created_by_admin_email",
          "created_at",
          "updated_at",
        ].join(", "),
      ),
    exportFilters,
  ) as unknown as {
    order(column: string, options: { ascending: boolean }): {
      limit(count: number): PromiseLike<{
        data: unknown;
        error: Error | null;
      }>;
    };
  };
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(CANONICAL_MAPPING_OPERATIONS_EXPORT_LIMIT);

  if (error) {
    throw error;
  }

  return attachOperationsMetadata(
    ((data ?? []) as unknown) as CanonicalMappingTableRow[],
  );
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);

  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export function renderCanonicalMappingOperationsCsv(input: {
  filters: CanonicalMappingOperationsFilters;
  rows: CanonicalMappingOperationsRow[];
}) {
  const filterSummary = [
    `q=${input.filters.q}`,
    `status=${input.filters.status}`,
    `visibility=${input.filters.visibility}`,
    `source=${input.filters.source}`,
    `limit=${CANONICAL_MAPPING_OPERATIONS_EXPORT_LIMIT}`,
  ].join("; ");
  const headers = [
    "export_filters",
    "mapping_id",
    "misspelling_normalized",
    "correct_spelling_normalized",
    "micro_skill_key",
    "micro_skill_display_name",
    "mapping_status",
    "resolver_visibility_status",
    "dialect_code",
    "normalization_version",
    "source_case_id",
    "source_decision_id",
    "source_recommendation_id",
    "source_seed_import_row_id",
    "created_by_admin_email",
    "created_at",
    "updated_at",
    "latest_event_type",
    "latest_event_at",
    "latest_event_admin_email",
    "latest_event_note",
    "event_count",
  ];
  const rows = input.rows.map((row) =>
    [
      filterSummary,
      row.id,
      row.misspelling_normalized,
      row.correct_spelling_normalized,
      row.micro_skill_key,
      row.micro_skill_display_name,
      row.mapping_status,
      row.resolver_visibility_status,
      row.dialect_code,
      row.normalization_version,
      row.source_case_id,
      row.source_decision_id,
      row.source_recommendation_id,
      row.source_seed_import_row_id,
      row.created_by_admin_email,
      row.created_at,
      row.updated_at,
      row.latest_event_type,
      row.latest_event_at,
      row.latest_event_admin_email,
      row.latest_event_note,
      row.event_count,
    ].map(csvCell).join(","),
  );

  return [headers.map(csvCell).join(","), ...rows].join("\n");
}
