import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

type JsonRow = Record<string, unknown>;

const MICRO_SKILLS =
  "docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json";
const CLUSTERS =
  "docs/implementation/seed-data/domain4-seed-expansion/clusters.json";
const VALIDATION =
  "docs/implementation/seed-data/domain4-seed-expansion/validation-report.json";
const README =
  "docs/implementation/seed-data/domain4-seed-expansion/README.md";
const LEGACY_MORPHOLOGY =
  "docs/implementation/seed-data/domain4-morphology-node-seed-artifact.json";
const GLOBAL_MATRIX =
  "docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-global-control-matrix.csv";
const D4_MOR_MATRIX =
  "docs/implementation/seed-data/adle-7-ui/control-matrix/d4-mor-experience-readiness-matrix.csv";
const RETIRED_CLUSTER = "D4_MOR_WORD_FAMILIES";
const RETIRED_KEYS = new Set([
  "D4_MOR_WORD_FAMILIES_PRONUNCIATION_SHIFT",
  "D4_MOR_WORD_FAMILIES_RELATED_WORD_SUPPORT",
]);
const CLOSED_COMPOUND_KEY = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS";
const AWAITING_PROFILE_KEYS = new Set([
  "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED",
  "D4_MOR_ROOTS_COMMON_GREEK_ROOTS",
  "D4_MOR_ROOTS_COMMON_LATIN_ROOTS",
  "D4_MOR_ROOTS_ROOT_FAMILY_SPELLING",
  "D4_MOR_ROOTS_SCIENCE_MATH_ROOTS",
]);
const PRODUCTION_STATUS_RECONCILIATIONS = new Map([
  [
    "D4_MOR_PREFIXES_DIS_MIS",
    "Production batch 6b7350f2-200e-4443-ab0f-85e78b03e842 enabled the reviewed seven-member profile with no learner writes.",
  ],
  [
    "D4_MOR_PREFIXES_RE_PRE",
    "Production batch 016705bb-9a87-44ce-a610-596132240b9b enabled the reviewed seven-member profile with no learner writes.",
  ],
  [
    "D4_MOR_PREFIXES_IN_IM_IL_IR",
    "Production batch ead4be9e-33e6-4ee3-ad06-3f778ab9958d enabled seven reviewed members on 2026-07-28 with no learner writes.",
  ],
  [
    "D4_MOR_PREFIXES_SUB_INTER_SUPER",
    "Production batch 7fc4dc11-416f-42f1-936e-c398395afac8 enabled seven reviewed members on 2026-07-28 with no learner writes.",
  ],
  [
    "D4_MOR_PREFIXES_UN",
    "The reviewed seven-word un- profile is production-enabled through the independently gated generic dynamic prefix runtime; fixed v1 snapshots remain renderable.",
  ],
  [
    "D4_MOR_SUFFIXES_ABLE_IBLE",
    "Production batch a276c839-aab5-493a-a1b1-377e28e7fe52 enabled the reviewed four-member profile with no learner writes.",
  ],
  [
    CLOSED_COMPOUND_KEY,
    "Production batch 2f6db9a1-f844-4577-9631-c3740f6ea7ae enabled one reviewed dictionary-driven profile and seven explicit compound facts with no learner writes; deployment dpl_7QNw3SyH4weqWj573LT4LDDHHvUy is Ready.",
  ],
]);
const ADDITIONS: JsonRow[] = [
  {
    allowed_template_keys: ["T01", "T02", "T03", "T04", "T05", "T06"],
    display_name: "Spell words with suffix -ly",
    is_active: true,
    is_assignable: true,
    mastery_domain_key: "D4",
    metadata: {
      example_words: ["quickly", "slowly", "quietly", "happily"],
      seed_version: "dynamic-suffix-ly-v1",
    },
    micro_skill_key: "D4_MOR_SUFFIXES_LY",
    practice_route: "word_practice",
    skill_cluster_key: "D4_MOR_SUFFIXES",
    skill_family_key: "D4_MOR",
  },
  {
    allowed_template_keys: [
      "T02",
      "T01",
      "T04",
      "T03",
      "T05",
      "T06",
      "T09",
      "T10",
      "T11",
      "T12",
    ],
    display_name: "Spell words with suffix -sion",
    is_active: true,
    is_assignable: true,
    mastery_domain_key: "D4",
    metadata: {
      cluster_name: "Derivational suffixes",
      developmental_foundation: "Morphological awareness",
      example_words: ["decision", "division", "confusion", "expansion"],
      seed_version: "dynamic-suffix-sion-production-v1",
      source_workbook: "reviewed dynamic suffix -sion package",
      teaching_point:
        "The suffix -sion usually forms a noun for an action, process or result.",
    },
    micro_skill_key: "D4_MOR_SUFFIXES_SION",
    practice_route: "word_practice",
    skill_cluster_key: "D4_MOR_SUFFIXES",
    skill_family_key: "D4_MOR",
  },
  {
    allowed_template_keys: [
      "T02",
      "T01",
      "T04",
      "T03",
      "T05",
      "T06",
      "T09",
      "T10",
      "T11",
      "T12",
    ],
    display_name: "Spell words with suffix -tion",
    is_active: true,
    is_assignable: true,
    mastery_domain_key: "D4",
    metadata: {
      cluster_name: "Derivational suffixes",
      developmental_foundation: "Morphological awareness",
      example_words: ["action", "invention", "education", "celebration"],
      seed_version: "dynamic-suffix-tion-production-v1",
      source_workbook: "reviewed dynamic suffix -tion package",
      teaching_point:
        "The suffix -tion usually forms a noun for an action, process or result.",
    },
    micro_skill_key: "D4_MOR_SUFFIXES_TION",
    practice_route: "word_practice",
    skill_cluster_key: "D4_MOR_SUFFIXES",
    skill_family_key: "D4_MOR",
  },
];

function readJson<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(filePath: string) {
  return createHash("sha256")
    .update(readFileSync(filePath))
    .digest("hex");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function writeCsv(filePath: string, rows: string[][]) {
  writeFileSync(
    filePath,
    `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
    "utf8",
  );
}

function filterMatrix(
  filePath: string,
  keyColumn: string,
  update?: (header: string[], row: string[]) => void,
) {
  const rows = parseCsv(readFileSync(filePath, "utf8"));
  const keyIndex = rows[0].indexOf(keyColumn);
  if (keyIndex < 0) throw new Error(`${filePath} lacks ${keyColumn}`);
  const filtered = [
    rows[0],
    ...rows.slice(1).filter((row) => !RETIRED_KEYS.has(row[keyIndex])),
  ];
  for (const row of filtered.slice(1)) {
    if (filtered[0].length === 31 && row.length === 30) {
      row.splice(13, 0, "implemented_dynamic_suffix_word_lab_v3");
    }
    if (filtered[0].length === 17 && row.length > 17) {
      row.splice(16, row.length - 16, row.slice(16).join(","));
    }
    if (row.length !== filtered[0].length) {
      throw new Error(
        `${filePath} row ${row[keyIndex]} has ${row.length} fields; expected ${filtered[0].length}`,
      );
    }
  }
  for (const row of filtered.slice(1)) update?.(filtered[0], row);
  writeCsv(filePath, filtered);
  return filtered.length - 1;
}

function main() {
  const existing = readJson<JsonRow[]>(MICRO_SKILLS).filter(
    (row) => !RETIRED_KEYS.has(String(row.micro_skill_key)),
  );
  const existingKeys = new Set(existing.map((row) => String(row.micro_skill_key)));
  const insertionIndex =
    Math.max(
      ...existing.map((row, index) =>
        row.skill_cluster_key === "D4_MOR_SUFFIXES" ? index : -1,
      ),
    ) + 1;
  existing.splice(
    insertionIndex,
    0,
    ...ADDITIONS.filter(
      (row) => !existingKeys.has(String(row.micro_skill_key)),
    ),
  );
  writeJson(MICRO_SKILLS, existing);

  const clusters = readJson<JsonRow[]>(CLUSTERS).filter(
    (row) => row.skill_cluster_key !== RETIRED_CLUSTER,
  );
  writeJson(CLUSTERS, clusters);

  const legacy = readJson<{ morphology_node_count: number; nodes: JsonRow[] }>(
    LEGACY_MORPHOLOGY,
  );
  legacy.nodes = legacy.nodes.filter(
    (row) => row.cluster_id !== RETIRED_CLUSTER,
  );
  legacy.morphology_node_count = legacy.nodes.length;
  writeJson(LEGACY_MORPHOLOGY, legacy);

  const setColumn = (header: string[], row: string[], name: string, value: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Matrix lacks ${name}`);
    row[index] = value;
  };
  const globalRows = filterMatrix(
    GLOBAL_MATRIX,
    "micro_skill_key",
    (header, row) => {
      const key = row[header.indexOf("micro_skill_key")];
      const productionNote = PRODUCTION_STATUS_RECONCILIATIONS.get(key);
      if (productionNote) {
        setColumn(header, row, "content_activated_status", "production_enabled");
        setColumn(header, row, "full_interactive_readiness", "production_enabled");
        setColumn(header, row, "degraded_interactive_readiness", "production_enabled");
        setColumn(header, row, "warm_shell_readiness", "production_enabled");
        setColumn(header, row, "runtime_implemented_status", "implemented_shared_runtime");
        setColumn(header, row, "runtime_enabled_status", "production_enabled");
        setColumn(header, row, "validation_complete_status", "verified_in_production");
        setColumn(header, row, "notes", productionNote);
      }
      if (key === CLOSED_COMPOUND_KEY) {
        setColumn(header, row, "content_authored_status", "reviewed_production_package");
        setColumn(header, row, "content_reviewed_status", "human_approved_2026_07_30");
        setColumn(header, row, "metadata_readiness_status", "approved_dictionary_pool_7");
        setColumn(header, row, "micro_skill_design_status", "closed_compound_word_lab_v1");
        setColumn(header, row, "lesson_designed_status", "implemented_closed_compound_word_lab_v1");
        setColumn(header, row, "experience_profile_key", "closed_compound_word_lab_v1");
        setColumn(header, row, "runtime_implemented_status", "implemented_closed_compound_word_lab_v1");
        setColumn(header, row, "owner_validation_status", "owner_approved_2026_07_30");
        setColumn(header, row, "child_validation_status", "child_verified_2026_07_30");
        setColumn(
          header,
          row,
          "source_artifact_ref",
          "data/adle/candidates/d4-mor-remaining-profiles/v1/closed-compounds-dictionary-pool-review.json",
        );
      }
      if (!AWAITING_PROFILE_KEYS.has(key)) return;
      setColumn(header, row, "content_authored_status", "profile_candidate_prepared");
      setColumn(
        header,
        row,
        "content_reviewed_status",
        "historical_source_reviewed_profile_specific_review_pending",
      );
      setColumn(header, row, "content_activated_status", "not_activated");
      setColumn(
        header,
        row,
        "metadata_readiness_status",
        "fail_closed_live_dictionary_incomplete",
      );
      setColumn(header, row, "micro_skill_design_status", "profile_candidate_prepared");
      setColumn(
        header,
        row,
        "lesson_designed_status",
        "immutable_profile_shape_candidate_prepared",
      );
      setColumn(
        header,
        row,
        "experience_profile_key",
        "morphology_profile_package_v1_candidate",
      );
      setColumn(
        header,
        row,
        "full_interactive_readiness",
        "blocked_pending_dictionary_and_profile_approval",
      );
      setColumn(header, row, "runtime_implemented_status", "not_started");
      setColumn(header, row, "runtime_enabled_status", "not_enabled");
      setColumn(
        header,
        row,
        "validation_complete_status",
        "source_package_validated_runtime_not_validated",
      );
      setColumn(
        header,
        row,
        "source_artifact_ref",
        "data/adle/candidates/d4-mor-remaining-profiles/v1/manifest.json",
      );
      setColumn(
        header,
        row,
        "notes",
        "Disabled four-word profile candidate prepared from immutable reviewed source; profile-specific human approval, complete released Teaching Dictionary facts, staging import/proof and separate production authority remain required.",
      );
    },
  );
  const morphologyRows = filterMatrix(
    D4_MOR_MATRIX,
    "micro_skill_key",
    (header, row) => {
      const key = row[header.indexOf("micro_skill_key")];
      const productionNote = PRODUCTION_STATUS_RECONCILIATIONS.get(key);
      if (productionNote) {
        setColumn(header, row, "content_activated_status", "production_enabled");
        setColumn(header, row, "design_status", "implemented_shared_runtime");
        setColumn(header, row, "readiness_notes", productionNote);
      }
      if (key === CLOSED_COMPOUND_KEY) {
        setColumn(header, row, "content_authored_status", "reviewed_production_package");
        setColumn(header, row, "content_reviewed_status", "human_approved_2026_07_30");
        setColumn(header, row, "schema_reconciliation_status", "closed_compound_dictionary_profile_v1");
        setColumn(header, row, "design_status", "implemented_closed_compound_word_lab_v1");
      }
      if (!AWAITING_PROFILE_KEYS.has(key)) return;
      setColumn(header, row, "content_authored_status", "profile_candidate_prepared");
      setColumn(
        header,
        row,
        "content_reviewed_status",
        "historical_source_reviewed_profile_specific_review_pending",
      );
      setColumn(header, row, "content_activated_status", "not_activated");
      setColumn(
        header,
        row,
        "schema_reconciliation_status",
        "morphology_profile_package_v1_candidate",
      );
      setColumn(header, row, "design_status", "profile_candidate_prepared_disabled");
      setColumn(
        header,
        row,
        "readiness_notes",
        "Disabled four-word candidate prepared at data/adle/candidates/d4-mor-remaining-profiles/v1/; complete released dictionary facts and profile-specific review/proof remain required.",
      );
    },
  );

  const familyCounts = Object.fromEntries(
    [...new Set(existing.map((row) => String(row.skill_family_key)))]
      .sort()
      .map((family) => [
        family,
        existing.filter((row) => row.skill_family_key === family).length,
      ]),
  );
  const validation = readJson<Record<string, unknown>>(VALIDATION);
  validation.expected_counts = {
    ...(validation.expected_counts as Record<string, unknown>),
    clusters: 46,
    micro_skills: 241,
  };
  validation.actual_counts = {
    ...(validation.actual_counts as Record<string, unknown>),
    clusters: clusters.length,
    micro_skills: existing.length,
  };
  validation.family_skill_counts = familyCounts;
  validation.current_taxonomy_reconciliation = {
    added_micro_skills: ADDITIONS.map((row) => row.micro_skill_key),
    retired_cluster_count: 1,
    retired_micro_skill_count: RETIRED_KEYS.size,
    retirement_receipt:
      "docs/implementation/qa/adle-d4-mor-word-families-staging-retirement-receipt-2026-07-29.json",
    source: "live staging and production taxonomy audit 2026-07-29",
  };
  writeJson(VALIDATION, validation);
  validation.artifact_sha256 = {
    clusters: sha256(CLUSTERS),
    micro_skills: sha256(MICRO_SKILLS),
  };
  writeJson(VALIDATION, validation);

  let readme = readFileSync(README, "utf8");
  readme = readme
    .replace(/- `47` clusters/g, "- `46` current clusters")
    .replace(/- `240` micro-skills/g, "- `241` current micro-skills")
    .replace(
      /- `micro_skill_clusters`: `47`/g,
      "- `micro_skill_clusters`: `46`",
    )
    .replace(
      /- `micro_skill_catalog`: `240`/g,
      "- `micro_skill_catalog`: `241`",
    )
    .replace(
      /- `47` Domain 4 clusters/g,
      "- `46` current Domain 4 clusters",
    )
    .replace(
      /- `240` Domain 4 micro-skills/g,
      "- `241` current Domain 4 micro-skills",
    )
    .replace(
      /- `240` active assignable Domain 4 micro-skills/g,
      "- `241` active assignable Domain 4 micro-skills",
    );
  writeFileSync(README, readme, "utf8");

  if (
    existing.length !== 241 ||
    familyCounts.D4_MOR !== 25 ||
    clusters.length !== 46 ||
    globalRows !== 241 ||
    morphologyRows !== 25 ||
    legacy.morphology_node_count !== 96
  ) {
    throw new Error(
      JSON.stringify({
        clusters: clusters.length,
        globalRows,
        legacyMorphologyNodes: legacy.morphology_node_count,
        microSkills: existing.length,
        morphologyRows,
        morphologySkills: familyCounts.D4_MOR,
      }),
    );
  }
  console.log(
    JSON.stringify({
      clusters: clusters.length,
      globalRows,
      legacyMorphologyNodes: legacy.morphology_node_count,
      microSkills: existing.length,
      morphologyRows,
      morphologySkills: familyCounts.D4_MOR,
      validationHashes: validation.artifact_sha256,
    }),
  );
}

main();
