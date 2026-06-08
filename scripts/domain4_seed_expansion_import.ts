import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;
type SupabaseClient = ReturnType<typeof createClient<any>>;

type ArtifactFamily = {
  mastery_domain_key: string;
  skill_family_key: string;
  display_name: string;
  is_active: boolean;
  is_assignable: boolean;
  metadata: JsonRecord;
};

type ArtifactCluster = {
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string;
  display_name: string;
  is_active: boolean;
  is_assignable: boolean;
  metadata: JsonRecord;
};

type ArtifactMicroSkill = {
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string;
  micro_skill_key: string;
  display_name: string;
  practice_route: string;
  is_active: boolean;
  is_assignable: boolean;
  allowed_template_keys: string[];
  metadata: JsonRecord;
};

type AuditReport = {
  taxonomy_key_diff: {
    families: { stale_in_db_not_artifact: string[] };
    clusters: { stale_in_db_not_artifact: string[] };
    micro_skills: { stale_in_db_not_artifact: string[] };
  };
  dependent_reference_totals_for_stale_keys: {
    direct_column_references: number;
    linked_rows: number;
    metadata_snapshot_rows: number;
  };
  blockers_before_mutation: string[];
};

type TableRow = Record<string, unknown> & { id?: string };

const ARTIFACT_DIR = "docs/implementation/seed-data/domain4-seed-expansion";
const AUDIT_PATH = ".tmp/domain4-seed-expansion-audit/latest-read-only-audit.json";
const BACKUP_ROOT = ".tmp/catalog-reset-backups";
const PAGE_SIZE = 1000;

function loadDotEnvLocal() {
  const envPath = ".env.local";

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValueParts] = trimmed.split("=");
    const key = rawKey.trim();

    if (process.env[key]) {
      continue;
    }

    process.env[key] = rawValueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
  }
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function fetchAll<T extends TableRow>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  apply?: (query: any) => any,
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);

    if (apply) {
      query = apply(query);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Backup/export query failed for ${table}: ${error.message}`);
    }

    rows.push(...((data ?? []) as T[]));

    if (!data || data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

async function exportBackup(input: {
  audit: AuditReport;
  backupDir: string;
  supabase: SupabaseClient;
}) {
  mkdirSync(input.backupDir, { recursive: true });
  writeJson(path.join(input.backupDir, "pre-mutation-audit.json"), input.audit);

  const exports: Record<string, TableRow[]> = {};

  exports.micro_skill_families = await fetchAll(
    input.supabase,
    "micro_skill_families",
    "*",
    (query) => query.eq("mastery_domain_key", "D4").order("skill_family_key"),
  );
  exports.micro_skill_clusters = await fetchAll(
    input.supabase,
    "micro_skill_clusters",
    "*",
    (query) => query.eq("mastery_domain_key", "D4").order("skill_cluster_key"),
  );
  exports.micro_skill_catalog = await fetchAll(
    input.supabase,
    "micro_skill_catalog",
    "*",
    (query) => query.eq("mastery_domain_key", "D4").order("micro_skill_key"),
  );

  exports.learning_items = await fetchAll(input.supabase, "learning_items", "*");
  exports.learning_item_evidence = await fetchAll(
    input.supabase,
    "learning_item_evidence",
    "*",
  );
  exports.assignment_items = await fetchAll(input.supabase, "assignment_items", "*");
  exports.writing_issues = await fetchAll(input.supabase, "writing_issues", "*");
  exports.writing_issue_suggestions = await fetchAll(
    input.supabase,
    "writing_issue_suggestions",
    "*",
  );
  exports.parent_verifications = await fetchAll(
    input.supabase,
    "parent_verifications",
    "*",
  );
  exports.parent_verified_spelling_candidate_mappings = await fetchAll(
    input.supabase,
    "parent_verified_spelling_candidate_mappings",
    "*",
  );
  exports.spelling_canonical_mappings = await fetchAll(
    input.supabase,
    "spelling_canonical_mappings",
    "*",
  );
  exports.spelling_canonical_mapping_recommendations = await fetchAll(
    input.supabase,
    "spelling_canonical_mapping_recommendations",
    "*",
  );
  exports.spelling_catalog_review_case_decisions = await fetchAll(
    input.supabase,
    "spelling_catalog_review_case_decisions",
    "*",
  );

  const rowCounts: Record<string, number> = {};

  for (const [table, rows] of Object.entries(exports)) {
    rowCounts[table] = rows.length;
    writeJson(path.join(input.backupDir, `${table}.json`), rows);
  }

  writeJson(path.join(input.backupDir, "row-counts.json"), rowCounts);

  return rowCounts;
}

async function deleteByKeys(input: {
  column: string;
  keys: string[];
  supabase: SupabaseClient;
  table: string;
}) {
  if (input.keys.length === 0) {
    return 0;
  }

  const before = await fetchAll(
    input.supabase,
    input.table,
    input.column,
    (query) => query.in(input.column, input.keys),
  );
  const { error } = await input.supabase
    .from(input.table)
    .delete()
    .in(input.column, input.keys);

  if (error) {
    throw new Error(`Delete failed for ${input.table}: ${error.message}`);
  }

  return before.length;
}

async function upsertRows<T extends JsonRecord>(input: {
  supabase: SupabaseClient;
  table: string;
  rows: T[];
  onConflict: string;
}) {
  const { error } = await input.supabase
    .from(input.table)
    .upsert(input.rows, { onConflict: input.onConflict });

  if (error) {
    throw new Error(`Upsert failed for ${input.table}: ${error.message}`);
  }

  return input.rows.length;
}

async function validateFinalState(input: {
  supabase: SupabaseClient;
  staleMicroSkillKeys: string[];
  staleClusterKeys: string[];
}) {
  const families = await fetchAll(
    input.supabase,
    "micro_skill_families",
    "skill_family_key, is_active, is_assignable",
    (query) => query.eq("mastery_domain_key", "D4"),
  );
  const clusters = await fetchAll(
    input.supabase,
    "micro_skill_clusters",
    "skill_cluster_key, skill_family_key, is_active, is_assignable",
    (query) => query.eq("mastery_domain_key", "D4"),
  );
  const microSkills = await fetchAll(
    input.supabase,
    "micro_skill_catalog",
    "micro_skill_key, skill_family_key, skill_cluster_key, is_active, is_assignable, practice_route",
    (query) => query.eq("mastery_domain_key", "D4"),
  );

  const activeAssignableMicroSkills = microSkills.filter(
    (row) => row.is_active === true && row.is_assignable === true,
  );
  const proofRows = [
    ...families.filter((row) => String(row.skill_family_key).includes("D4_PROOF")),
    ...clusters.filter(
      (row) =>
        String(row.skill_family_key).includes("D4_PROOF") ||
        String(row.skill_cluster_key).includes("D4_PROOF"),
    ),
    ...microSkills.filter(
      (row) =>
        String(row.skill_family_key).includes("D4_PROOF") ||
        String(row.skill_cluster_key).includes("D4_PROOF") ||
        String(row.micro_skill_key).includes("D4_PROOF"),
    ),
  ];

  const remainingStaleMicroSkills = microSkills.filter((row) =>
    input.staleMicroSkillKeys.includes(String(row.micro_skill_key)),
  );
  const remainingStaleClusters = clusters.filter((row) =>
    input.staleClusterKeys.includes(String(row.skill_cluster_key)),
  );

  const failures: string[] = [];

  if (families.length !== 8) failures.push(`Expected 8 D4 families, found ${families.length}.`);
  if (clusters.length !== 47) failures.push(`Expected 47 D4 clusters, found ${clusters.length}.`);
  if (microSkills.length !== 240) {
    failures.push(`Expected 240 D4 micro-skills, found ${microSkills.length}.`);
  }
  if (activeAssignableMicroSkills.length !== 240) {
    failures.push(
      `Expected 240 active assignable D4 micro-skills, found ${activeAssignableMicroSkills.length}.`,
    );
  }
  if (proofRows.length !== 0) {
    failures.push(`Expected no D4_PROOF taxonomy rows, found ${proofRows.length}.`);
  }
  if (remainingStaleMicroSkills.length !== 0) {
    failures.push(
      `Expected stale micro-skill rows deleted, found ${remainingStaleMicroSkills.length}.`,
    );
  }
  if (remainingStaleClusters.length !== 0) {
    failures.push(`Expected stale cluster rows deleted, found ${remainingStaleClusters.length}.`);
  }
  if (microSkills.some((row) => row.practice_route !== "word_practice")) {
    failures.push("Expected all D4 micro-skills to remain word_practice in this pass.");
  }

  return {
    counts: {
      families: families.length,
      clusters: clusters.length,
      micro_skills: microSkills.length,
      active_assignable_micro_skills: activeAssignableMicroSkills.length,
      proof_taxonomy_rows: proofRows.length,
      remaining_stale_clusters: remainingStaleClusters.length,
      remaining_stale_micro_skills: remainingStaleMicroSkills.length,
    },
    failures,
  };
}

async function main() {
  loadDotEnvLocal();

  const supabase = createClient(
    readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const audit = readJson<AuditReport>(AUDIT_PATH);

  if (audit.blockers_before_mutation.length > 0) {
    throw new Error(`Refusing mutation because audit has blockers: ${audit.blockers_before_mutation.join("; ")}`);
  }

  const staleReferenceTotals = audit.dependent_reference_totals_for_stale_keys;

  if (
    staleReferenceTotals.direct_column_references > 0 ||
    staleReferenceTotals.linked_rows > 0 ||
    staleReferenceTotals.metadata_snapshot_rows > 0
  ) {
    throw new Error(
      `Refusing mutation because stale references remain: ${JSON.stringify(staleReferenceTotals)}`,
    );
  }

  const families = readJson<ArtifactFamily[]>(path.join(ARTIFACT_DIR, "families.json"));
  const clusters = readJson<ArtifactCluster[]>(path.join(ARTIFACT_DIR, "clusters.json"));
  const microSkills = readJson<ArtifactMicroSkill[]>(path.join(ARTIFACT_DIR, "micro-skills.json"));

  const backupDir = path.join(BACKUP_ROOT, `domain4-seed-expansion-${timestampForPath()}`);
  const exportedRows = await exportBackup({ audit, backupDir, supabase });

  const deletedRows = {
    micro_skill_catalog: await deleteByKeys({
      supabase,
      table: "micro_skill_catalog",
      column: "micro_skill_key",
      keys: audit.taxonomy_key_diff.micro_skills.stale_in_db_not_artifact,
    }),
    micro_skill_clusters: await deleteByKeys({
      supabase,
      table: "micro_skill_clusters",
      column: "skill_cluster_key",
      keys: audit.taxonomy_key_diff.clusters.stale_in_db_not_artifact,
    }),
    micro_skill_families: await deleteByKeys({
      supabase,
      table: "micro_skill_families",
      column: "skill_family_key",
      keys: audit.taxonomy_key_diff.families.stale_in_db_not_artifact,
    }),
  };

  const upsertedRows = {
    micro_skill_families: await upsertRows({
      supabase,
      table: "micro_skill_families",
      rows: families,
      onConflict: "skill_family_key",
    }),
    micro_skill_clusters: await upsertRows({
      supabase,
      table: "micro_skill_clusters",
      rows: clusters,
      onConflict: "skill_cluster_key",
    }),
    micro_skill_catalog: await upsertRows({
      supabase,
      table: "micro_skill_catalog",
      rows: microSkills,
      onConflict: "micro_skill_key",
    }),
  };

  const finalValidation = await validateFinalState({
    supabase,
    staleMicroSkillKeys: audit.taxonomy_key_diff.micro_skills.stale_in_db_not_artifact,
    staleClusterKeys: audit.taxonomy_key_diff.clusters.stale_in_db_not_artifact,
  });

  const result = {
    backup_dir: backupDir,
    exported_rows: exportedRows,
    deleted_rows: deletedRows,
    upserted_rows: upsertedRows,
    final_validation: finalValidation,
    stale_reference_audit_result: staleReferenceTotals,
    resolver_behavior_changed: false,
    practice_template_routing_changed: false,
    grouped_set_practice_enabled: false,
    task_templates_imported_to_runtime_tables: false,
  };

  writeJson(path.join(backupDir, "import-result.json"), result);
  console.log(JSON.stringify(result, null, 2));

  if (finalValidation.failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
