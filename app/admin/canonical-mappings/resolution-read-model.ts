import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const RESOLUTION_PAGE_SIZE = 25;

export type ResolutionFilters = {
  page: number;
  q: string;
  family: string;
  cluster: string;
  skill: string;
  status: "open" | "pending" | "confirmed" | "closed" | "all";
  resolver: "all" | "yes" | "no";
};

export type SkillOption = {
  micro_skill_key: string;
  display_name: string;
  skill_family_key: string;
  skill_cluster_key: string | null;
};

export type SourceDetail = {
  type: "seed" | "recommendation" | "catalog" | "candidate";
  id: string;
  status: string;
  createdAt: string | null;
  note: string | null;
  originalMisspelling: string;
  originalCorrection: string;
  details: Record<string, unknown>;
};

export type ResolutionRow = {
  id: string;
  misspelling: string;
  correction: string;
  dialect: string;
  skillKey: string | null;
  skillName: string | null;
  familyKey: string | null;
  familyName: string | null;
  clusterKey: string | null;
  clusterName: string | null;
  status: "pending" | "confirmed" | "closed";
  resolverEnabled: boolean;
  mappingId: string | null;
  mappingStatus: string | null;
  visibilityStatus: string | null;
  updatedAt: string;
  sources: SourceDetail[];
  audit: Array<{ event_type: string; created_at: string; note: string | null }>;
};

const statuses = new Set(["open", "pending", "confirmed", "closed", "all"]);

export function parseResolutionFilters(input: Record<string, string | undefined>): ResolutionFilters {
  const parsedPage = Number.parseInt(input.page ?? "1", 10);
  return {
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    q: (input.q ?? "").trim().slice(0, 100),
    family: (input.family ?? "").trim().slice(0, 120),
    cluster: (input.cluster ?? "").trim().slice(0, 120),
    skill: (input.skill ?? "").trim().slice(0, 120),
    status: statuses.has(input.status ?? "") ? input.status as ResolutionFilters["status"] : "open",
    resolver: input.resolver === "yes" || input.resolver === "no" ? input.resolver : "all",
  };
}

export function resolutionHref(filters: ResolutionFilters, page = filters.page) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.family) params.set("family", filters.family);
  if (filters.cluster) params.set("cluster", filters.cluster);
  if (filters.skill) params.set("skill", filters.skill);
  if (filters.status !== "open") params.set("status", filters.status);
  if (filters.resolver !== "all") params.set("resolver", filters.resolver);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return `/admin/canonical-mappings${suffix ? `?${suffix}` : ""}`;
}

type ItemRecord = {
  id: string;
  misspelling: string;
  correction: string;
  dialect_code: string;
  micro_skill_key: string | null;
  mapping_id: string | null;
  review_status: ResolutionRow["status"];
  resolver_enabled: boolean;
  updated_at: string;
};

function sourceDetail(type: SourceDetail["type"], data: Record<string, unknown>): SourceDetail {
  const value = (key: string) => typeof data[key] === "string" ? data[key] as string : null;
  return {
    type,
    id: value("id") ?? "",
    status: value(type === "seed" ? "row_status" : type === "recommendation" ? "recommendation_status" :
      type === "candidate" ? "candidate_status" : "case_status") ?? "unknown",
    createdAt: value("created_at"),
    note: value(type === "seed" ? "source_note" : type === "recommendation" ? "recommendation_note" :
      type === "candidate" ? "review_note" : "parent_note"),
    originalMisspelling: value("raw_misspelling") ?? value("original_child_spelling") ?? value("misspelling_normalized") ?? "",
    originalCorrection: value("raw_correction") ?? value("original_correct_spelling") ?? value("correct_spelling_normalized") ?? "",
    details: data,
  };
}

export async function loadResolutionPage(filters: ResolutionFilters) {
  const db = createServiceRoleClient();
  const [skillsResult, familiesResult, clustersResult] = await Promise.all([
    db.from("micro_skill_catalog")
      .select("micro_skill_key, display_name, skill_family_key, skill_cluster_key")
      .eq("mastery_domain_key", "D4").eq("is_active", true).eq("is_assignable", true)
      .order("display_name"),
    db.from("micro_skill_families").select("skill_family_key, display_name").order("display_name"),
    db.from("micro_skill_clusters").select("skill_family_key, skill_cluster_key, display_name").order("display_name"),
  ]);
  if (skillsResult.error || familiesResult.error || clustersResult.error) {
    throw new Error(skillsResult.error?.message ?? familiesResult.error?.message ?? clustersResult.error?.message);
  }
  const skills = (skillsResult.data ?? []) as SkillOption[];
  const families = familiesResult.data ?? [];
  const clusters = clustersResult.data ?? [];
  const matchingSkills = skills.filter((skill) =>
    (!filters.family || skill.skill_family_key === filters.family) &&
    (!filters.cluster || skill.skill_cluster_key === filters.cluster));

  let query = db.from("spelling_resolution_items")
    .select("id, misspelling, correction, dialect_code, micro_skill_key, mapping_id, review_status, resolver_enabled, updated_at", { count: "exact" });
  if (filters.status === "open") query = query.neq("review_status", "closed");
  else if (filters.status !== "all") query = query.eq("review_status", filters.status);
  if (filters.resolver !== "all") query = query.eq("resolver_enabled", filters.resolver === "yes");
  if (filters.family || filters.cluster) {
    if (matchingSkills.length === 0) return { rows: [], total: 0, skills, families, clusters };
    query = query.in("micro_skill_key", matchingSkills.map((skill) => skill.micro_skill_key));
  }
  if (filters.skill) query = query.eq("micro_skill_key", filters.skill);
  if (filters.q) {
    const safe = filters.q.replace(/[^a-zA-Z0-9-]/g, "").trim();
    if (safe) query = query.or(`misspelling.ilike.%${safe}%,correction.ilike.%${safe}%`);
  }
  const { data, count, error } = await query
    .order("review_status", { ascending: false })
    .order("resolver_enabled", { ascending: true })
    .order("updated_at", { ascending: false })
    .range((filters.page - 1) * RESOLUTION_PAGE_SIZE, filters.page * RESOLUTION_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const items = (data ?? []) as ItemRecord[];
  if (!items.length) return { rows: [], total: count ?? 0, skills, families, clusters };

  const ids = items.map((item) => item.id);
  const mappingIds = items.map((item) => item.mapping_id).filter((id): id is string => Boolean(id));
  const links: Array<{ item_id: string; source_type: string; source_id: string }> = [];
  for (let start = 0; ; start += 500) {
    const linksResult = await db.from("spelling_resolution_item_sources")
      .select("item_id, source_type, source_id").in("item_id", ids)
      .order("source_type").order("source_id").range(start, start + 499);
    if (linksResult.error) throw new Error(linksResult.error.message);
    links.push(...(linksResult.data ?? []));
    if ((linksResult.data ?? []).length < 500) break;
  }
  const sourceIds = (type: string) => links.filter((link) => link.source_type === type).map((link) => link.source_id);
  const fetchSources = async (type: SourceDetail["type"], table: string) => {
    const requestedIds = sourceIds(type);
    if (!requestedIds.length) return [] as SourceDetail[];
    const found: SourceDetail[] = [];
    for (let start = 0; start < requestedIds.length; start += 100) {
      const result = await db.from(table).select("*").in("id", requestedIds.slice(start, start + 100));
      if (result.error) throw new Error(result.error.message);
      found.push(...(result.data ?? []).map((row) => sourceDetail(type, row as Record<string, unknown>)));
    }
    return found;
  };
  const [seed, recommendations, catalog, candidates, mappingResult, auditResult] = await Promise.all([
    fetchSources("seed", "spelling_seed_import_rows"),
    fetchSources("recommendation", "spelling_canonical_mapping_recommendations"),
    fetchSources("catalog", "spelling_catalog_review_cases"),
    fetchSources("candidate", "parent_verified_spelling_candidate_mappings"),
    mappingIds.length ? db.from("spelling_canonical_mappings")
      .select("id, mapping_status, resolver_visibility_status").in("id", mappingIds) : Promise.resolve({ data: [], error: null }),
    mappingIds.length ? db.from("spelling_canonical_mapping_events")
      .select("mapping_id, event_type, created_at, note").in("mapping_id", mappingIds)
      .order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
  ]);
  if (mappingResult.error || auditResult.error) {
    throw new Error(mappingResult.error?.message ?? auditResult.error?.message);
  }
  const sourceById = new Map([...seed, ...recommendations, ...catalog, ...candidates].map((source) => [`${source.type}:${source.id}`, source]));
  const mappingById = new Map((mappingResult.data ?? []).map((mapping) => [mapping.id, mapping]));
  const skillByKey = new Map(skills.map((skill) => [skill.micro_skill_key, skill]));
  const familyByKey = new Map(families.map((family) => [family.skill_family_key, family.display_name]));
  const clusterByKey = new Map(clusters.map((cluster) => [`${cluster.skill_family_key}:${cluster.skill_cluster_key}`, cluster.display_name]));
  const rows: ResolutionRow[] = items.map((item) => {
    const skill = item.micro_skill_key ? skillByKey.get(item.micro_skill_key) : null;
    const mapping = item.mapping_id ? mappingById.get(item.mapping_id) : null;
    return {
      id: item.id, misspelling: item.misspelling, correction: item.correction,
      dialect: item.dialect_code, skillKey: item.micro_skill_key,
      skillName: skill?.display_name ?? null,
      familyKey: skill?.skill_family_key ?? null,
      familyName: skill ? familyByKey.get(skill.skill_family_key) ?? skill.skill_family_key : null,
      clusterKey: skill?.skill_cluster_key ?? null,
      clusterName: skill?.skill_cluster_key ? clusterByKey.get(`${skill.skill_family_key}:${skill.skill_cluster_key}`) ?? skill.skill_cluster_key : null,
      status: item.review_status,
      resolverEnabled: item.resolver_enabled,
      mappingId: item.mapping_id,
      mappingStatus: mapping?.mapping_status ?? null,
      visibilityStatus: mapping?.resolver_visibility_status ?? null,
      updatedAt: item.updated_at,
      sources: links.filter((link) => link.item_id === item.id)
        .map((link) => sourceById.get(`${link.source_type}:${link.source_id}`))
        .filter((source): source is SourceDetail => Boolean(source)),
      audit: (auditResult.data ?? []).filter((event) => event.mapping_id === item.mapping_id)
        .map((event) => ({ event_type: event.event_type, created_at: event.created_at, note: event.note })),
    };
  });
  return { rows, total: count ?? 0, skills, families, clusters };
}
