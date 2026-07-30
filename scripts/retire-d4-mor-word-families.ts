import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

type JsonRow = Record<string, unknown>;
type Environment = "staging" | "production";

const TARGET_MICRO_SKILLS = [
  "D4_MOR_WORD_FAMILIES_PRONUNCIATION_SHIFT",
  "D4_MOR_WORD_FAMILIES_RELATED_WORD_SUPPORT",
] as const;
const TARGET_CLUSTER = "D4_MOR_WORD_FAMILIES";
const PROJECT_REFS: Record<Environment, string> = {
  staging: "jlhotktspjvffslvuyfz",
  production: "wwohrqtunajrbwxyssjf",
};
const DEFAULT_ENV_FILES: Record<Environment, string> = {
  staging: ".tmp/dynamic-suffix-proof.env",
  production: ".tmp/dynamic-suffix-live-production-after-gate.env",
};
const ALLOWED_DIRECT_REFERENCES = new Set([
  "canonical_teaching_dictionary_content_versions.micro_skill_key",
  "canonical_teaching_dictionary_skill_level_allocation.micro_skill_key",
  "canonical_teaching_dictionary_word_support.micro_skill_key",
  "micro_skill_catalog.micro_skill_key",
  "micro_skill_catalog.skill_cluster_key",
  "micro_skill_clusters.skill_cluster_key",
]);
const EXPECTED_PRE_REMOVAL_COUNTS: Record<string, number> = {
  canonical_teaching_dictionary_content_versions: 2,
  canonical_teaching_dictionary_field_reviews: 22,
  canonical_teaching_dictionary_readiness_reports: 2,
  canonical_teaching_dictionary_skill_level_allocation: 2,
  canonical_teaching_dictionary_word_support: 3,
  micro_skill_catalog: 2,
  micro_skill_clusters: 1,
};
const DELETE_ORDER = [
  "canonical_teaching_dictionary_field_reviews",
  "canonical_teaching_dictionary_readiness_reports",
  "canonical_teaching_dictionary_content_versions",
  "canonical_teaching_dictionary_word_support",
  "canonical_teaching_dictionary_skill_level_allocation",
  "micro_skill_catalog",
  "micro_skill_clusters",
] as const;

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const environment = value("--environment") as Environment | undefined;
  if (environment !== "staging" && environment !== "production") {
    throw new Error("Use --environment staging or --environment production.");
  }
  const apply = args.includes("--apply");
  return {
    apply,
    confirm: value("--confirm"),
    environment,
    envFile: value("--env-file") ?? DEFAULT_ENV_FILES[environment],
  };
}

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (process.env[key]) continue;
    process.env[key] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment value: ${name}`);
  return value;
}

function connection(environment: Environment, envFile: string) {
  loadEnvFile(envFile);
  const url =
    process.env.ADLE_D4_MOR_RETIREMENT_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey =
    process.env.ADLE_D4_MOR_RETIREMENT_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SB_SERVICE_ROLE_KEY?.trim() ||
    required("SUPABASE_SERVICE_ROLE_KEY");
  const actualRef = new URL(url).hostname.split(".")[0];
  if (actualRef !== PROJECT_REFS[environment]) {
    throw new Error(
      `Refusing ${environment}: expected ${PROJECT_REFS[environment]}, found ${actualRef}.`,
    );
  }
  return {
    baseUrl: `${url.replace(/\/$/, "")}/rest/v1`,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    projectRef: actualRef,
  };
}

async function requestRows(input: {
  baseUrl: string;
  headers: Record<string, string>;
  table: string;
  filters?: Array<[string, string]>;
  select?: string;
}) {
  const url = new URL(`${input.baseUrl}/${input.table}`);
  url.searchParams.set("select", input.select ?? "*");
  url.searchParams.set("limit", "1000");
  for (const [column, filter] of input.filters ?? []) {
    url.searchParams.set(column, filter);
  }
  const response = await fetch(url, { headers: input.headers });
  if (!response.ok) {
    throw new Error(
      `Read failed for ${input.table}: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as JsonRow[];
}

async function schema(input: {
  baseUrl: string;
  headers: Record<string, string>;
}) {
  const response = await fetch(`${input.baseUrl}/`, { headers: input.headers });
  if (!response.ok) {
    throw new Error(`Schema read failed: ${response.status}`);
  }
  return (await response.json()) as {
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
  };
}

function inFilter(values: readonly string[]) {
  return `in.(${values.join(",")})`;
}

async function audit(input: {
  baseUrl: string;
  environment: Environment;
  headers: Record<string, string>;
  projectRef: string;
}) {
  const openApi = await schema(input);
  const directReferences: Array<{
    column: string;
    rows: JsonRow[];
    table: string;
  }> = [];
  const microSkillColumn = /(^|_)micro_skill_key$/;

  for (const [table, definition] of Object.entries(
    openApi.definitions ?? {},
  ).sort(([left], [right]) => left.localeCompare(right))) {
    for (const column of Object.keys(definition.properties ?? {}).sort()) {
      let filter: string | undefined;
      if (microSkillColumn.test(column)) {
        filter = inFilter(TARGET_MICRO_SKILLS);
      } else if (column === "skill_cluster_key") {
        filter = `eq.${TARGET_CLUSTER}`;
      }
      if (!filter) continue;
      const rows = await requestRows({
        ...input,
        table,
        filters: [[column, filter]],
      });
      if (rows.length > 0) {
        directReferences.push({ column, rows, table });
      }
    }
  }

  const metadataReferences: Array<{
    column: string;
    rows: JsonRow[];
    table: string;
  }> = [];
  for (const [table, column] of [
    ["assignment_items", "metadata->>microSkillKey"],
    ["assignment_items", "prompt_data->>microSkillKey"],
  ] as const) {
    const rows = await requestRows({
      ...input,
      table,
      filters: [[column, inFilter(TARGET_MICRO_SKILLS)]],
    });
    if (rows.length > 0) metadataReferences.push({ column, rows, table });
  }

  const taughtHistorySourceReferences: JsonRow[] = [];
  for (const key of TARGET_MICRO_SKILLS) {
    taughtHistorySourceReferences.push(
      ...(await requestRows({
        ...input,
        table: "adle_taught_word_history",
        filters: [["source_ref", `like.*${key}*`]],
      })),
    );
  }

  const contentRows =
    directReferences.find(
      (entry) =>
        entry.table === "canonical_teaching_dictionary_content_versions" &&
        entry.column === "micro_skill_key",
    )?.rows ?? [];
  const contentIds = contentRows.map((row) => String(row.id));
  const fieldReviews =
    contentIds.length === 0
      ? []
      : await requestRows({
          ...input,
          table: "canonical_teaching_dictionary_field_reviews",
          filters: [
            ["teaching_content_version_id", inFilter(contentIds)],
          ],
        });
  const readinessReports =
    contentIds.length === 0
      ? []
      : await requestRows({
          ...input,
          table: "canonical_teaching_dictionary_readiness_reports",
          filters: [
            ["teaching_content_version_id", inFilter(contentIds)],
          ],
        });

  const exportedRows: Record<string, JsonRow[]> = {
    canonical_teaching_dictionary_content_versions: contentRows,
    canonical_teaching_dictionary_field_reviews: fieldReviews,
    canonical_teaching_dictionary_readiness_reports: readinessReports,
    canonical_teaching_dictionary_skill_level_allocation:
      directReferences.find(
        (entry) =>
          entry.table ===
            "canonical_teaching_dictionary_skill_level_allocation" &&
          entry.column === "micro_skill_key",
      )?.rows ?? [],
    canonical_teaching_dictionary_word_support:
      directReferences.find(
        (entry) =>
          entry.table === "canonical_teaching_dictionary_word_support" &&
          entry.column === "micro_skill_key",
      )?.rows ?? [],
    micro_skill_catalog:
      directReferences.find(
        (entry) =>
          entry.table === "micro_skill_catalog" &&
          entry.column === "micro_skill_key",
      )?.rows ?? [],
    micro_skill_clusters:
      directReferences.find(
        (entry) =>
          entry.table === "micro_skill_clusters" &&
          entry.column === "skill_cluster_key",
      )?.rows ?? [],
  };
  const rowCounts = Object.fromEntries(
    Object.entries(exportedRows).map(([table, rows]) => [table, rows.length]),
  );
  const unexpectedDirectReferences = directReferences
    .filter(
      (entry) =>
        !ALLOWED_DIRECT_REFERENCES.has(`${entry.table}.${entry.column}`),
    )
    .map((entry) => ({
      column: entry.column,
      count: entry.rows.length,
      table: entry.table,
    }));
  const blockers: string[] = [];
  if (unexpectedDirectReferences.length > 0) {
    blockers.push("unexpected direct micro-skill or cluster references");
  }
  if (metadataReferences.length > 0) {
    blockers.push("assignment snapshot references");
  }
  if (taughtHistorySourceReferences.length > 0) {
    blockers.push("taught-word history source references");
  }
  for (const [table, expected] of Object.entries(
    EXPECTED_PRE_REMOVAL_COUNTS,
  )) {
    if (rowCounts[table] !== expected) {
      blockers.push(
        `${table} expected ${expected} controlled rows, found ${rowCounts[table] ?? 0}`,
      );
    }
  }

  const d4MorphologyCatalog = await requestRows({
    ...input,
    table: "micro_skill_catalog",
    filters: [["skill_family_key", "eq.D4_MOR"]],
    select: "micro_skill_key,is_active,is_assignable",
  });
  if (d4MorphologyCatalog.length !== 27) {
    blockers.push(
      `expected 27 pre-removal D4_MOR catalog rows, found ${d4MorphologyCatalog.length}`,
    );
  }

  return {
    auditVersion: "d4_mor_word_families_retirement_v1",
    blockers,
    environment: input.environment,
    expectedPostRemoval: {
      activeD4MorphologyMicroSkills: 25,
      activeD4MicroSkills: 241,
    },
    exportedRows,
    generatedAt: new Date().toISOString(),
    projectRef: input.projectRef,
    referenceProof: {
      assignmentSnapshotReferences: metadataReferences.length,
      directReferenceSets: directReferences.map((entry) => ({
        column: entry.column,
        count: entry.rows.length,
        table: entry.table,
      })),
      readinessReportReferences: readinessReports.length,
      taughtHistorySourceReferences: taughtHistorySourceReferences.length,
      unexpectedDirectReferences,
    },
    rowCounts,
    targetCluster: TARGET_CLUSTER,
    targetMicroSkills: [...TARGET_MICRO_SKILLS],
  };
}

function stableJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function artifactPath(environment: Environment, suffix: string) {
  return path.join(
    "docs/implementation/qa",
    `adle-d4-mor-word-families-${environment}-${suffix}-2026-07-29.json`,
  );
}

function writeArtifact(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, stableJson(value), "utf8");
}

async function deleteRows(input: {
  baseUrl: string;
  headers: Record<string, string>;
  ids: string[];
  table: string;
}) {
  if (input.ids.length === 0) return [];
  const url = new URL(`${input.baseUrl}/${input.table}`);
  url.searchParams.set("id", inFilter(input.ids));
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...input.headers,
      Prefer: "return=representation",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Delete failed for ${input.table}: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as JsonRow[];
}

async function main() {
  const args = parseArgs();
  const conn = connection(args.environment, args.envFile);
  const preflight = await audit({ ...conn, environment: args.environment });
  const preflightPath = artifactPath(args.environment, "preflight-export");
  writeArtifact(preflightPath, preflight);

  if (preflight.blockers.length > 0) {
    throw new Error(
      `Retirement blocked: ${preflight.blockers.join("; ")}. Export: ${preflightPath}`,
    );
  }
  if (!args.apply) {
    console.log(
      JSON.stringify({
        environment: args.environment,
        mode: "audit_only",
        preflight: preflightPath,
        rowCounts: preflight.rowCounts,
        zeroRuntimeReferences: true,
      }),
    );
    return;
  }

  const expectedConfirm = `${TARGET_CLUSTER}:retire:${args.environment}`;
  if (args.confirm !== expectedConfirm) {
    throw new Error(`Apply requires --confirm ${expectedConfirm}`);
  }
  if (
    args.environment === "production" &&
    process.env.ADLE_D4_MOR_WORD_FAMILIES_PRODUCTION_APPROVED?.trim() !==
      "written-production-approval-received"
  ) {
    throw new Error(
      "Production retirement requires separate written approval and ADLE_D4_MOR_WORD_FAMILIES_PRODUCTION_APPROVED=written-production-approval-received.",
    );
  }

  const deletedRows: Record<string, JsonRow[]> = {};
  for (const table of DELETE_ORDER) {
    const ids = preflight.exportedRows[table].map((row) => String(row.id));
    deletedRows[table] = await deleteRows({ ...conn, ids, table });
    if (deletedRows[table].length !== ids.length) {
      throw new Error(
        `Delete count mismatch for ${table}: expected ${ids.length}, received ${deletedRows[table].length}`,
      );
    }
  }

  const remainingCatalog = await requestRows({
    ...conn,
    table: "micro_skill_catalog",
    filters: [["skill_family_key", "eq.D4_MOR"]],
    select: "micro_skill_key,is_active,is_assignable",
  });
  const remainingTargets = remainingCatalog.filter((row) =>
    TARGET_MICRO_SKILLS.includes(
      String(row.micro_skill_key) as (typeof TARGET_MICRO_SKILLS)[number],
    ),
  );
  const remainingCluster = await requestRows({
    ...conn,
    table: "micro_skill_clusters",
    filters: [["skill_cluster_key", `eq.${TARGET_CLUSTER}`]],
  });
  if (
    remainingCatalog.length !== 25 ||
    remainingTargets.length !== 0 ||
    remainingCluster.length !== 0
  ) {
    throw new Error(
      `Post-delete validation failed: D4_MOR=${remainingCatalog.length}, targets=${remainingTargets.length}, cluster=${remainingCluster.length}`,
    );
  }

  const receipt = {
    auditVersion: preflight.auditVersion,
    deletedCounts: Object.fromEntries(
      Object.entries(deletedRows).map(([table, rows]) => [table, rows.length]),
    ),
    environment: args.environment,
    generatedAt: new Date().toISOString(),
    postRemovalProof: {
      activeD4MorphologyMicroSkills: remainingCatalog.length,
      remainingClusterRows: remainingCluster.length,
      remainingTargetRows: remainingTargets.length,
      zeroRuntimeReferencesBeforeDeletion: true,
    },
    preflightExport: {
      path: preflightPath,
      sha256: createHash("sha256")
        .update(readFileSync(preflightPath))
        .digest("hex"),
    },
    projectRef: conn.projectRef,
    productionChanged: args.environment === "production",
    preserved: [
      "canonical_teaching_dictionary_words",
      "canonical_teaching_dictionary_sources",
      "canonical_teaching_dictionary_import_batches",
      "frozen July 2026 approved D4_MOR package",
      "frozen human-review artifacts",
    ],
    targetCluster: TARGET_CLUSTER,
    targetMicroSkills: [...TARGET_MICRO_SKILLS],
  };
  const receiptPath = artifactPath(args.environment, "retirement-receipt");
  writeArtifact(receiptPath, receipt);
  console.log(
    JSON.stringify({
      deletedCounts: receipt.deletedCounts,
      environment: args.environment,
      receipt: receiptPath,
      remainingD4MorphologyMicroSkills: remainingCatalog.length,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
