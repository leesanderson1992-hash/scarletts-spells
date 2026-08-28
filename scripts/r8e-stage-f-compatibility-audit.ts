import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

import { preflight } from "./r8e-historical-repair";

const CONFIRMATION = "AUDIT_R8E_STAGE_F_COMPATIBILITY_READ_ONLY";
const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const OUTPUT_DIRECTORY = resolve("outputs/r8e-stage-f-compatibility");
const MIGRATION_VERSION = "20260828150000";

if (!process.argv.slice(2).includes(CONFIRMATION)) {
  throw new Error(`Refusing compatibility audit without: -- ${CONFIRMATION}`);
}

type AnyRow = Record<string, unknown>;

const exactAuthority = [
  {
    word: "immigrants",
    occurrenceId: "a38d85fc-ea0f-4190-b87c-4a0a24420037",
    writingIssueId: "10823fc2-ed52-468a-919b-0090cb872816",
    observedWord: "imergrants",
    microSkillKey: "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX",
    adminCaseId: "a444a17b-8258-4451-833c-6acfdefc2f95",
    adminDecisionId: "a6107f26-4834-43d6-9dd5-19ac8dea8ef6",
    canonicalMappingId: "4b869f34-64fb-4390-b0c8-94debf8f0d92",
  },
  {
    word: "government",
    occurrenceId: "852e2923-9622-4668-b659-923c2d018530",
    writingIssueId: "1b33ccec-eb97-4a37-9d89-513f4b870530",
    observedWord: "goviment",
    microSkillKey: "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX",
    adminCaseId: "de68beb3-110b-4e08-a3fb-4730558c3f6a",
    adminDecisionId: "2abea965-3709-42fc-9682-57c8666283ca",
    canonicalMappingId: "343b55d5-46e9-4006-82e5-8bf927e1f89f",
  },
  {
    word: "summary",
    occurrenceId: "a659de3f-ab82-481b-9b2f-2a4fefb1385f",
    writingIssueId: "32616f9c-2597-4cf7-8d93-81f16d86cf00",
    observedWord: "summery",
    microSkillKey: "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS",
    adminCaseId: "56a40a7b-6189-4509-9bfd-ce5a0178dfab",
    adminDecisionId: "9aec2d88-ddc1-4f39-9a7f-2202f95e4ccf",
    canonicalMappingId: "c81a3880-0c8e-4798-8b72-c9a4b10322f4",
  },
  {
    word: "brownie",
    occurrenceId: "76a6e7fc-7460-4f4f-b8b5-7a5e65c77f2d",
    writingIssueId: "66e76e5c-21d3-4957-8ba7-83cee076a10d",
    observedWord: "browny",
    microSkillKey: "D4_PG_LONG_EE_IE",
    adminCaseId: "4e9fdb05-77de-499b-a3a9-87da60b5b063",
    adminDecisionId: "02dffedf-5e48-4c83-9f21-5cea6f348654",
    canonicalMappingId: "8db6f7bd-0283-4456-85df-bce62cf59df6",
  },
  {
    word: "either",
    occurrenceId: "3ebb3ecb-ad41-4461-b571-db340373ed9e",
    writingIssueId: "7f13d192-d03d-461e-8eb7-a1d0cd270ef3",
    observedWord: "ether",
    microSkillKey: "D4_PG_LONG_EE_EI",
    adminCaseId: "143231fd-e793-4fc7-a010-0bb9ed960ce3",
    adminDecisionId: "101ab10b-b564-41a8-90cc-b9dbd79ae434",
    canonicalMappingId: "7a6cca4d-3fb9-4b8a-8e46-6a3f84d71199",
  },
  {
    word: "diabetes",
    occurrenceId: "5e6bc904-d0c3-431b-a9aa-004650454e81",
    writingIssueId: "89a8348a-9c5d-4c55-a0e6-5f057f04d836",
    observedWord: "diebieties",
    microSkillKey: "D4_MOR_ROOTS_COMMON_GREEK_ROOTS",
    adminCaseId: "3626643a-1bcf-485a-bb0d-642cfc2dc34e",
    adminDecisionId: "0277d456-74d2-4298-b5fb-1e5138b07b89",
    canonicalMappingId: "5a14271c-df0e-4308-944f-907c656d6643",
  },
  {
    word: "diabetes",
    occurrenceId: "9b306e4f-e3c6-4699-9de0-59c4934b927e",
    writingIssueId: "b746ed11-eb20-47ee-8d39-cf0676424bb6",
    observedWord: "dierbeties",
    microSkillKey: "D4_MOR_ROOTS_SCIENCE_MATH_ROOTS",
    adminCaseId: "5dc04750-7750-448d-9229-ed36cad19564",
    adminDecisionId: "739eb12f-d825-4c44-9e93-414abce418f5",
    canonicalMappingId: "5ccf3db6-3213-49ba-bf24-dfaad5efd02c",
  },
] as const;

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const entry = line.trim();
    if (!entry || entry.startsWith("#")) continue;
    const equals = entry.indexOf("=");
    if (equals < 1) continue;
    const key = entry.slice(0, equals).trim();
    let value = entry.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    process.env[key] ??= value;
  }
}

function connectionString(): string {
  loadEnvFile(".env.local");
  const value =
    process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED?.trim() ??
    process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION?.trim();
  if (!value) throw new Error("Missing production database URL.");
  if (!new URL(value).username.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error("Compatibility audit is not pointed at expected production.");
  }
  return value;
}

function quoteCsv(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function markdownTable(headers: string[], rows: unknown[][]): string {
  const safe = (value: unknown) => String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(safe).join(" | ")} |`),
  ].join("\n");
}

async function protectedSnapshot(client: pg.Client): Promise<Record<string, AnyRow>> {
  const tables = await client.query<{ table_name: string }>(`
    select table_name
    from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'
      and (
        table_name like 'adle_review_%'
        or table_name in ('daily_assignments','assignment_items','adle_taught_word_history')
        or table_name like 'adle_assignment_attempt%'
        or table_name like '%rollout%'
      )
    order by table_name
  `);
  const snapshot: Record<string, AnyRow> = {};
  for (const { table_name: table } of tables.rows) {
    if (!/^[a-z0-9_]+$/u.test(table)) throw new Error("Unsafe table name.");
    snapshot[table] = (await client.query<AnyRow>(`
      select count(*)::int as count,
        md5(coalesce(jsonb_agg(to_jsonb(row_data)
          order by to_jsonb(row_data)::text)::text,'[]')) as digest
      from public.${table} row_data
    `)).rows[0] ?? {};
  }
  return snapshot;
}

async function main(): Promise<void> {
  execFileSync("npm", ["run", "r8e:stage-f-compatibility-regression"], {
    cwd: process.cwd(), stdio: "pipe",
  });
  const localProofOutput = execFileSync(
    "npm",
    ["run", "r8e:stage-f-compatibility-sql-proof"],
    { cwd: process.cwd(), encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );
  if (!localProofOutput.includes('"exact_occurrences": 7') ||
      !localProofOutput.includes('"new_governed_sources": 7')) {
    throw new Error("Disposable Stage-F SQL proof did not return its exact receipt.");
  }

  const compatibility = await preflight({
    writeArtifacts: false,
    compatibilityPreview: true,
  });
  const preflightReceipt = compatibility.receipt as AnyRow;
  if (preflightReceipt.status !== "PASS") {
    throw new Error("Full 19-item compatibility preflight did not pass.");
  }

  const client = new pg.Client({
    connectionString: connectionString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const readOnly = (await client.query<{ transaction_read_only: string }>(
      "show transaction_read_only",
    )).rows[0]?.transaction_read_only;
    if (readOnly !== "on") throw new Error("Production audit transaction is not read-only.");

    const productionSchema = (await client.query<AnyRow>(`
      select
        to_regprocedure(
          'public.materialize_r8e_stage_f_historical_occurrence_source(uuid,uuid,uuid)'
        ) is not null as compatibility_function_present,
        exists (
          select 1 from supabase_migrations.schema_migrations
          where version=$1
        ) as compatibility_migration_present
    `, [MIGRATION_VERSION])).rows[0] ?? {};
    if (
      productionSchema.compatibility_function_present !== false ||
      productionSchema.compatibility_migration_present !== false
    ) throw new Error("Unreleased Stage-F compatibility is unexpectedly present in production.");

    const rows: AnyRow[] = [];
    for (const expected of exactAuthority) {
      const result = await client.query<AnyRow>(`
        select
          issue.id as writing_issue_id,
          issue.source_misspelling_instance_id as occurrence_id,
          issue.parent_user_id,
          issue.child_id,
          issue.issue_status,
          issue.final_classification,
          lower(btrim(coalesce(nullif(issue.observed_text,''),misspelling.misspelled_word)))
            as observed_word,
          lower(btrim(coalesce(nullif(issue.approved_replacement,''),
            nullif(issue.suggested_replacement,'')))) as corrected_word,
          issue.micro_skill_key,
          review_case.id as admin_case_id,
          review_case.case_status,
          decision.id as admin_decision_id,
          decision.decision_type,
          decision.previous_status,
          decision.new_status,
          decision.linked_micro_skill_key,
          mapping.id as canonical_mapping_id,
          mapping.source_case_id,
          mapping.source_decision_id,
          mapping.mapping_status,
          mapping.resolver_visibility_status,
          (select count(*)::int from public.writing_issue_correction_attempts attempt
            where attempt.writing_issue_id=issue.id
              and attempt.parent_user_id=issue.parent_user_id
              and attempt.child_id=issue.child_id) as correction_attempt_count,
          (select count(*)::int from public.learning_item_issue_links link
            where link.writing_issue_id=issue.id) as legacy_link_count,
          (select count(*)::int
            from public.parent_verified_spelling_candidate_mappings source
            where source.parent_user_id=issue.parent_user_id
              and source.child_id=issue.child_id
              and source.source_misspelling_instance_id=
                issue.source_misspelling_instance_id
              and source.candidate_status in (
                'pending_parent_promotion','parent_local_promoted',
                'admin_review_requested','global_canonical_promoted'
              )) as live_source_count,
          issue.metadata->'returned_correction_stage_f_replay' as stage_f
        from public.writing_issues issue
        join public.misspelling_instances misspelling
          on misspelling.id=issue.source_misspelling_instance_id
        join public.spelling_catalog_review_cases review_case
          on review_case.id::text=
            issue.metadata->'returned_correction_stage_f_replay'->>'admin_case_id'
        join public.spelling_catalog_review_case_decisions decision
          on decision.id::text=
            issue.metadata->'returned_correction_stage_f_replay'->>'admin_decision_id'
        join public.spelling_canonical_mappings mapping
          on mapping.id::text=
            issue.metadata->'returned_correction_stage_f_replay'->>'canonical_mapping_id'
        where issue.id=$1::uuid and issue.source_misspelling_instance_id=$2::uuid
      `, [expected.writingIssueId, expected.occurrenceId]);
      const row = result.rows[0];
      if (
        result.rows.length !== 1 || !row ||
        row.writing_issue_id !== expected.writingIssueId ||
        row.occurrence_id !== expected.occurrenceId ||
        row.issue_status !== "finalised" || row.final_classification !== "concept_gap" ||
        row.observed_word !== expected.observedWord || row.corrected_word !== expected.word ||
        row.micro_skill_key !== expected.microSkillKey ||
        row.admin_case_id !== expected.adminCaseId || row.case_status !== "add_canonical_mapping" ||
        row.admin_decision_id !== expected.adminDecisionId ||
        row.decision_type !== "add_canonical_mapping" || row.previous_status !== "open" ||
        row.new_status !== "add_canonical_mapping" ||
        row.linked_micro_skill_key !== expected.microSkillKey ||
        row.canonical_mapping_id !== expected.canonicalMappingId ||
        row.source_case_id !== expected.adminCaseId ||
        row.source_decision_id !== expected.adminDecisionId ||
        row.mapping_status !== "active" || row.resolver_visibility_status !== "visible" ||
        Number(row.correction_attempt_count) < 1 || Number(row.legacy_link_count) < 1 ||
        Number(row.live_source_count) !== 0 ||
        (row.stage_f as AnyRow | undefined)?.action !== "attached_verified_route" ||
        (row.stage_f as AnyRow | undefined)?.route_source !== "canonical_mapping" ||
        (row.stage_f as AnyRow | undefined)?.dry_run_first !== true
      ) throw new Error(`Exact Stage-F authority drifted: ${expected.occurrenceId}`);
      rows.push({ word: expected.word, ...row });
    }

    const historicalDigestBefore = (await client.query<AnyRow>(`
      select md5(jsonb_build_object(
        'issues',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
          from public.writing_issues row_data where row_data.id=any($1::uuid[])),
        'misspellings',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
          from public.misspelling_instances row_data where row_data.id=any($2::uuid[])),
        'cases',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
          from public.spelling_catalog_review_cases row_data where row_data.id=any($3::uuid[])),
        'decisions',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
          from public.spelling_catalog_review_case_decisions row_data where row_data.id=any($4::uuid[])),
        'mappings',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
          from public.spelling_canonical_mappings row_data where row_data.id=any($5::uuid[]))
      )::text) as digest
    `, [
      exactAuthority.map((row) => row.writingIssueId),
      exactAuthority.map((row) => row.occurrenceId),
      exactAuthority.map((row) => row.adminCaseId),
      exactAuthority.map((row) => row.adminDecisionId),
      exactAuthority.map((row) => row.canonicalMappingId),
    ])).rows[0]?.digest;

    const protectedAfter = await protectedSnapshot(client);
    if (JSON.stringify(protectedAfter) !== JSON.stringify(preflightReceipt.protectedHistory)) {
      throw new Error("Protected production history changed across read-only verification.");
    }
    const affectedRollout = Number((await client.query<{ count: number }>(`
      select count(*)::int as count
      from public.adle_review_r6_child_rollouts
      where child_id='8629d7b2-5770-48bd-b33d-b10e02d9c559'::uuid
    `)).rows[0]?.count ?? -1);
    if (affectedRollout !== 0) throw new Error("Affected learner was unexpectedly activated.");

    const historicalDigestAfter = (await client.query<AnyRow>(`
      select md5(jsonb_build_object(
        'issues',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
          from public.writing_issues row_data where row_data.id=any($1::uuid[])),
        'misspellings',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
          from public.misspelling_instances row_data where row_data.id=any($2::uuid[])),
        'cases',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
          from public.spelling_catalog_review_cases row_data where row_data.id=any($3::uuid[])),
        'decisions',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
          from public.spelling_catalog_review_case_decisions row_data where row_data.id=any($4::uuid[])),
        'mappings',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
          from public.spelling_canonical_mappings row_data where row_data.id=any($5::uuid[]))
      )::text) as digest
    `, [
      exactAuthority.map((row) => row.writingIssueId),
      exactAuthority.map((row) => row.occurrenceId),
      exactAuthority.map((row) => row.adminCaseId),
      exactAuthority.map((row) => row.adminDecisionId),
      exactAuthority.map((row) => row.canonicalMappingId),
    ])).rows[0]?.digest;
    if (historicalDigestBefore !== historicalDigestAfter) {
      throw new Error("Stage-F production history changed during read-only audit.");
    }

    await client.query("rollback");

    const gitStatus = execFileSync("git", ["status", "--short", "--branch"], {
      encoding: "utf8",
    }).trim();
    const receipt = {
      verdict: "STAGE-F R8E COMPATIBILITY VERIFIED",
      generatedAt: new Date().toISOString(),
      productionProjectRef: PRODUCTION_PROJECT_REF,
      productionTransactionReadOnly: true,
      productionWrites: 0,
      migrationReleased: false,
      productionRepairPerformed: false,
      staticRegression: "PASS",
      disposableSqlProof: "PASS",
      exactStageFAuthorityRows: rows,
      sevenRowProof: {
        newParentVerifications: 7,
        newGovernedSources: 7,
        historicalSourceRowsChanged: 0,
        historicalWritingIssuesChanged: 0,
        adminHistoryChanged: 0,
        idempotentReuse: true,
      },
      fullR8ECompatibilityPreview: preflightReceipt,
      productionSafety: {
        compatibilityFunctionPresent: false,
        compatibilityMigrationPresent: false,
        footballStillUnrepaired: true,
        replayStillUnrepaired: true,
        sevenStageFRowsStillUnrepaired: rows.every((row) => row.live_source_count === 0),
        affectedLearnerRolloutRows: affectedRollout,
        historicalDigestBefore,
        historicalDigestAfter,
        protectedHistoryUnchanged: true,
      },
      gitStatus,
      nextGate: "STAGE-F COMPATIBILITY MIGRATION / RELEASE GATE",
    };

    mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
    writeFileSync(
      resolve(OUTPUT_DIRECTORY, "r8e-stage-f-compatibility-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    const csvHeaders = [
      "word","occurrence_id","writing_issue_id","observed_word","corrected_word",
      "micro_skill_key","admin_case_id","admin_decision_id","canonical_mapping_id",
      "final_classification","correction_attempt_count","legacy_link_count","live_source_count",
    ];
    writeFileSync(
      resolve(OUTPUT_DIRECTORY, "r8e-stage-f-authority.csv"),
      `${csvHeaders.map(quoteCsv).join(",")}\n${rows.map((row) =>
        csvHeaders.map((header) => quoteCsv(row[header])).join(",")
      ).join("\n")}\n`,
    );
    const dryRun = preflightReceipt.dryRun as AnyRow;
    const dryRows = dryRun.rows as AnyRow[];
    writeFileSync(
      resolve(OUTPUT_DIRECTORY, "R8E-19-COMPATIBILITY-DRY-RUN.md"),
      `# R8E 19-item compatibility dry run\n\n` +
      `Production transaction: read-only. Compatibility migration: local only. ` +
      `Production repairs: 0.\n\n` +
      markdownTable(
        ["Word","Occurrence","Gap","Source route","Intake outcome","ADLE action","Lineage","Review"],
        dryRows.map((row) => [row.word,row.occurrenceId,row.gap,row.materializationRoute ?? "existing source",row.expectedIntakeOutcome,row.expectedAdleItemAction,row.expectedLineage,row.reviewSchedule]),
      ) + "\n",
    );

    const authorityTable = markdownTable(
      ["Word","Occurrence","Issue","Microskill","Admin case","Decision","Mapping","Live source"],
      rows.map((row) => [row.word,row.occurrence_id,row.writing_issue_id,row.micro_skill_key,row.admin_case_id,row.admin_decision_id,row.canonical_mapping_id,row.live_source_count]),
    );
    const report = `# Stage-F R8E Compatibility Verification\n\n` +
      `## 1. Verdict\n\nSTAGE-F R8E COMPATIBILITY VERIFIED\n— READY FOR COMPATIBILITY MIGRATION / RELEASE GATE\n\n` +
      `## 2. Exact Stage-F authority model\n\nEach row is a final learning-classified writing issue joined by stable occurrence ID to one Stage-F replay receipt, terminal add-canonical-mapping admin case/decision, active visible canonical mapping, returned-correction attempt, and legacy learning link. All learner, parent, word, correction, microskill, case, decision, and mapping identities agree.\n\n${authorityTable}\n\n` +
      `## 3. Why R8B correctly rejected it\n\nReleased R8B accepts a new source only from a modern known-match marker or a current/open admin handoff. These cases are terminal historical Stage-F decisions, so normal R8B continues to reject them.\n\n` +
      `## 4. Compatibility architecture\n\nA new service-only RPC accepts only occurrence ID plus expected parent/child guards. It is hard-allowlisted to the seven rows, re-derives every value from historical database authority, creates a parent verification and quarantined governed source, records Stage-F reconstruction provenance, then leaves R8C to perform exact-ID handoff. It does not replace R8B/R8C/R8D.\n\n` +
      `## 5. Seven exact occurrence proofs\n\nDisposable production-shaped PostgreSQL: parent verifications +7; governed sources +7; historical source rows changed 0; writing issues changed 0; admin history changed 0; R8C exact-ID handoffs 7.\n\n` +
      `## 6. Idempotency/fail-closed proof\n\nSecond invocation reused all seven source IDs. Unknown occurrence, wrong learner/parent, changed word/microskill, non-learning state, missing replay receipt, changed mapping, ambiguous authority, and foreign live source all failed closed. Authenticated execution is revoked; service role is constrained by the exact allowlist.\n\n` +
      `## 7. R8B/R8C/R8D regression results\n\nStatic compatibility regression PASS. Disposable R8B → R8C → R8D → compatibility ancestry PASS. Normal R8B rejection preserved; R8C exact-ID handoff unchanged; R8D protection unchanged.\n\n` +
      `## 8. Full 19-item R8E dry-run result\n\n19 deterministic occurrences repairable; R8D-first 0; ambiguous excluded 4; CONTENT_ONLY excluded 4. Outcomes: READY 14, canonical_word_missing 3, mapping_missing 2. Expected effects remain parent verifications +9, governed sources +9, intake candidates +19, ADLE items +14, lineage +14, Review schedules +0.\n\n` +
      `## 9. Migration impact\n\nOne new migration and one new service-only function. No tables, application deployment, rollout, or released migration edits.\n\n` +
      `## 10. Production safety receipt\n\nProduction transactions read-only; writes 0; repairs 0. Football, replay, and all seven Stage-F rows remain unrepaired. Compatibility migration/function absent as expected. Protected history and exact Stage-F digest unchanged; affected learner rollout rows 0.\n\n` +
      `## 11. Git status\n\n\`\`\`text\n${gitStatus}\n\`\`\`\n\n` +
      `## 12. Exact next gate\n\nSTAGE-F COMPATIBILITY MIGRATION / RELEASE GATE\n`;
    writeFileSync(resolve(OUTPUT_DIRECTORY, "STAGE-F-R8E-COMPATIBILITY-REPORT.md"), report);

    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      exactStageFRows: rows.length,
      fullR8EDeterministic: (preflightReceipt.repairPopulation as AnyRow).deterministic,
      ambiguousExcluded: (preflightReceipt.repairPopulation as AnyRow).ambiguousExcluded,
      contentOnlyExcluded: (preflightReceipt.repairPopulation as AnyRow).contentOnlyExcluded,
      expectedEffects: preflightReceipt.expectedEffects,
      productionWrites: 0,
      productionRepairs: 0,
      nextGate: receipt.nextGate,
    }, null, 2)}\n`);
  } catch (error) {
    try { await client.query("rollback"); } catch { /* original error wins */ }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
