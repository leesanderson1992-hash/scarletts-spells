import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

type CatalogFamily = {
  id: string;
  mastery_domain_key: string;
  skill_family_key: string;
  display_name: string;
  is_active: boolean;
  is_assignable: boolean;
  metadata: JsonRecord | null;
};

type CatalogCluster = {
  id: string;
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string;
  display_name: string;
  is_active: boolean;
  is_assignable: boolean;
  metadata: JsonRecord | null;
};

type CatalogMicroSkill = {
  id: string;
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string | null;
  micro_skill_key: string;
  display_name: string;
  practice_route: string;
  is_active: boolean;
  is_assignable: boolean;
  allowed_template_keys: string[];
  metadata: JsonRecord | null;
};

type ArtifactFamily = {
  skill_family_key: string;
  display_name: string;
  is_active: boolean;
  is_assignable: boolean;
  metadata: JsonRecord;
};

type ArtifactCluster = {
  skill_family_key: string;
  skill_cluster_key: string;
  display_name: string;
  is_active: boolean;
  is_assignable: boolean;
  metadata: JsonRecord;
};

type ArtifactMicroSkill = {
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

type ReferenceSummary = {
  direct_columns: Record<string, Record<string, number>>;
  linked_rows: Record<string, number>;
  metadata_snapshots: Record<string, number>;
};

type TableRow = Record<string, unknown> & { id?: string };

const ARTIFACT_DIR = "docs/implementation/seed-data/domain4-seed-expansion";
const PAGE_SIZE = 1000;

function loadDotEnvLocal() {
  const envPath = ".env.local";

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");

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

function keySet(values: string[]) {
  return new Set(values.filter(Boolean));
}

function sorted(values: Iterable<string>) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function difference(left: Set<string>, right: Set<string>) {
  return sorted([...left].filter((value) => !right.has(value)));
}

function intersection(left: Set<string>, right: Set<string>) {
  return sorted([...left].filter((value) => right.has(value)));
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function summarizeChangedFamilies(
  currentRows: CatalogFamily[],
  artifactRows: ArtifactFamily[],
) {
  const currentByKey = new Map(currentRows.map((row) => [row.skill_family_key, row]));
  const changes: string[] = [];

  for (const artifact of artifactRows) {
    const current = currentByKey.get(artifact.skill_family_key);

    if (!current) {
      continue;
    }

    if (
      current.display_name !== artifact.display_name ||
      current.is_active !== artifact.is_active ||
      current.is_assignable !== artifact.is_assignable ||
      !jsonEqual(current.metadata, artifact.metadata)
    ) {
      changes.push(artifact.skill_family_key);
    }
  }

  return changes.sort();
}

function summarizeChangedClusters(
  currentRows: CatalogCluster[],
  artifactRows: ArtifactCluster[],
) {
  const currentByKey = new Map(currentRows.map((row) => [row.skill_cluster_key, row]));
  const changes: string[] = [];

  for (const artifact of artifactRows) {
    const current = currentByKey.get(artifact.skill_cluster_key);

    if (!current) {
      continue;
    }

    if (
      current.skill_family_key !== artifact.skill_family_key ||
      current.display_name !== artifact.display_name ||
      current.is_active !== artifact.is_active ||
      current.is_assignable !== artifact.is_assignable ||
      !jsonEqual(current.metadata, artifact.metadata)
    ) {
      changes.push(artifact.skill_cluster_key);
    }
  }

  return changes.sort();
}

function summarizeChangedMicroSkills(
  currentRows: CatalogMicroSkill[],
  artifactRows: ArtifactMicroSkill[],
) {
  const currentByKey = new Map(currentRows.map((row) => [row.micro_skill_key, row]));
  const changes: string[] = [];

  for (const artifact of artifactRows) {
    const current = currentByKey.get(artifact.micro_skill_key);

    if (!current) {
      continue;
    }

    if (
      current.skill_family_key !== artifact.skill_family_key ||
      current.skill_cluster_key !== artifact.skill_cluster_key ||
      current.display_name !== artifact.display_name ||
      current.practice_route !== artifact.practice_route ||
      current.is_active !== artifact.is_active ||
      current.is_assignable !== artifact.is_assignable ||
      !arraysEqual(current.allowed_template_keys ?? [], artifact.allowed_template_keys ?? []) ||
      !jsonEqual(current.metadata, artifact.metadata)
    ) {
      changes.push(artifact.micro_skill_key);
    }
  }

  return changes.sort();
}

function countValues(rows: TableRow[], column: string, keys: Set<string>) {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    const value = row[column];

    if (typeof value === "string" && keys.has(value)) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }

  return counts;
}

function countJsonMentions(rows: TableRow[], columns: string[], keys: Set<string>) {
  let count = 0;

  for (const row of rows) {
    const haystack = columns
      .map((column) => row[column])
      .filter((value) => value !== null && value !== undefined)
      .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
      .join("\n");

    if ([...keys].some((key) => haystack.includes(key))) {
      count += 1;
    }
  }

  return count;
}

async function fetchAll<T extends TableRow>(
  // Supabase's generated DB type is not wired into this standalone utility.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createClient<any>>,
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
      throw new Error(`${table} audit query failed: ${error.message}`);
    }

    rows.push(...((data ?? []) as unknown as T[]));

    if (!data || data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

function buildReferenceSummary(input: {
  staleMicroSkillKeys: Set<string>;
  staleFamilyKeys: Set<string>;
  staleClusterKeys: Set<string>;
  rows: Record<string, TableRow[]>;
}) {
  const allStaleKeys = new Set([
    ...input.staleMicroSkillKeys,
    ...input.staleFamilyKeys,
    ...input.staleClusterKeys,
  ]);

  const learningItemsWithStaleKeys = input.rows.learning_items.filter((row) => {
    return (
      typeof row.micro_skill_key === "string" &&
      input.staleMicroSkillKeys.has(row.micro_skill_key)
    );
  });
  const staleLearningItemIds = keySet(
    learningItemsWithStaleKeys.map((row) => String(row.id ?? "")),
  );
  const writingIssuesWithStaleKeys = input.rows.writing_issues.filter((row) => {
    return (
      typeof row.micro_skill_key === "string" &&
      input.staleMicroSkillKeys.has(row.micro_skill_key)
    );
  });
  const staleWritingIssueIds = keySet(
    writingIssuesWithStaleKeys.map((row) => String(row.id ?? "")),
  );

  const summary: ReferenceSummary = {
    direct_columns: {
      learning_items_micro_skill_key: countValues(
        input.rows.learning_items,
        "micro_skill_key",
        input.staleMicroSkillKeys,
      ),
      learning_items_skill_family_key: countValues(
        input.rows.learning_items,
        "skill_family_key",
        input.staleFamilyKeys,
      ),
      learning_items_skill_cluster_key: countValues(
        input.rows.learning_items,
        "skill_cluster_key",
        input.staleClusterKeys,
      ),
      writing_issues_micro_skill_key: countValues(
        input.rows.writing_issues,
        "micro_skill_key",
        input.staleMicroSkillKeys,
      ),
      writing_issue_suggestions_suggested_micro_skill_key: countValues(
        input.rows.writing_issue_suggestions,
        "suggested_micro_skill_key",
        input.staleMicroSkillKeys,
      ),
      parent_verifications_suggested_micro_skill_key: countValues(
        input.rows.parent_verifications,
        "suggested_micro_skill_key",
        input.staleMicroSkillKeys,
      ),
      parent_verifications_verified_micro_skill_key: countValues(
        input.rows.parent_verifications,
        "verified_micro_skill_key",
        input.staleMicroSkillKeys,
      ),
      parent_verified_spelling_candidate_mappings_micro_skill_key: countValues(
        input.rows.parent_verified_spelling_candidate_mappings,
        "micro_skill_key",
        input.staleMicroSkillKeys,
      ),
      spelling_canonical_mappings_micro_skill_key: countValues(
        input.rows.spelling_canonical_mappings,
        "micro_skill_key",
        input.staleMicroSkillKeys,
      ),
      spelling_canonical_mapping_recommendations_micro_skill_key: countValues(
        input.rows.spelling_canonical_mapping_recommendations,
        "micro_skill_key",
        input.staleMicroSkillKeys,
      ),
      spelling_catalog_review_case_decisions_linked_micro_skill_key: countValues(
        input.rows.spelling_catalog_review_case_decisions,
        "linked_micro_skill_key",
        input.staleMicroSkillKeys,
      ),
    },
    linked_rows: {
      learning_items: learningItemsWithStaleKeys.length,
      learning_item_evidence_by_learning_item_id:
        input.rows.learning_item_evidence.filter((row) =>
          staleLearningItemIds.has(String(row.learning_item_id ?? "")),
        ).length,
      learning_item_evidence_by_writing_issue_id:
        input.rows.learning_item_evidence.filter((row) =>
          staleWritingIssueIds.has(String(row.writing_issue_id ?? "")),
        ).length,
      assignment_items_by_learning_item_id:
        input.rows.assignment_items.filter((row) =>
          staleLearningItemIds.has(String(row.learning_item_id ?? "")),
        ).length,
      writing_issues: writingIssuesWithStaleKeys.length,
    },
    metadata_snapshots: {
      learning_items: countJsonMentions(input.rows.learning_items, ["metadata"], allStaleKeys),
      learning_item_evidence: countJsonMentions(
        input.rows.learning_item_evidence,
        ["metadata", "source_context"],
        allStaleKeys,
      ),
      assignment_items: countJsonMentions(
        input.rows.assignment_items,
        ["metadata", "prompt_data", "expected_answer", "source_entity_id", "template_key"],
        allStaleKeys,
      ),
      writing_issues: countJsonMentions(
        input.rows.writing_issues,
        ["metadata", "notes", "parent_review_note"],
        allStaleKeys,
      ),
      writing_issue_suggestions: countJsonMentions(
        input.rows.writing_issue_suggestions,
        ["metadata", "notes"],
        allStaleKeys,
      ),
      parent_verifications: countJsonMentions(
        input.rows.parent_verifications,
        ["metadata", "suggestion_payload", "verification_notes"],
        allStaleKeys,
      ),
      parent_verified_spelling_candidate_mappings: countJsonMentions(
        input.rows.parent_verified_spelling_candidate_mappings,
        ["metadata", "reviewed_event_source_entity_id"],
        allStaleKeys,
      ),
      spelling_canonical_mappings: countJsonMentions(
        input.rows.spelling_canonical_mappings,
        ["metadata", "decision_note", "deactivation_note"],
        allStaleKeys,
      ),
      spelling_canonical_mapping_recommendations: countJsonMentions(
        input.rows.spelling_canonical_mapping_recommendations,
        ["metadata", "recommendation_note", "review_note", "reviewed_event_source_entity_id"],
        allStaleKeys,
      ),
      spelling_catalog_review_case_decisions: countJsonMentions(
        input.rows.spelling_catalog_review_case_decisions,
        ["metadata", "decision_note"],
        allStaleKeys,
      ),
    },
  };

  return summary;
}

function totalDirectReferences(summary: ReferenceSummary) {
  return Object.values(summary.direct_columns).reduce((total, counts) => {
    return total + Object.values(counts).reduce((innerTotal, count) => innerTotal + count, 0);
  }, 0);
}

function totalMetadataReferences(summary: ReferenceSummary) {
  return Object.values(summary.metadata_snapshots).reduce((total, count) => total + count, 0);
}

function totalLinkedRows(summary: ReferenceSummary) {
  return Object.values(summary.linked_rows).reduce((total, count) => total + count, 0);
}

async function main() {
  loadDotEnvLocal();

  const url = readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const outputArgIndex = process.argv.indexOf("--output");
  const outputPath =
    outputArgIndex >= 0 && process.argv[outputArgIndex + 1]
      ? process.argv[outputArgIndex + 1]
      : null;

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const artifactFamilies = readJson<ArtifactFamily[]>(
    path.join(ARTIFACT_DIR, "families.json"),
  );
  const artifactClusters = readJson<ArtifactCluster[]>(
    path.join(ARTIFACT_DIR, "clusters.json"),
  );
  const artifactMicroSkills = readJson<ArtifactMicroSkill[]>(
    path.join(ARTIFACT_DIR, "micro-skills.json"),
  );
  const validationReport = readJson<JsonRecord>(
    path.join(ARTIFACT_DIR, "validation-report.json"),
  );

  const [families, clusters, microSkills] = await Promise.all([
    fetchAll<CatalogFamily>(
      supabase,
      "micro_skill_families",
      "id, mastery_domain_key, skill_family_key, display_name, is_active, is_assignable, metadata",
      (query) => query.eq("mastery_domain_key", "D4").order("skill_family_key"),
    ),
    fetchAll<CatalogCluster>(
      supabase,
      "micro_skill_clusters",
      "id, mastery_domain_key, skill_family_key, skill_cluster_key, display_name, is_active, is_assignable, metadata",
      (query) => query.eq("mastery_domain_key", "D4").order("skill_cluster_key"),
    ),
    fetchAll<CatalogMicroSkill>(
      supabase,
      "micro_skill_catalog",
      "id, mastery_domain_key, skill_family_key, skill_cluster_key, micro_skill_key, display_name, practice_route, is_active, is_assignable, allowed_template_keys, metadata",
      (query) => query.eq("mastery_domain_key", "D4").order("micro_skill_key"),
    ),
  ]);

  const currentFamilyKeys = keySet(families.map((row) => row.skill_family_key));
  const currentClusterKeys = keySet(clusters.map((row) => row.skill_cluster_key));
  const currentMicroSkillKeys = keySet(microSkills.map((row) => row.micro_skill_key));
  const artifactFamilyKeys = keySet(artifactFamilies.map((row) => row.skill_family_key));
  const artifactClusterKeys = keySet(artifactClusters.map((row) => row.skill_cluster_key));
  const artifactMicroSkillKeys = keySet(
    artifactMicroSkills.map((row) => row.micro_skill_key),
  );

  const staleFamilyKeys = keySet(difference(currentFamilyKeys, artifactFamilyKeys));
  const staleClusterKeys = keySet(difference(currentClusterKeys, artifactClusterKeys));
  const staleMicroSkillKeys = keySet(
    difference(currentMicroSkillKeys, artifactMicroSkillKeys),
  );

  const allCurrentOrStaleMicroSkillKeys = keySet([
    ...currentMicroSkillKeys,
    ...artifactMicroSkillKeys,
  ]);

  const rows = {
    learning_items: await fetchAll<TableRow>(
      supabase,
      "learning_items",
      "id, micro_skill_key, skill_family_key, skill_cluster_key, metadata",
    ),
    learning_item_evidence: await fetchAll<TableRow>(
      supabase,
      "learning_item_evidence",
      "id, learning_item_id, writing_issue_id, source_context, metadata",
    ),
    assignment_items: await fetchAll<TableRow>(
      supabase,
      "assignment_items",
      "id, learning_item_id, source_entity_id, template_key, prompt_data, expected_answer, metadata",
      (query) => query.eq("domain_module", "spelling"),
    ),
    writing_issues: await fetchAll<TableRow>(
      supabase,
      "writing_issues",
      "id, micro_skill_key, metadata, notes, parent_review_note",
    ),
    writing_issue_suggestions: await fetchAll<TableRow>(
      supabase,
      "writing_issue_suggestions",
      "id, suggested_micro_skill_key, metadata, notes",
    ),
    parent_verifications: await fetchAll<TableRow>(
      supabase,
      "parent_verifications",
      "id, suggested_micro_skill_key, verified_micro_skill_key, suggestion_payload, metadata, verification_notes",
      (query) => query.eq("domain_module", "spelling"),
    ),
    parent_verified_spelling_candidate_mappings: await fetchAll<TableRow>(
      supabase,
      "parent_verified_spelling_candidate_mappings",
      "id, micro_skill_key, reviewed_event_source_entity_id, metadata",
    ),
    spelling_canonical_mappings: await fetchAll<TableRow>(
      supabase,
      "spelling_canonical_mappings",
      "id, micro_skill_key, metadata, decision_note, deactivation_note",
    ),
    spelling_canonical_mapping_recommendations: await fetchAll<TableRow>(
      supabase,
      "spelling_canonical_mapping_recommendations",
      "id, micro_skill_key, metadata, recommendation_note, review_note, reviewed_event_source_entity_id",
    ),
    spelling_catalog_review_case_decisions: await fetchAll<TableRow>(
      supabase,
      "spelling_catalog_review_case_decisions",
      "id, linked_micro_skill_key, metadata, decision_note",
    ),
  };

  const referenceSummary = buildReferenceSummary({
    staleMicroSkillKeys,
    staleFamilyKeys,
    staleClusterKeys,
    rows,
  });

  const report = {
    generated_at: new Date().toISOString(),
    mode: "read_only_audit_and_import_planning",
    source_artifacts: {
      directory: ARTIFACT_DIR,
      validation_expected_counts: validationReport.expected_counts,
      validation_actual_counts: validationReport.actual_counts,
      validation_excluded_rows: validationReport.excluded_rows,
    },
    current_state_counts: {
      families: families.length,
      clusters: clusters.length,
      micro_skills: microSkills.length,
      active_assignable_micro_skills: microSkills.filter(
        (row) => row.is_active && row.is_assignable,
      ).length,
    },
    generated_artifact_counts: {
      families: artifactFamilies.length,
      clusters: artifactClusters.length,
      micro_skills: artifactMicroSkills.length,
    },
    taxonomy_key_diff: {
      families: {
        stale_in_db_not_artifact: difference(currentFamilyKeys, artifactFamilyKeys),
        new_in_artifact_not_db: difference(artifactFamilyKeys, currentFamilyKeys),
        shared_changed: summarizeChangedFamilies(families, artifactFamilies),
        shared_unchanged: intersection(currentFamilyKeys, artifactFamilyKeys).filter(
          (key) => !summarizeChangedFamilies(families, artifactFamilies).includes(key),
        ),
      },
      clusters: {
        stale_in_db_not_artifact: difference(currentClusterKeys, artifactClusterKeys),
        new_in_artifact_not_db: difference(artifactClusterKeys, currentClusterKeys),
        shared_changed: summarizeChangedClusters(clusters, artifactClusters),
        shared_unchanged: intersection(currentClusterKeys, artifactClusterKeys).filter(
          (key) => !summarizeChangedClusters(clusters, artifactClusters).includes(key),
        ),
      },
      micro_skills: {
        stale_in_db_not_artifact: difference(
          currentMicroSkillKeys,
          artifactMicroSkillKeys,
        ),
        new_in_artifact_not_db: difference(
          artifactMicroSkillKeys,
          currentMicroSkillKeys,
        ),
        shared_changed: summarizeChangedMicroSkills(microSkills, artifactMicroSkills),
        shared_unchanged: intersection(
          currentMicroSkillKeys,
          artifactMicroSkillKeys,
        ).filter(
          (key) => !summarizeChangedMicroSkills(microSkills, artifactMicroSkills).includes(key),
        ),
      },
    },
    dependent_reference_summary_for_stale_keys: referenceSummary,
    dependent_reference_totals_for_stale_keys: {
      direct_column_references: totalDirectReferences(referenceSummary),
      linked_rows: totalLinkedRows(referenceSummary),
      metadata_snapshot_rows: totalMetadataReferences(referenceSummary),
    },
    read_only_import_plan: {
      backup_first: [
        "Export current D4 micro_skill_families, micro_skill_clusters, and micro_skill_catalog rows.",
        "Export dependent rows/references summarized in this audit before destructive cleanup.",
        "Store exports under a timestamped .tmp/catalog-reset-backups/ or .tmp/domain4-seed-expansion-audit/ folder.",
      ],
      stale_row_handling: [
        "Hard-delete stale D4 taxonomy rows that are absent from generated artifacts only after backup/export succeeds.",
        "If stale rows are referenced by disposable test data, clear dependent rows in dependency order before deleting taxonomy rows.",
        "Never leave stale families, clusters, or micro-skills active/assignable.",
      ],
      import_order: [
        "Clear disposable dependent references if required by stale-key audit.",
        "Delete stale micro_skill_catalog rows.",
        "Delete stale micro_skill_clusters rows.",
        "Delete stale micro_skill_families rows.",
        "Upsert generated families.",
        "Upsert generated clusters.",
        "Upsert generated micro-skills with word_practice and metadata-derived word/example data.",
      ],
      deferred: [
        "Do not import task templates into runtime tables in this pass.",
        "Do not enable grouped_set_practice routing in this pass.",
        "Do not change resolver visibility or canonical mapping behavior.",
      ],
    },
    blockers_before_mutation:
      totalDirectReferences(referenceSummary) > 0 || totalMetadataReferences(referenceSummary) > 0
        ? [
            "Stale keys are still referenced. Back up/export and clear disposable dependent rows before deletion.",
          ]
        : [],
  };

  const json = JSON.stringify(report, null, 2);

  if (outputPath) {
    writeFileSync(outputPath, `${json}\n`, "utf8");
  }

  console.log(json);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
