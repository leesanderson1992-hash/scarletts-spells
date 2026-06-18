import assert from "assert";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const LOCAL_CONFIRM = "LOCAL_SLICE_4F_HIDDEN_CANONICAL_ADOPTION_SMOKE";
const STAGING_CONFIRM = "STAGING_SLICE_4F_HIDDEN_CANONICAL_ADOPTION_SMOKE";
const STAGING_SUPABASE_HOST = "jlhotktspjvffslvuyfz.supabase.co";
const PRODUCTION_SUPABASE_HOST = "wwohrqtunajrbwxyssjf.supabase.co";
const SMOKE_SOURCE = "slice_4f_hidden_canonical_adoption_smoke";
const SMOKE_ADMIN_USER_ID = "00000000-0000-4000-8000-000000004f10";
const SMOKE_ADMIN_EMAIL = "slice-4f-hidden-canonical-smoke@example.test";

const PROTECTED_TABLES = [
  "spelling_canonical_mapping_recommendations",
  "spelling_catalog_review_cases",
  "spelling_catalog_review_case_decisions",
  "parent_verified_spelling_candidate_mappings",
  "learning_items",
  "assignment_items",
  "learning_item_evidence",
  "writing_issues",
  "parent_verifications",
  "spelling_reward_events",
  "spelling_reward_states",
  "lesson_templates",
  "task_completions",
  "task_day_plans",
] as const;

type Args = {
  allowStaging?: boolean;
  confirm?: string;
  help?: boolean;
  supabaseServiceRoleKey?: string;
  supabaseUrl?: string;
};

type SmokeMicroSkill = {
  micro_skill_key: string;
  mastery_domain_key: string;
  is_active: boolean;
  is_assignable: boolean;
};

type SmokeRow = {
  id: string;
  row_status: string;
  canonical_mapping_id: string | null;
  metadata: Record<string, unknown>;
};

type SmokeMapping = {
  id: string;
  mapping_status: string;
  resolver_visibility_status: string;
  source_seed_import_row_id: string | null;
  micro_skill_key: string;
  metadata: Record<string, unknown>;
};

type SmokeEvent = {
  event_type: string;
  previous_resolver_visibility_status: string | null;
  new_resolver_visibility_status: string | null;
  source_seed_import_row_id: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--allow-staging":
        args.allowStaging = true;
        break;
      case "--confirm":
        args.confirm = next();
        break;
      case "--supabase-url":
        args.supabaseUrl = next();
        break;
      case "--supabase-service-role-key":
        args.supabaseServiceRoleKey = next();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  args.supabaseUrl =
    args.supabaseUrl ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  args.supabaseServiceRoleKey =
    args.supabaseServiceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  args.confirm = args.confirm ?? "";
  return args;
}

function help() {
  return [
    "Slice 4F.1 local/staging hidden-canonical adoption smoke",
    "",
    "Local usage:",
    `  npm run writing-engine:seed-import-hidden-canonical-adoption-local-smoke -- --supabase-url http://127.0.0.1:54321 --supabase-service-role-key <local-service-role-key> --confirm ${LOCAL_CONFIRM}`,
    "",
    "Staging usage:",
    `  npm run writing-engine:seed-import-hidden-canonical-adoption-local-smoke -- --supabase-url https://${STAGING_SUPABASE_HOST} --supabase-service-role-key <staging-service-role-key> --allow-staging --confirm ${STAGING_CONFIRM}`,
    "",
    "This smoke creates synthetic seed-import evidence and hidden canonical mapping truth only on local or explicitly confirmed staging targets. It refuses production.",
  ].join("\n");
}

function assertNonEmpty(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function isLocalSupabaseUrl(value: string) {
  const parsed = new URL(value);
  return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
}

function assertAllowedTarget(args: Args) {
  const supabaseUrl = assertNonEmpty(args.supabaseUrl, "Supabase URL");
  const serviceRoleKey = assertNonEmpty(
    args.supabaseServiceRoleKey,
    "Supabase service-role key",
  );
  const parsed = new URL(supabaseUrl);

  if (parsed.hostname === PRODUCTION_SUPABASE_HOST) {
    throw new Error("Slice 4F.1 smoke refuses the production Supabase project.");
  }

  if (isLocalSupabaseUrl(supabaseUrl)) {
    if (args.confirm !== LOCAL_CONFIRM) {
      throw new Error(`Refusing local smoke without --confirm ${LOCAL_CONFIRM}.`);
    }

    return {
      serviceRoleKey,
      supabaseUrl,
      targetKind: "local" as const,
    };
  }

  if (parsed.hostname === STAGING_SUPABASE_HOST) {
    if (!args.allowStaging || args.confirm !== STAGING_CONFIRM) {
      throw new Error(
        `Refusing staging smoke without --allow-staging --confirm ${STAGING_CONFIRM}.`,
      );
    }

    return {
      serviceRoleKey,
      supabaseUrl,
      targetKind: "staging" as const,
    };
  }

  throw new Error(
    "Slice 4F.1 smoke refuses non-local targets unless they are the explicitly named staging Supabase URL.",
  );
}

async function countTable(client: { from: (table: string) => any }, table: string) {
  const { count, error } = await client.from(table).select("*", {
    count: "exact",
    head: true,
  });
  if (error) {
    throw new Error(`Unable to count ${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function protectedCounts(client: { from: (table: string) => any }) {
  return Object.fromEntries(
    await Promise.all(
      PROTECTED_TABLES.map(async (table) => [table, await countTable(client, table)]),
    ),
  );
}

async function fetchSmokeSkill(client: { from: (table: string) => any }) {
  const { data, error } = await client
    .from("micro_skill_catalog")
    .select("micro_skill_key, mastery_domain_key, is_active, is_assignable")
    .eq("mastery_domain_key", "D4")
    .eq("is_active", true)
    .eq("is_assignable", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to read micro_skill_catalog: ${error.message}`);
  }

  if (!data) {
    throw new Error("Slice 4F.1 smoke requires at least one active assignable D4 micro-skill.");
  }

  return data as SmokeMicroSkill;
}

async function fetchMicroSkillSnapshot(
  client: { from: (table: string) => any },
  microSkillKey: string,
) {
  const [count, rowResult] = await Promise.all([
    countTable(client, "micro_skill_catalog"),
    client
      .from("micro_skill_catalog")
      .select("micro_skill_key, mastery_domain_key, is_active, is_assignable")
      .eq("micro_skill_key", microSkillKey)
      .maybeSingle(),
  ]);

  if (rowResult.error) {
    throw new Error(`Unable to read selected micro_skill_catalog row: ${rowResult.error.message}`);
  }

  return {
    count,
    selectedSkill: rowResult.data as SmokeMicroSkill | null,
  };
}

async function insertSyntheticSeedRow(input: {
  client: { from: (table: string) => any };
  microSkillKey: string;
  stamp: string;
}) {
  const sourceFileName = `slice-4f-hidden-canonical-smoke-${input.stamp}.csv`;
  const sourceFileSha256 = crypto
    .createHash("sha256")
    .update(`${SMOKE_SOURCE}:${input.stamp}:${input.microSkillKey}`)
    .digest("hex");

  const { data: batchData, error: batchError } = await input.client
    .from("spelling_seed_import_batches")
    .insert({
      batch_name: `slice-4f-hidden-canonical-smoke-${input.stamp}`,
      batch_status: "pending_candidate_review",
      candidate_review_row_count: 1,
      conflict_row_count: 0,
      created_by_admin_email: SMOKE_ADMIN_EMAIL,
      created_by_admin_user_id: SMOKE_ADMIN_USER_ID,
      dry_run_generated_at: new Date().toISOString(),
      dry_run_report_schema_version: "slice_4f_hidden_canonical_smoke_v1",
      dry_run_report_sha256: crypto
        .createHash("sha256")
        .update(`slice-4f-report:${input.stamp}`)
        .digest("hex"),
      input_format: "csv",
      manual_review_row_count: 0,
      metadata: {
        action_source: SMOKE_SOURCE,
        smoke_test: true,
        synthetic_only: true,
      },
      rejected_row_count: 0,
      source_dataset: "slice-4f-hidden-canonical-smoke-dataset",
      source_file_name: sourceFileName,
      source_file_sha256: sourceFileSha256,
      source_license_note: "Synthetic local/staging-only smoke data; not learner evidence.",
      source_name: SMOKE_SOURCE,
      total_row_count: 1,
      validation_context: {
        action_source: SMOKE_SOURCE,
        smoke_test: true,
        synthetic_only: true,
      },
    })
    .select("id")
    .single();

  if (batchError) {
    throw new Error(`Unable to insert synthetic seed import batch: ${batchError.message}`);
  }

  const misspelling = `smok${input.stamp}`;
  const correction = `smoke${input.stamp}`;
  const { data: rowData, error: rowError } = await input.client
    .from("spelling_seed_import_rows")
    .insert({
      age_band: "synthetic",
      batch_id: batchData.id,
      blocking_errors: [],
      canonical_conflict_ids: [],
      canonical_mapping_id: null,
      canonical_match_ids: [],
      correct_spelling_normalized: correction,
      dialect_code: "en-GB",
      dry_run_bucket: "safe_for_candidate_review",
      dry_run_recommended_next_action: "nominate_for_canonical_adoption",
      dry_run_report_row_number: 1,
      duplicate_group_key: null,
      duplicate_of_seed_import_row_id: null,
      manual_review_warnings: [],
      metadata: {
        action_source: SMOKE_SOURCE,
        smoke_test: true,
        synthetic_only: true,
      },
      misspelling_normalized: misspelling,
      normalization_version: "spelling_normalize_v1",
      pattern_hint: "synthetic-smoke-pattern",
      raw_correction: correction,
      raw_misspelling: misspelling,
      reviewed_at: new Date().toISOString(),
      reviewed_by_admin_email: SMOKE_ADMIN_EMAIL,
      reviewed_by_admin_user_id: SMOKE_ADMIN_USER_ID,
      review_note: "Synthetic Slice 4F.1 smoke nominated row.",
      route_hint: "candidate_review",
      row_status: "nominated_for_canonical_adoption",
      source_confidence_normalized: 0.99,
      source_confidence_raw: "0.99",
      source_dataset: "slice-4f-hidden-canonical-smoke-dataset",
      source_note:
        "Synthetic local/staging-only smoke seed row; not learner evidence.",
      source_row_hash: crypto
        .createHash("sha256")
        .update(`slice-4f-row:${input.stamp}`)
        .digest("hex"),
      source_row_id: `slice-4f-smoke-row-${input.stamp}`,
      source_row_number: 1,
      source_url: "https://example.test/slice-4f-hidden-canonical-smoke",
      status_reason: "Synthetic Slice 4F.1 smoke nomination.",
      suggested_micro_skill_key: input.microSkillKey,
      supporting_evidence_counts: {},
      supporting_evidence_ids: {},
      validation_reasons: ["synthetic_slice_4f_smoke_candidate"],
    })
    .select("id")
    .single();

  if (rowError) {
    throw new Error(`Unable to insert synthetic seed import row: ${rowError.message}`);
  }

  return {
    batchId: batchData.id as string,
    correction,
    misspelling,
    rowId: rowData.id as string,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help());
    return;
  }

  const target = assertAllowedTarget(args);
  const client = createClient(target.supabaseUrl, target.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const skill = await fetchSmokeSkill(client);
  const microSkillBefore = await fetchMicroSkillSnapshot(client, skill.micro_skill_key);
  const protectedBefore = await protectedCounts(client);
  const resolverVisibilityEnabledBefore = await countTableWithFilter(
    client,
    "spelling_canonical_mapping_events",
    "event_type",
    "resolver_visibility_enabled",
  );
  const stamp = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const seed = await insertSyntheticSeedRow({
    client,
    microSkillKey: skill.micro_skill_key,
    stamp,
  });

  const { data: existingMapping, error: existingMappingError } = await client
    .from("spelling_canonical_mappings")
    .select("id")
    .eq("misspelling_normalized", seed.misspelling)
    .eq("correct_spelling_normalized", seed.correction)
    .eq("dialect_code", "en-GB")
    .eq("mapping_status", "active")
    .maybeSingle();
  if (existingMappingError) {
    throw new Error(`Unable to preflight canonical mappings: ${existingMappingError.message}`);
  }
  assert.strictEqual(existingMapping, null);

  const { data: mappingId, error: adoptionError } = await client.rpc(
    "adopt_seed_import_row_hidden_canonical_admin",
    {
      p_admin_email: SMOKE_ADMIN_EMAIL,
      p_admin_user_id: SMOKE_ADMIN_USER_ID,
      p_metadata: {
        action_source: SMOKE_SOURCE,
        resolver_visible: false,
        resolver_visibility_status: "hidden",
        smoke_test: true,
        synthetic_only: true,
      },
      p_note:
        "Synthetic Slice 4F.1 local/staging smoke adoption. Resolver visibility remains disabled.",
      p_seed_import_row_id: seed.rowId,
    },
  );

  if (adoptionError) {
    throw new Error(`4F adoption RPC failed: ${adoptionError.message}`);
  }

  assert.strictEqual(typeof mappingId, "string");

  const { data: adoptedRow, error: adoptedRowError } = await client
    .from("spelling_seed_import_rows")
    .select("id, row_status, canonical_mapping_id, metadata")
    .eq("id", seed.rowId)
    .single();
  if (adoptedRowError) {
    throw new Error(`Unable to read adopted seed row: ${adoptedRowError.message}`);
  }

  const row = adoptedRow as SmokeRow;
  assert.strictEqual(row.row_status, "adopted_hidden_canonical");
  assert.strictEqual(row.canonical_mapping_id, mappingId);

  const { data: mappingData, error: mappingError } = await client
    .from("spelling_canonical_mappings")
    .select(
      "id, mapping_status, resolver_visibility_status, source_seed_import_row_id, micro_skill_key, metadata",
    )
    .eq("id", mappingId)
    .single();
  if (mappingError) {
    throw new Error(`Unable to read hidden canonical mapping: ${mappingError.message}`);
  }

  const mapping = mappingData as SmokeMapping;
  assert.strictEqual(mapping.mapping_status, "active");
  assert.strictEqual(mapping.resolver_visibility_status, "hidden");
  assert.strictEqual(mapping.source_seed_import_row_id, seed.rowId);
  assert.strictEqual(mapping.micro_skill_key, skill.micro_skill_key);
  assert.strictEqual(
    mapping.metadata.action_source,
    "seed_import_4f_hidden_canonical_adoption",
  );
  assert.strictEqual(mapping.metadata.smoke_test, true);
  assert.strictEqual(mapping.metadata.synthetic_only, true);

  const { data: eventData, error: eventError } = await client
    .from("spelling_canonical_mapping_events")
    .select(
      "event_type, previous_resolver_visibility_status, new_resolver_visibility_status, source_seed_import_row_id",
    )
    .eq("mapping_id", mappingId)
    .eq("source_seed_import_row_id", seed.rowId)
    .order("created_at", { ascending: true });
  if (eventError) {
    throw new Error(`Unable to read canonical mapping events: ${eventError.message}`);
  }

  const events = (eventData ?? []) as SmokeEvent[];
  assert(events.some((event) => event.event_type === "created"));
  assert(events.some((event) => event.event_type === "seed_import_adopted"));
  assert(
    events.every(
      (event) =>
        event.new_resolver_visibility_status === "hidden" &&
        event.source_seed_import_row_id === seed.rowId,
    ),
  );

  const resolverEnabledForSeed = events.filter(
    (event) => event.event_type === "resolver_visibility_enabled",
  );
  assert.strictEqual(resolverEnabledForSeed.length, 0);

  const resolverVisibilityEnabledAfter = await countTableWithFilter(
    client,
    "spelling_canonical_mapping_events",
    "event_type",
    "resolver_visibility_enabled",
  );
  assert.strictEqual(
    resolverVisibilityEnabledAfter,
    resolverVisibilityEnabledBefore,
  );

  const protectedAfter = await protectedCounts(client);
  assert.deepStrictEqual(protectedAfter, protectedBefore);

  const microSkillAfter = await fetchMicroSkillSnapshot(client, skill.micro_skill_key);
  assert.deepStrictEqual(microSkillAfter, microSkillBefore);

  console.log(
    JSON.stringify(
      {
        status: "writing-engine-seed-import-hidden-canonical-adoption-local-smoke: ok",
        target_kind: target.targetKind,
        batch_id: seed.batchId,
        seed_import_row_id: seed.rowId,
        canonical_mapping_id: mappingId,
        resolver_visibility_status: mapping.resolver_visibility_status,
        protected_table_counts_unchanged: true,
        micro_skill_catalog_unchanged: true,
        synthetic_only: true,
      },
      null,
      2,
    ),
  );
}

async function countTableWithFilter(
  client: { from: (table: string) => any },
  table: string,
  column: string,
  value: string,
) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) {
    throw new Error(`Unable to count ${table}.${column}=${value}: ${error.message}`);
  }
  return count ?? 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
