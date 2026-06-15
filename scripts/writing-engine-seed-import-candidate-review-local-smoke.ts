import assert from "assert";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { createClient } from "@supabase/supabase-js";

import { runCandidateReviewImport } from "./writing-engine-seed-import-candidate-review";
import { buildSeedImportDryRunReport } from "./writing-engine-seed-import-dry-run";

const CONFIRM = "LOCAL_SLICE_4D_SEED_IMPORT_SMOKE";

const PROTECTED_TABLES = [
  "micro_skill_catalog",
  "spelling_canonical_mappings",
  "spelling_canonical_mapping_events",
  "spelling_canonical_mapping_recommendations",
  "spelling_catalog_review_cases",
  "spelling_catalog_review_case_decisions",
  "parent_verified_spelling_candidate_mappings",
  "learning_items",
  "assignment_items",
  "learning_item_evidence",
  "writing_issues",
  "parent_verifications",
] as const;

type Args = {
  dbUrl?: string;
  dbContainer?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  outDir?: string;
  confirm?: string;
  help?: boolean;
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
      case "--db-url":
        args.dbUrl = next();
        break;
      case "--supabase-url":
        args.supabaseUrl = next();
        break;
      case "--db-container":
        args.dbContainer = next();
        break;
      case "--supabase-service-role-key":
        args.supabaseServiceRoleKey = next();
        break;
      case "--out-dir":
        args.outDir = next();
        break;
      case "--confirm":
        args.confirm = next();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  args.dbUrl = args.dbUrl ?? process.env.LOCAL_SUPABASE_DB_URL;
  args.supabaseUrl = args.supabaseUrl ?? process.env.SUPABASE_URL;
  args.supabaseServiceRoleKey =
    args.supabaseServiceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  args.confirm = args.confirm ?? "";
  return args;
}

function help() {
  return [
    "Slice 4D local-only seed candidate-review smoke",
    "",
    "Usage:",
    "  npm run writing-engine:seed-import-candidate-review-local-smoke -- --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres --supabase-url http://127.0.0.1:54321 --supabase-service-role-key <local-service-role-key> --confirm LOCAL_SLICE_4D_SEED_IMPORT_SMOKE",
    "",
    "This smoke refuses non-local targets and writes only synthetic rows into the dedicated seed import tables.",
  ].join("\n");
}

function assertNonEmpty(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function isLocalUrl(value: string) {
  const parsed = new URL(value);
  return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
}

function psqlJson(dbUrl: string, sql: string, dbContainer?: string) {
  let output: string;
  try {
    output = execFileSync("psql", [dbUrl, "-X", "-A", "-t", "-c", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const container =
      dbContainer ?? process.env.LOCAL_SUPABASE_DB_CONTAINER ?? "supabase_db_scarletts-spells";
    output = execFileSync(
      "docker",
      ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-c", sql],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  }
  return JSON.parse(output);
}

function generateSlice4CSchemaProof(dbUrl: string, dbContainer?: string) {
  return psqlJson(
    dbUrl,
    `
with seed_tables(table_name) as (
  values
    ('spelling_seed_import_batches'),
    ('spelling_seed_import_rows')
),
table_proof as (
  select
    st.table_name,
    c.relrowsecurity as rls_enabled,
    coalesce((
      select jsonb_agg(privilege_type order by privilege_type)
      from information_schema.role_table_grants g
      where g.table_schema = 'public'
        and g.table_name = st.table_name
        and g.grantee = 'anon'
    ), '[]'::jsonb) as anon_grants,
    coalesce((
      select jsonb_agg(privilege_type order by privilege_type)
      from information_schema.role_table_grants g
      where g.table_schema = 'public'
        and g.table_name = st.table_name
        and g.grantee = 'authenticated'
    ), '[]'::jsonb) as authenticated_grants,
    coalesce((
      select jsonb_agg(privilege_type order by privilege_type)
      from information_schema.role_table_grants g
      where g.table_schema = 'public'
        and g.table_name = st.table_name
        and g.grantee = 'service_role'
    ), '[]'::jsonb) as service_role_grants,
    (
      select count(*)::integer
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = st.table_name
    ) as policy_count
  from seed_tables st
  join pg_class c on c.oid = ('public.' || st.table_name)::regclass
)
select jsonb_build_object(
  'schema_version', 'slice_4c_seed_import_storage_v1',
  'generated_at', to_jsonb(timezone('utc', now())),
  'database_target', jsonb_build_object('kind', 'local', 'url_host', '127.0.0.1'),
  'tables', coalesce((select jsonb_agg(to_jsonb(table_proof) order by table_name) from table_proof), '[]'::jsonb),
  'required_indexes', coalesce((
    select jsonb_agg(indexname order by indexname)
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'spelling_seed_import_batches_active_source_hash_idx',
        'spelling_seed_import_rows_batch_normalized_triple_idx'
      )
  ), '[]'::jsonb),
  'required_constraints', coalesce((
    select jsonb_agg(conname order by conname)
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname in (
        'spelling_seed_import_rows_normalized_pair_check',
        'spelling_seed_import_rows_confidence_check',
        'spelling_seed_import_rows_dry_run_bucket_check',
        'spelling_seed_import_rows_status_check'
      )
  ), '[]'::jsonb)
)::text;
`,
    dbContainer,
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
    throw new Error(`Unable to read local micro_skill_catalog: ${error.message}`);
  }
  if (!data) {
    throw new Error("Local smoke requires at least one active assignable D4 micro-skill.");
  }
  return data as {
    micro_skill_key: string;
    mastery_domain_key: string;
    is_active: boolean;
    is_assignable: boolean;
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help());
    return;
  }

  if (args.confirm !== CONFIRM) {
    throw new Error(`Refusing local smoke without --confirm ${CONFIRM}.`);
  }

  const dbUrl = assertNonEmpty(args.dbUrl, "Local Supabase DB URL");
  const supabaseUrl = assertNonEmpty(args.supabaseUrl, "Local Supabase URL");
  const serviceRoleKey = assertNonEmpty(
    args.supabaseServiceRoleKey,
    "Local Supabase service-role key",
  );

  if (!isLocalUrl(dbUrl) || !isLocalUrl(supabaseUrl)) {
    throw new Error("Slice 4D smoke refuses non-local DB or Supabase URLs.");
  }

  const outDir = path.resolve(
    args.outDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "slice-4d-local-smoke-")),
  );
  fs.mkdirSync(outDir, { recursive: true });

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const before = await protectedCounts(client);
  const skill = await fetchSmokeSkill(client);
  const proof = generateSlice4CSchemaProof(dbUrl, args.dbContainer);
  const proofPath = path.join(outDir, "slice-4c-schema-proof.json");
  fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);

  const stamp = Date.now();
  const csvPath = path.join(outDir, "slice-4d-local-smoke.csv");
  const reportPath = path.join(outDir, "slice-4d-local-smoke-report.json");
  const csv = [
    "misspelling,correction,suggested_micro_skill_key,confidence,source,note,dialect,source_dataset,source_row_id,import_batch_name",
    `smok${stamp},smoke${stamp},${skill.micro_skill_key},0.9,local_slice_4d_smoke,synthetic local smoke candidate,en-GB,local-smoke,row-safe,slice-4d-local-smoke`,
    `sam${stamp},same${stamp},${skill.micro_skill_key},0.9,local_slice_4d_smoke,synthetic canonical overlap,en-GB,local-smoke,row-manual,slice-4d-local-smoke`,
    `same${stamp},same${stamp},${skill.micro_skill_key},0.9,local_slice_4d_smoke,synthetic rejected row,en-GB,local-smoke,row-rejected,slice-4d-local-smoke`,
  ].join("\n");
  fs.writeFileSync(csvPath, `${csv}\n`);

  const report = buildSeedImportDryRunReport({
    csvText: csv,
    inputFile: csvPath,
    now: new Date(),
    comparisonData: {
      microSkills: [skill],
      canonicalMappings: [
        {
          id: "local-smoke-canonical-overlap",
          misspelling_normalized: `sam${stamp}`,
          correct_spelling_normalized: `same${stamp}`,
          micro_skill_key: skill.micro_skill_key,
          mapping_status: "active",
          dialect_code: "en-GB",
          normalization_version: "spelling_normalize_v1",
        },
      ],
    },
  });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const result = await runCandidateReviewImport(
    {
      sourceCsvPath: csvPath,
      dryRunReportPath: reportPath,
      slice4cSchemaProofPath: proofPath,
      sourceLicenseNote: "Synthetic local-only Slice 4D smoke data.",
      createdByAdminEmail: "slice-4d-local-smoke@example.test",
      confirmationToken: "IMPORT_SEED_CANDIDATE_REVIEW_ROWS",
    },
    {
      assertSeedStorageReady: async () => {
        await countTable(client, "spelling_seed_import_batches");
        await countTable(client, "spelling_seed_import_rows");
      },
      findActiveBatchBySourceHash: async (sourceFileSha256) => {
        const { data, error } = await client
          .from("spelling_seed_import_batches")
          .select("id")
          .eq("source_file_sha256", sourceFileSha256)
          .not("batch_status", "in", "(superseded,cancelled,quarantined)")
          .limit(1)
          .maybeSingle();
        if (error) {
          throw new Error(error.message);
        }
        return data as { id: string } | null;
      },
      fetchMicroSkills: async (keys) => {
        const { data, error } = await client
          .from("micro_skill_catalog")
          .select("micro_skill_key, mastery_domain_key, is_active, is_assignable")
          .in("micro_skill_key", keys);
        if (error) {
          throw new Error(error.message);
        }
        return data ?? [];
      },
      fetchProtectedCounts: async () => protectedCounts(client),
      insertBatch: async (batch) => {
        const { data, error } = await client
          .from("spelling_seed_import_batches")
          .insert(batch)
          .select("id")
          .single();
        if (error) {
          throw new Error(error.message);
        }
        return data as { id: string };
      },
      insertRows: async (rows) => {
        const { error } = await client.from("spelling_seed_import_rows").insert(rows);
        if (error) {
          throw new Error(error.message);
        }
      },
      updateBatchStatus: async (batchId, update) => {
        const { error } = await client
          .from("spelling_seed_import_batches")
          .update(update)
          .eq("id", batchId);
        if (error) {
          throw new Error(error.message);
        }
      },
    },
  );

  assert.strictEqual(result.insertedRowCount, 1);

  const { count: rowCount, error: rowCountError } = await client
    .from("spelling_seed_import_rows")
    .select("*", { count: "exact", head: true })
    .eq("batch_id", result.batchId);
  if (rowCountError) {
    throw new Error(rowCountError.message);
  }
  assert.strictEqual(rowCount, 1);

  await assert.rejects(
    () =>
      runCandidateReviewImport(
        {
          sourceCsvPath: csvPath,
          dryRunReportPath: reportPath,
          slice4cSchemaProofPath: proofPath,
          sourceLicenseNote: "Synthetic local-only Slice 4D smoke data.",
          confirmationToken: "IMPORT_SEED_CANDIDATE_REVIEW_ROWS",
        },
        {
          assertSeedStorageReady: async () => undefined,
          findActiveBatchBySourceHash: async () => ({ id: result.batchId }),
          fetchMicroSkills: async () => [skill],
          fetchProtectedCounts: async () => before,
          insertBatch: async () => ({ id: "should-not-insert" }),
          insertRows: async () => undefined,
        },
      ),
    /Active seed import batch already exists/,
  );

  const after = await protectedCounts(client);
  assert.deepStrictEqual(after, before);

  console.log(
    JSON.stringify(
      {
        status: "writing-engine-seed-import-candidate-review-local-smoke: ok",
        batch_id: result.batchId,
        inserted_row_count: result.insertedRowCount,
        out_dir: outDir,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
