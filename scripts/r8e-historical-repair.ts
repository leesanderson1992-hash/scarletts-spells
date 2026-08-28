import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const EXECUTE_CONFIRMATION =
  "EXECUTE_R8E_PRODUCTION_HISTORICAL_REPAIR_EXACT_19";
const MANIFEST_DIRECTORY = resolve("outputs/r8e-historical-audit");
const OUTPUT_DIRECTORY = resolve("outputs/r8e-historical-repair");
const MANIFEST_FILE = resolve(
  MANIFEST_DIRECTORY,
  "r8e-repair-candidates.csv",
);
const EXPECTED_ARTIFACT_HASHES: Record<string, string> = {
  "R8E-HISTORICAL-AUDIT.md":
    "f1a1f5fb8f8091f3091509620a2832b0f02125cc189e86212205a9e10af234fd",
  "r8e-learning-occurrences.csv":
    "c62685de1334df8853165f75c1c129cc3d312b3e25c72071b131cc484abe3a94",
  "r8e-anomalies.csv":
    "101ff1d87d785a5fcbb955b73d244990615eb562ac758bc3c8dd076d4af70fa4",
  "r8e-repair-candidates.csv":
    "ec1eb76bfe24295aa08371b5703083a0e294ae316779cc494497d1a8c783e297",
  "r8e-audit-receipt.json":
    "088a8e359180c0652fb7d62759fee2c53f2597444300b0d4985b3b9796c73620",
};
const EXPECTED_EFFECTS = {
  parent_verifications: 9,
  governed_sources: 9,
  intake_candidates: 19,
  adle_learning_items: 14,
  lineage: 14,
  review_schedules: 0,
} as const;
const LEARNING_CLASSIFICATIONS = new Set([
  "fragile_knowledge",
  "concept_gap",
  "transfer_failure",
]);
const LIVE_SOURCE_STATUSES = new Set([
  "pending_parent_promotion",
  "parent_local_promoted",
  "admin_review_requested",
  "global_canonical_promoted",
]);
const STAGE_F_COMPATIBILITY_OCCURRENCES = new Set([
  "a38d85fc-ea0f-4190-b87c-4a0a24420037",
  "852e2923-9622-4668-b659-923c2d018530",
  "a659de3f-ab82-481b-9b2f-2a4fefb1385f",
  "76a6e7fc-7460-4f4f-b8b5-7a5e65c77f2d",
  "3ebb3ecb-ad41-4461-b571-db340373ed9e",
  "5e6bc904-d0c3-431b-a9aa-004650454e81",
  "9b306e4f-e3c6-4699-9de0-59c4934b927e",
]);

// The repair receipt composes heterogeneous, schema-checked database rows.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

interface ManifestRow extends AnyRow {
  learner_alias: string;
  child_id: string;
  cohort: string;
  occurrence_id: string;
  writing_issue_id: string;
  observed_word: string;
  canonical_word: string;
  micro_skill_key: string;
  original_issue_micro_skill_key: string;
  learning_intent: string;
  governed_source_id: string;
  source_classification: string;
  intake_candidate_id: string;
  intake_state: string;
  blocker: string;
  future_repair_eligibility: string;
  canonical_content_ready: string;
  canonical_mapping_ready: string;
  dry_run_effect: string;
}

interface CandidateState {
  manifest: ManifestRow;
  issue: AnyRow | null;
  source: AnyRow | null;
  sourceCount: number;
  intakeCount: number;
  activeTargetCount: number;
  lineageCount: number;
  materializationRoute: string | null;
}

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
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertAcceptedArtifacts(): void {
  for (const [file, expected] of Object.entries(EXPECTED_ARTIFACT_HASHES)) {
    const path = resolve(MANIFEST_DIRECTORY, file);
    if (!existsSync(path) || sha256(path) !== expected) {
      throw new Error(`STOP — accepted R8E artifact drifted: ${file}`);
    }
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }
  if (quoted) throw new Error("Accepted R8E CSV has an unterminated quoted field.");
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function loadManifest(): {
  all: ManifestRow[];
  deterministic: ManifestRow[];
  ambiguous: ManifestRow[];
  contentOnly: ManifestRow[];
} {
  assertAcceptedArtifacts();
  const parsed = parseCsv(readFileSync(MANIFEST_FILE, "utf8"));
  const headers = parsed[0];
  if (!headers) throw new Error("Accepted R8E repair manifest is empty.");
  const all = parsed.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
  ) as ManifestRow[];
  const deterministic = all.filter(
    (row) => row.future_repair_eligibility === "SAFE_DETERMINISTIC_REPAIR",
  );
  const ambiguous = all.filter(
    (row) => row.future_repair_eligibility === "AMBIGUOUS_MANUAL_REVIEW",
  );
  const contentOnly = all.filter(
    (row) => row.future_repair_eligibility === "CONTENT_ONLY",
  );
  if (
    deterministic.length !== 19 ||
    ambiguous.length !== 4 ||
    contentOnly.length !== 4 ||
    new Set(deterministic.map((row) => row.occurrence_id)).size !== 19
  ) {
    throw new Error("STOP — accepted R8E manifest population is not 19/4/4.");
  }
  const sourceGaps = deterministic.filter(
    (row) => row.source_classification === "MISSING_GOVERNED_SOURCE",
  );
  const intakeGaps = deterministic.filter(
    (row) => row.intake_classification === "MISSING_INTAKE_CANDIDATE",
  );
  if (sourceGaps.length !== 9 || intakeGaps.length !== 10) {
    throw new Error("STOP — accepted R8E operation split is not 9/10.");
  }
  const totals = deterministic.reduce(
    (sum, row) => {
      const effect = JSON.parse(row.dry_run_effect) as Record<string, number>;
      for (const key of Object.keys(sum)) {
        (sum as Record<string, number>)[key] += effect[key] ?? 0;
      }
      return sum;
    },
    {
      parent_verifications: 0,
      governed_sources: 0,
      intake_candidates: 0,
      adle_learning_items: 0,
      lineage: 0,
      review_schedules: 0,
    },
  );
  if (JSON.stringify(totals) !== JSON.stringify(EXPECTED_EFFECTS)) {
    throw new Error("STOP — accepted R8E aggregate effects drifted.");
  }
  return { all, deterministic, ambiguous, contentOnly };
}

function productionConnectionString(): string {
  loadEnvFile(".env.local");
  const value =
    process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED?.trim() ??
    process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION?.trim();
  if (!value) throw new Error("Missing supported production database URL.");
  const parsed = new URL(value);
  if (!parsed.username.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error("STOP — repair runner is not pointed at expected production.");
  }
  return value;
}

function productionSupabaseClient(): SupabaseClient {
  loadEnvFile(".env.local");
  const url = (
    process.env.R8E_PRODUCTION_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  ).trim();
  const key = (
    process.env.R8E_PRODUCTION_SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    ""
  ).trim();
  if (!url.includes(PRODUCTION_PROJECT_REF) || !key) {
    throw new Error("STOP — missing expected production Supabase service client.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function bool(value: string): boolean {
  return value === "true";
}

async function assertR8DHealthy(client: pg.Client): Promise<AnyRow> {
  const migrations = await client.query<{ version: string }>(
    `select version
       from supabase_migrations.schema_migrations
      where version = any($1::text[])
      order by version`,
    [["20260828120000", "20260828130000", "20260828140000"]],
  );
  const versions = migrations.rows.map((row) => row.version);
  if (versions.join(",") !== "20260828120000,20260828130000,20260828140000") {
    throw new Error(`STOP — R8D production migration is unhealthy: ${versions.join(",")}`);
  }
  const schema = await client.query<AnyRow>(`
    select
      to_regclass('public.adle_spelling_decision_reconciliations') is not null
        as reconciliation_table_present,
      exists(select 1 from information_schema.columns
        where table_schema='public'
          and table_name='parent_verified_spelling_candidate_mappings'
          and column_name='authority_version') as authority_version_present,
      to_regprocedure('public.adle_reconcile_parent_spelling_decision_r8d(uuid,uuid,uuid,uuid,bigint,text,text,text,uuid,uuid,text,text)') is not null
        as reconciliation_rpc_present,
      to_regprocedure('public.adle_spelling_source_requires_reconciliation_r8d(uuid)') is not null
        as source_guard_present,
      exists(select 1 from pg_trigger
        where tgrelid='public.writing_issues'::regclass
          and tgname='writing_issues_protect_r8d_handed_off_authority'
          and not tgisinternal) as issue_guard_present
  `);
  const row = schema.rows[0];
  if (!row || Object.values(row).some((value) => value !== true)) {
    throw new Error(`STOP — R8D schema/function health failed: ${JSON.stringify(row)}`);
  }
  const population = await client.query<AnyRow>(`
    with consumed as (
      select source.id, source.source_misspelling_instance_id
      from public.parent_verified_spelling_candidate_mappings source
      where source.candidate_status in ('parent_local_promoted','global_canonical_promoted')
        and (
          source.canonical_intake_handoff_state is not null
          or exists(select 1 from public.adle_canonical_intake_candidates intake
            where intake.source_candidate_mapping_id=source.id)
          or exists(select 1 from public.adle_learning_item_sources lineage
            where lineage.parent_verified_candidate_mapping_id=source.id)
        )
    )
    select
      count(*)::int as consumed_sources,
      count(*) filter (where not public.adle_spelling_source_requires_reconciliation_r8d(id))::int
        as unguarded_sources
    from consumed
  `);
  if (population.rows[0]?.unguarded_sources !== 0) {
    throw new Error("STOP — R8D leaves consumed sources unguarded.");
  }
  return { versions, ...row, ...population.rows[0] };
}

async function candidateState(
  client: pg.Client,
  manifest: ManifestRow,
  options: { assumeStageFCompatibilityReleased?: boolean } = {},
): Promise<CandidateState> {
  const issueResult = manifest.writing_issue_id
    ? await client.query<AnyRow>(
        `select issue.*,
                misspelling.misspelled_word,
                (select count(*)::int from public.writing_issue_correction_attempts attempt
                  where attempt.writing_issue_id=issue.id
                    and attempt.parent_user_id=issue.parent_user_id
                    and attempt.child_id=issue.child_id) as correction_attempt_count
           from public.writing_issues issue
           join public.misspelling_instances misspelling
             on misspelling.id=issue.source_misspelling_instance_id
          where issue.id=$1::uuid`,
        [manifest.writing_issue_id],
      )
    : { rows: [] as AnyRow[] };
  const issue = issueResult.rows[0] ?? null;
  if (manifest.writing_issue_id && !issue) {
    throw new Error(`STOP — writing issue disappeared: ${manifest.occurrence_id}`);
  }
  if (issue) {
    const currentCorrect = normalized(
      issue.approved_replacement ?? issue.suggested_replacement,
    );
    if (
      issue.child_id !== manifest.child_id ||
      issue.source_misspelling_instance_id !== manifest.occurrence_id ||
      issue.issue_status !== "finalised" ||
      issue.final_classification !== manifest.learning_intent ||
      !LEARNING_CLASSIFICATIONS.has(issue.final_classification) ||
      normalized(issue.observed_text ?? issue.misspelled_word) !== manifest.observed_word ||
      currentCorrect !== manifest.canonical_word ||
      (issue.micro_skill_key ?? "") !== manifest.original_issue_micro_skill_key ||
      Number(issue.correction_attempt_count) < 1
    ) {
      throw new Error(`STOP — REPAIR SET DRIFTED at ${manifest.occurrence_id}`);
    }
  }
  const sources = await client.query<AnyRow>(
    `select source.*
       from public.parent_verified_spelling_candidate_mappings source
      where source.child_id=$1::uuid
        and source.source_misspelling_instance_id=$2::uuid
        and source.candidate_status in (
          'pending_parent_promotion','parent_local_promoted',
          'admin_review_requested','global_canonical_promoted'
        )
      order by source.id`,
    [manifest.child_id, manifest.occurrence_id],
  );
  const source = sources.rows[0] ?? null;
  if (manifest.source_classification === "MISSING_GOVERNED_SOURCE") {
    if (sources.rows.length !== 0) {
      throw new Error(`STOP — REPAIR SET DRIFTED: source appeared for ${manifest.occurrence_id}`);
    }
  } else if (
    sources.rows.length !== 1 ||
    source?.id !== manifest.governed_source_id ||
    normalized(source.misspelling_normalized) !== manifest.observed_word ||
    normalized(source.correct_spelling_normalized) !== manifest.canonical_word ||
    source.micro_skill_key !== manifest.micro_skill_key ||
    !LIVE_SOURCE_STATUSES.has(source.candidate_status)
  ) {
    throw new Error(`STOP — REPAIR SET DRIFTED: governed source at ${manifest.occurrence_id}`);
  }
  const sourceId = source?.id ?? null;
  const intakeCount = sourceId
    ? Number((await client.query<{ count: number }>(
        `select count(*)::int as count
           from public.adle_canonical_intake_candidates
          where source_candidate_mapping_id=$1::uuid`,
        [sourceId],
      )).rows[0]?.count ?? 0)
    : 0;
  const lineageCount = sourceId
    ? Number((await client.query<{ count: number }>(
        `select count(*)::int as count
           from public.adle_learning_item_sources
          where parent_verified_candidate_mapping_id=$1::uuid
            and row_status='active'`,
        [sourceId],
      )).rows[0]?.count ?? 0)
    : 0;
  const activeTargetCount = Number((await client.query<{ count: number }>(
    `select count(*)::int as count
       from public.adle_learning_items item
       join public.canonical_teaching_dictionary_words word
         on word.id=item.canonical_word_id
      where item.child_id=$1::uuid
        and word.normalised_word=$2
        and item.micro_skill_key=$3
        and item.row_status='active'`,
    [manifest.child_id, manifest.canonical_word, manifest.micro_skill_key],
  )).rows[0]?.count ?? 0);
  if (intakeCount !== 0 || lineageCount !== 0 || activeTargetCount !== 0) {
    throw new Error(`STOP — REPAIR SET DRIFTED: downstream state at ${manifest.occurrence_id}`);
  }
  let materializationRoute: string | null = null;
  if (manifest.source_classification === "MISSING_GOVERNED_SOURCE") {
    const route = await client.query<AnyRow>(
      `select
        exists(
          select 1
          from public.spelling_canonical_mappings mapping
          where mapping.id = case
              when (issue.metadata->'known_match_auto_resolution'->>'canonical_mapping_id')
                ~* '^[0-9a-f-]{36}$'
              then (issue.metadata->'known_match_auto_resolution'->>'canonical_mapping_id')::uuid
              else null
            end
            and issue.metadata->'known_match_auto_resolution'->>'authority'='known_match'
            and mapping.misspelling_normalized=$2
            and mapping.correct_spelling_normalized=$3
            and mapping.micro_skill_key=$4
            and mapping.mapping_status='active'
            and mapping.resolver_visibility_status='visible'
            and exists(select 1 from public.spelling_canonical_mapping_events event
              where event.mapping_id=mapping.id
                and event.event_type='resolver_visibility_enabled'
                and event.new_resolver_visibility_status='visible')
        ) as known_route,
        exists(
          select 1 from public.spelling_catalog_review_cases review_case
          where review_case.parent_user_id=issue.parent_user_id
            and review_case.child_id=issue.child_id
            and review_case.source_misspelling_instance_id=issue.source_misspelling_instance_id
            and review_case.case_status='open'
        ) or exists(
          select 1 from public.spelling_canonical_mapping_recommendations recommendation
          where recommendation.parent_user_id=issue.parent_user_id
            and recommendation.child_id=issue.child_id
            and recommendation.source_misspelling_instance_id=issue.source_misspelling_instance_id
            and recommendation.recommendation_status in (
              'recommended','pending_admin_review','accepted'
            )
        ) as admin_handoff,
        (select count(*)::int from public.parent_verifications verification
          where verification.parent_user_id=issue.parent_user_id
            and verification.child_id=issue.child_id
            and verification.domain_module='spelling'
            and verification.source_type='authentic_writing'
            and verification.metadata->>'source_misspelling_instance_id'=$5
            and not exists(select 1 from public.parent_verified_spelling_candidate_mappings linked
              where linked.parent_verification_id=verification.id)) as reusable_verifications
       from public.writing_issues issue where issue.id=$1::uuid`,
      [
        manifest.writing_issue_id,
        manifest.observed_word,
        manifest.canonical_word,
        manifest.micro_skill_key,
        manifest.occurrence_id,
      ],
    );
    const facts = route.rows[0];
    if (Number(facts?.reusable_verifications ?? 0) !== 0) {
      throw new Error(`STOP — expected parent-verification effect drifted at ${manifest.occurrence_id}`);
    }
    materializationRoute = facts?.known_route
      ? "known_canonical_match"
      : facts?.admin_handoff
        ? "admin_handoff"
        : "UNSUPPORTED_STAGE_F_HISTORICAL_ROUTE";
    if (
      materializationRoute === "UNSUPPORTED_STAGE_F_HISTORICAL_ROUTE" &&
      STAGE_F_COMPATIBILITY_OCCURRENCES.has(manifest.occurrence_id)
    ) {
      const compatibility = await client.query<AnyRow>(`
        select
          to_regprocedure(
            'public.materialize_r8e_stage_f_historical_occurrence_source(uuid,uuid,uuid)'
          ) is not null as function_present,
          exists (
            select 1
            from public.writing_issues issue
            join public.spelling_catalog_review_cases review_case
              on review_case.parent_user_id = issue.parent_user_id
             and review_case.child_id = issue.child_id
             and review_case.source_misspelling_instance_id =
               issue.source_misspelling_instance_id
            join public.spelling_catalog_review_case_decisions decision
              on decision.case_id = review_case.id
            join public.spelling_canonical_mappings mapping
              on mapping.id = decision.canonical_mapping_id
            where issue.id = $1::uuid
              and issue.source_misspelling_instance_id = $2::uuid
              and issue.issue_status = 'finalised'
              and issue.final_classification in (
                'fragile_knowledge','concept_gap','transfer_failure'
              )
              and review_case.id::text =
                issue.metadata->'returned_correction_stage_f_replay'->>'admin_case_id'
              and decision.id::text =
                issue.metadata->'returned_correction_stage_f_replay'->>'admin_decision_id'
              and mapping.id::text =
                issue.metadata->'returned_correction_stage_f_replay'->>'canonical_mapping_id'
              and review_case.case_status = 'add_canonical_mapping'
              and decision.decision_type = 'add_canonical_mapping'
              and decision.new_status = 'add_canonical_mapping'
              and decision.linked_micro_skill_key = issue.micro_skill_key
              and mapping.source_case_id = review_case.id
              and mapping.source_decision_id = decision.id
              and mapping.misspelling_normalized = $3
              and mapping.correct_spelling_normalized = $4
              and mapping.micro_skill_key = $5
              and mapping.mapping_status = 'active'
              and mapping.resolver_visibility_status = 'visible'
          ) as exact_stage_f_authority
      `, [
        manifest.writing_issue_id,
        manifest.occurrence_id,
        manifest.observed_word,
        manifest.canonical_word,
        manifest.micro_skill_key,
      ]);
      if (
        (
          compatibility.rows[0]?.function_present === true ||
          options.assumeStageFCompatibilityReleased === true
        ) &&
        compatibility.rows[0]?.exact_stage_f_authority === true
      ) {
        materializationRoute = "historical_stage_f_canonical_reconstruction";
      }
    }
  }
  return {
    manifest,
    issue,
    source,
    sourceCount: sources.rows.length,
    intakeCount,
    activeTargetCount,
    lineageCount,
    materializationRoute,
  };
}

async function assertExclusions(
  client: pg.Client,
  ambiguous: ManifestRow[],
  contentOnly: ManifestRow[],
): Promise<AnyRow> {
  const ambiguousResults: AnyRow[] = [];
  for (const row of ambiguous) {
    const state = await client.query<AnyRow>(
      `select source.id as source_id, intake.id as intake_id,
              intake.candidate_state, intake.blockers
         from (select 1) anchor
         left join public.parent_verified_spelling_candidate_mappings source
           on source.child_id=$1::uuid
          and source.source_misspelling_instance_id=$2::uuid
          and source.candidate_status in ('parent_local_promoted','global_canonical_promoted')
         left join public.adle_canonical_intake_candidates intake
           on intake.source_candidate_mapping_id=source.id`,
      [row.child_id, row.occurrence_id],
    );
    const current = state.rows[0] ?? {};
    if (row.canonical_word === "yoghurt") {
      if (
        current.source_id !== row.governed_source_id ||
        current.intake_id !== row.intake_candidate_id ||
        current.candidate_state !== "pending_mapping" ||
        current.blockers?.[0]?.code !== "mapping_missing"
      ) throw new Error("STOP — ambiguous yoghurt exclusion drifted.");
    } else if (current.source_id || current.intake_id) {
      throw new Error(`STOP — ambiguous exclusion drifted: ${row.occurrence_id}`);
    }
    ambiguousResults.push({ word: row.canonical_word, occurrenceId: row.occurrence_id });
  }
  const contentResults: AnyRow[] = [];
  for (const row of contentOnly) {
    const state = await client.query<AnyRow>(
      `select source.id as source_id, source.correct_spelling_normalized,
              source.micro_skill_key, intake.id as intake_id,
              intake.candidate_state, intake.blockers, intake.learning_item_id
         from public.parent_verified_spelling_candidate_mappings source
         join public.adle_canonical_intake_candidates intake
           on intake.source_candidate_mapping_id=source.id
        where source.id=$1::uuid`,
      [row.governed_source_id],
    );
    const current = state.rows[0];
    if (
      !current || current.intake_id !== row.intake_candidate_id ||
      current.candidate_state !== "pending_content" ||
      current.blockers?.[0]?.code !== "canonical_word_missing" ||
      current.learning_item_id !== null ||
      current.correct_spelling_normalized !== row.canonical_word ||
      current.micro_skill_key !== row.micro_skill_key
    ) throw new Error(`STOP — CONTENT_ONLY exclusion drifted: ${row.occurrence_id}`);
    contentResults.push({ word: row.canonical_word, occurrenceId: row.occurrence_id });
  }
  return { ambiguous: ambiguousResults, contentOnly: contentResults };
}

class VirtualCandidateQuery implements PromiseLike<AnyRow> {
  constructor(private readonly candidate: AnyRow) {}
  select(): this { return this; }
  eq(): this { return this; }
  in(): this { return this; }
  then<TResult1 = AnyRow, TResult2 = never>(
    onfulfilled?: ((value: AnyRow) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: [this.candidate], error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

function virtualCandidateClient(
  client: SupabaseClient,
  candidate: AnyRow,
): SupabaseClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "from") {
        return (table: string) =>
          table === "parent_verified_spelling_candidate_mappings"
            ? new VirtualCandidateQuery(candidate)
            : target.from(table);
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as SupabaseClient;
}

async function canonicalDryRun(states: CandidateState[]): Promise<AnyRow> {
  const { intakeApprovedSubmissionCorrections } = await import(
    "../lib/adle/loaders/canonical-intake-live"
  );
  const client = productionSupabaseClient();
  const rows: AnyRow[] = [];
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index];
    const source = state.source;
    const fakeId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const candidate = source ?? {
      id: fakeId,
      parent_user_id: state.issue?.parent_user_id,
      child_id: state.manifest.child_id,
      misspelling_normalized: state.manifest.observed_word,
      correct_spelling_normalized: state.manifest.canonical_word,
      micro_skill_key: state.manifest.micro_skill_key,
      candidate_status: "parent_local_promoted",
      updated_at: state.issue?.updated_at ?? state.manifest.created_at,
      source_adle_review_session_id: null,
      canonical_intake_handoff_state: null,
    };
    const scopedClient = source ? client : virtualCandidateClient(client, candidate);
    const result = await intakeApprovedSubmissionCorrections({
      serviceClient: scopedClient,
      parentUserId: candidate.parent_user_id,
      childId: candidate.child_id,
      submissionId: source?.task_submission_id ?? state.issue?.task_submission_id,
      candidateMappingIds: [candidate.id],
      seedCandidates: false,
      dryRun: true,
    });
    const expected = bool(state.manifest.canonical_mapping_ready)
      ? bool(state.manifest.canonical_content_ready)
        ? "READY"
        : "canonical_word_missing"
      : "mapping_missing";
    const actual = result.eligible === 1
      ? "READY"
      : result.blocked[0]?.blockers?.[0]?.code ?? "UNKNOWN";
    if (actual !== expected) {
      throw new Error(
        `STOP — R8E REPAIR BLOCKED: readiness drift for ${state.manifest.occurrence_id}; expected ${expected}, got ${actual}`,
      );
    }
    rows.push({
      learner: state.manifest.learner_alias,
      cohort: state.manifest.cohort,
      word: state.manifest.canonical_word,
      occurrenceId: state.manifest.occurrence_id,
      gap: state.manifest.classification,
      existingSourceId: source?.id ?? null,
      expectedSourceAction: source ? "REUSE" : "MATERIALISE",
      expectedIntakeOutcome: actual,
      expectedAdleItemAction: actual === "READY" ? "CREATE" : "NONE_BLOCKED",
      expectedLineage: actual === "READY" ? "ADD" : "NONE_BLOCKED",
      reviewSchedule: "NONE",
      materializationRoute: state.materializationRoute,
    });
  }
  const outcomes = rows.reduce(
    (sum, row) => {
      if (row.expectedIntakeOutcome === "READY") sum.ready += 1;
      else if (row.expectedIntakeOutcome === "canonical_word_missing") sum.pendingContent += 1;
      else if (row.expectedIntakeOutcome === "mapping_missing") sum.pendingMapping += 1;
      return sum;
    },
    { ready: 0, pendingContent: 0, pendingMapping: 0 },
  );
  if (
    outcomes.ready !== 14 || outcomes.pendingContent !== 3 ||
    outcomes.pendingMapping !== 2
  ) {
    throw new Error(`STOP — R8E REPAIR BLOCKED: dry-run split ${JSON.stringify(outcomes)}`);
  }
  return { rows, outcomes };
}

async function canonicalDryRunPostgres(
  client: pg.Client,
  states: CandidateState[],
): Promise<AnyRow> {
  const rows: AnyRow[] = [];
  for (const state of states) {
    const readiness = await client.query<AnyRow>(`
      select
        exists (
          select 1
          from public.spelling_canonical_mappings mapping
          where mapping.misspelling_normalized = $1
            and mapping.correct_spelling_normalized = $2
            and mapping.micro_skill_key = $3
            and mapping.mapping_status = 'active'
            and mapping.resolver_visibility_status = 'visible'
        ) as canonical_mapping_ready,
        exists (
          select 1
          from public.canonical_teaching_dictionary_words word
          where word.normalised_word = $2
            and word.row_status = 'active'
            and word.review_status = 'approved_for_first_exposure'
        ) as canonical_content_ready,
        exists (
          select 1
          from public.micro_skill_catalog catalog
          where catalog.micro_skill_key = $3
            and catalog.mastery_domain_key = 'D4'
            and catalog.is_active = true
            and catalog.is_assignable = true
        ) as route_ready
    `, [
      state.manifest.observed_word,
      state.manifest.canonical_word,
      state.manifest.micro_skill_key,
    ]);
    const current = readiness.rows[0];
    if (!current?.route_ready) {
      throw new Error(
        `STOP — R8E REPAIR BLOCKED: D4 route drift for ${state.manifest.occurrence_id}`,
      );
    }
    const expectedMapping = bool(state.manifest.canonical_mapping_ready);
    const expectedContent = bool(state.manifest.canonical_content_ready);
    if (
      current.canonical_mapping_ready !== expectedMapping ||
      current.canonical_content_ready !== expectedContent
    ) {
      throw new Error(
        `STOP — R8E REPAIR BLOCKED: PostgreSQL readiness drift for ${state.manifest.occurrence_id}`,
      );
    }
    const outcome = current.canonical_mapping_ready
      ? current.canonical_content_ready
        ? "READY"
        : "canonical_word_missing"
      : "mapping_missing";
    rows.push({
      learner: state.manifest.learner_alias,
      cohort: state.manifest.cohort,
      word: state.manifest.canonical_word,
      occurrenceId: state.manifest.occurrence_id,
      gap: state.manifest.classification,
      existingSourceId: state.source?.id ?? null,
      expectedSourceAction: state.source ? "REUSE" : "MATERIALISE",
      expectedIntakeOutcome: outcome,
      expectedAdleItemAction: outcome === "READY" ? "CREATE" : "NONE_BLOCKED",
      expectedLineage: outcome === "READY" ? "ADD" : "NONE_BLOCKED",
      reviewSchedule: "NONE",
      materializationRoute: state.materializationRoute,
    });
  }
  const outcomes = rows.reduce(
    (sum, row) => {
      if (row.expectedIntakeOutcome === "READY") sum.ready += 1;
      else if (row.expectedIntakeOutcome === "canonical_word_missing") {
        sum.pendingContent += 1;
      } else if (row.expectedIntakeOutcome === "mapping_missing") {
        sum.pendingMapping += 1;
      }
      return sum;
    },
    { ready: 0, pendingContent: 0, pendingMapping: 0 },
  );
  if (
    outcomes.ready !== 14 || outcomes.pendingContent !== 3 ||
    outcomes.pendingMapping !== 2
  ) {
    throw new Error(
      `STOP — R8E REPAIR BLOCKED: PostgreSQL dry-run split ${JSON.stringify(outcomes)}`,
    );
  }
  return {
    status: "PASS",
    execution: "production_readonly_postgresql_compatibility_preview",
    rows,
    outcomes,
  };
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

function writePreflightArtifacts(receipt: AnyRow): void {
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  writeFileSync(
    resolve(OUTPUT_DIRECTORY, "r8e-repair-preflight.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  const report = `# R8E Historical Repair Dry Run

Generated: ${receipt.generatedAt}

Accepted manifest: exact 19 deterministic occurrence IDs. R8D-first: 0. Ambiguous excluded: 4. CONTENT_ONLY excluded: 4.

Expected aggregate effects: parent_verifications +9; governed_sources +9; intake_candidates +19; ADLE learning_items +14; lineage +14; Review schedules +0.

${markdownTable(
    [
      "Learner/cohort", "Word", "Occurrence ID", "Gap", "Existing source",
      "Expected source action", "Expected intake outcome",
      "Expected ADLE item action", "Expected lineage", "Review schedule",
    ],
    receipt.dryRun.rows.map((row: AnyRow) => [
      `${row.learner} / ${row.cohort}`,
      row.word,
      row.occurrenceId,
      row.gap,
      row.existingSourceId,
      row.expectedSourceAction,
      row.expectedIntakeOutcome,
      row.expectedAdleItemAction,
      row.expectedLineage,
      row.reviewSchedule,
    ]),
  )}
`;
  writeFileSync(resolve(OUTPUT_DIRECTORY, "R8E-REPAIR-DRY-RUN.md"), report);
}

function expectedDryRun(states: CandidateState[]): AnyRow {
  return {
    status: "NOT_EXECUTED_GATE_BLOCKED",
    outcomes: { ready: 14, pendingContent: 3, pendingMapping: 2 },
    rows: states.map((state) => {
      const outcome = bool(state.manifest.canonical_mapping_ready)
        ? bool(state.manifest.canonical_content_ready)
          ? "READY"
          : "canonical_word_missing"
        : "mapping_missing";
      return {
        learner: state.manifest.learner_alias,
        cohort: state.manifest.cohort,
        word: state.manifest.canonical_word,
        occurrenceId: state.manifest.occurrence_id,
        gap: state.manifest.classification,
        existingSourceId: state.source?.id ?? null,
        expectedSourceAction: state.source ? "REUSE" : "MATERIALISE",
        expectedIntakeOutcome: outcome,
        expectedAdleItemAction: outcome === "READY" ? "CREATE" : "NONE_BLOCKED",
        expectedLineage: outcome === "READY" ? "ADD" : "NONE_BLOCKED",
        reviewSchedule: "NONE",
        materializationRoute: state.materializationRoute,
      };
    }),
  };
}

function writeBlockedArtifacts(receipt: AnyRow): void {
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  writeFileSync(
    resolve(OUTPUT_DIRECTORY, "r8e-repair-blocked-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  const blockedRows = receipt.gateBlockers as AnyRow[];
  const report = `# R8E Write-Enabled Historical Repair Gate

## 1. Verdict

R8E HISTORICAL REPAIR BLOCKED — NO REPAIR PERFORMED

## 2. Fresh preflight

The accepted artifact hashes are unchanged. Production still reports exactly 19 deterministic occurrence IDs, 0 R8D-first cases, 4 ambiguous exclusions, and 4 CONTENT_ONLY exclusions. R8D migration 20260828140000 and its guard table, column, functions, and writing-issue trigger are present and healthy.

The gate stopped because 7 of the 9 missing-source rows cannot be passed to the released R8B materializer without changing historical authority state first.

${markdownTable(
    ["Word", "Occurrence ID", "Blocker"],
    blockedRows.map((row) => [row.word, row.occurrenceId, row.code]),
  )}

## 3. Repair execution

Missing-source repairs: 0. Missing-intake repairs: 0. Total repaired: 0. Partial execution was forbidden, so the otherwise-supported rows were not written.

## 4. Actual row effects

${markdownTable(
    ["Table/effect", "Expected", "Actual"],
    Object.entries(EXPECTED_EFFECTS).map(([key, expected]) => [key, expected, 0]),
  )}

## 5. Affected learner

§football§ and §replay§ still lack governed sources. Both are individually compatible with the released known-match materializer, but were deliberately left untouched because the exact 19-row gate is all-or-nothing. §rainbow§ and §renew§ are unchanged; §renew§ remains §pending_content / canonical_word_missing§.

## 6. Authorised R7 learner

§business§ and §fly§ remain missing-intake candidates and were not repaired. §chicken§ remains excluded and untouched. Protected R7 history was not changed.

## 7. Other learner repairs

No repair ran. The seven Stage-F historical source gaps listed above retain exact canonical identities, but R8B does not recognise their historical authority shape as a currently admissible materialization route.

## 8. Blocked outcomes

No new intake blocker was created. The accepted predicted blockers for §loads§, §varieties§, §ingredients§, §ingredient§, and the deterministic §yoghurt§ occurrence were not materialized because Gate 3 failed first.

## 9. Idempotency / duplicates

The released uniqueness constraints and R8D guards are healthy, but no idempotent write was attempted. Duplicate live governed sources, intake candidates, ADLE targets, and lineage added: 0.

## 10. Protected-history receipt

No write transaction began. Assignments, attempts, taught history, Review sessions, encounters, outcomes, transition receipts, completion receipts, and rollout rows were not modified.

## 11. Review/rollout isolation

New Review schedules: 0. New Review routes: 0. New assignments: 0. New sessions: 0. New encounters: 0. New rollout rows: 0.

## 12. Post-repair R8E audit

No post-repair audit is applicable because no repair occurred. The fresh read-only preflight remains: deterministic repairs 19, ambiguous cases 4, CONTENT_ONLY cases 4, R8D-first cases 0.

## 13. Parent Insights visibility observation

Unchanged. Missing-source and missing-intake words remain absent from the existing downstream ADLE-item path; content-blocked candidates may remain retained but invisible. No Parent Insights change was made.

## 14. Production health

R8D health passed. Production writes, schema changes, migration changes, Review changes, rollout changes, deployments, commits, and pushes: 0.

## 15. Audit artifacts

The original accepted R8E artifacts were preserved byte-for-byte. Separate gate artifacts:

- §R8E-HISTORICAL-REPAIR-REPORT.md§
- §R8E-REPAIR-DRY-RUN.md§
- §r8e-repair-preflight.json§
- §r8e-repair-blocked-receipt.json§

## 16. Deferred work

- 4 ambiguous historical cases — manual resolution
- content/canonical blockers
- Parent Insights learning-word completeness
- Review multi-route evidence/proficiency
- R8G final end-to-end verification
- Phase E

## 17. Next gate

Do not begin another write automatically. A separately authorised compatibility decision is required for the seven exact Stage-F historical sources: either a governed released materializer that accepts their immutable Stage-F/admin-decision authority, or a formally revised repair plan. R8E must not mutate writing-issue metadata, reopen historical admin cases, or use direct ad-hoc source inserts to bypass R8B.
`.replaceAll("§", String.fromCharCode(96));
  writeFileSync(
    resolve(OUTPUT_DIRECTORY, "R8E-HISTORICAL-REPAIR-REPORT.md"),
    report,
  );
}

async function protectedSnapshot(client: pg.Client): Promise<Record<string, AnyRow>> {
  const tables = await client.query<{ table_name: string }>(`
    select table_name
    from information_schema.tables
    where table_schema='public'
      and table_type='BASE TABLE'
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
    if (!/^[a-z0-9_]+$/u.test(table)) throw new Error("Unsafe protected table name.");
    const result = await client.query<AnyRow>(
      `select count(*)::int as count,
              md5(coalesce(jsonb_agg(to_jsonb(row_data)
                order by to_jsonb(row_data)::text)::text,'[]')) as digest
         from public.${table} row_data`,
    );
    snapshot[table] = result.rows[0];
  }
  return snapshot;
}

async function rowCounts(client: pg.Client): Promise<Record<string, number>> {
  const result = await client.query<AnyRow>(`
    select
      (select count(*)::int from public.parent_verifications) as parent_verifications,
      (select count(*)::int from public.parent_verified_spelling_candidate_mappings) as governed_sources,
      (select count(*)::int from public.adle_canonical_intake_candidates) as intake_candidates,
      (select count(*)::int from public.adle_learning_items) as adle_learning_items,
      (select count(*)::int from public.adle_learning_item_sources) as lineage,
      (select count(*)::int from public.adle_review_schedule_words) as review_schedules
  `);
  return result.rows[0] as Record<string, number>;
}

export async function preflight(options: {
  writeArtifacts: boolean;
  compatibilityPreview?: boolean;
}): Promise<AnyRow> {
  const manifest = loadManifest();
  const client = new pg.Client({
    connectionString: productionConnectionString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const readOnly = await client.query<{ transaction_read_only: string }>(
      "show transaction_read_only",
    );
    if (readOnly.rows[0]?.transaction_read_only !== "on") {
      throw new Error("STOP — production preflight is not read-only.");
    }
    const r8d = await assertR8DHealthy(client);
    const states: CandidateState[] = [];
    for (const row of manifest.deterministic) {
      states.push(await candidateState(client, row, {
        assumeStageFCompatibilityReleased: options.compatibilityPreview,
      }));
    }
    const exclusions = await assertExclusions(
      client,
      manifest.ambiguous,
      manifest.contentOnly,
    );
    const protectedHistory = await protectedSnapshot(client);
    const counts = await rowCounts(client);
    const unsupportedSourceRows = states.filter(
      (state) => state.materializationRoute === "UNSUPPORTED_STAGE_F_HISTORICAL_ROUTE",
    );
    const dryRun = options.compatibilityPreview
      ? await canonicalDryRunPostgres(client, states)
      : null;
    await client.query("rollback");
    const resolvedDryRun = dryRun ?? (
      unsupportedSourceRows.length === 0
        ? await canonicalDryRun(states)
        : expectedDryRun(states)
    );
    const receipt = {
      status: unsupportedSourceRows.length === 0 ? "PASS" : "BLOCKED",
      generatedAt: new Date().toISOString(),
      productionProjectRef: PRODUCTION_PROJECT_REF,
      transactionReadOnly: true,
      mutationPerformed: false,
      compatibilityPreview: options.compatibilityPreview === true,
      acceptedArtifactHashes: EXPECTED_ARTIFACT_HASHES,
      repairPopulation: {
        deterministic: states.length,
        missingSource: states.filter((state) => !state.source).length,
        missingIntake: states.filter((state) => Boolean(state.source)).length,
        r8dFirst: 0,
        ambiguousExcluded: manifest.ambiguous.length,
        contentOnlyExcluded: manifest.contentOnly.length,
      },
      expectedEffects: EXPECTED_EFFECTS,
      r8d,
      exclusions,
      dryRun: resolvedDryRun,
      gateBlockers: unsupportedSourceRows.map((state) => ({
        code: "R8B_MATERIALIZATION_ROUTE_UNSUPPORTED",
        word: state.manifest.canonical_word,
        occurrenceId: state.manifest.occurrence_id,
        detail: "Historical Stage-F canonical authority is exact, but the released R8B function accepts only known_match_auto_resolution or a still-open/admin-handoff state.",
      })),
      protectedHistory,
      rowCounts: counts,
    };
    if (options.writeArtifacts) {
      writePreflightArtifacts(receipt);
      if (receipt.status === "BLOCKED") writeBlockedArtifacts(receipt);
    }
    return { receipt, states };
  } catch (error) {
    try { await client.query("rollback"); } catch { /* original error wins */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function executeRepair(): Promise<AnyRow> {
  if (!process.argv.slice(3).includes(EXECUTE_CONFIRMATION)) {
    throw new Error(`Refusing production write without: -- ${EXECUTE_CONFIRMATION}`);
  }
  const gate = await preflight({ writeArtifacts: true });
  if (gate.receipt.status !== "PASS") {
    throw new Error("STOP — R8E REPAIR BLOCKED: pre-write gates did not pass.");
  }
  const states = gate.states as CandidateState[];
  const beforeProtected = gate.receipt.protectedHistory as Record<string, AnyRow>;
  const beforeCounts = gate.receipt.rowCounts as Record<string, number>;
  const client = new pg.Client({
    connectionString: productionConnectionString(),
    ssl: { rejectUnauthorized: false },
  });
  const sourceActions: AnyRow[] = [];
  await client.connect();
  try {
    await client.query("begin transaction isolation level serializable");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      "r8e-historical-repair-exact-19-v1",
    ]);
    await assertR8DHealthy(client);
    for (const accepted of states) await candidateState(client, accepted.manifest);
    for (const state of states.filter((entry) => !entry.source)) {
      const stageFCompatibility = state.materializationRoute ===
        "historical_stage_f_canonical_reconstruction";
      const result = stageFCompatibility
        ? await client.query<{ result: AnyRow }>(
            `select public.materialize_r8e_stage_f_historical_occurrence_source(
              $1::uuid,$2::uuid,$3::uuid
            ) as result`,
            [
              state.manifest.occurrence_id,
              state.issue?.parent_user_id,
              state.manifest.child_id,
            ],
          )
        : await client.query<{ result: AnyRow }>(
            `select public.ensure_parent_approved_spelling_occurrence_source(
              $1::uuid,$2::uuid,$3::uuid,$4
            ) as result`,
            [
              state.manifest.writing_issue_id,
              state.issue?.parent_user_id,
              state.manifest.child_id,
              state.manifest.learning_intent,
            ],
          );
      const action = result.rows[0]?.result;
      if (!action || action.action !== "materialized" || !action.candidate_mapping_id) {
        throw new Error(`R8B materialisation failed for ${state.manifest.occurrence_id}`);
      }
      sourceActions.push({
        occurrenceId: state.manifest.occurrence_id,
        sourceId: action.candidate_mapping_id,
        action: action.action,
      });
    }
    const taskThreads = await client.query<AnyRow>(
      `select distinct submission.task_id, issue.parent_user_id, issue.child_id
         from public.writing_issues issue
         join public.task_submissions submission on submission.id=issue.task_submission_id
        where issue.id=any($1::uuid[])`,
      [states.filter((entry) => !entry.source).map((entry) => entry.manifest.writing_issue_id)],
    );
    for (const thread of taskThreads.rows) {
      const approved = await client.query<{ id: string }>(
        `select id from public.task_submissions
          where task_id=$1::uuid and parent_user_id=$2::uuid and child_id=$3::uuid
            and parent_review_status='approved'
          order by submitted_at desc nulls last, created_at desc, id desc limit 1`,
        [thread.task_id, thread.parent_user_id, thread.child_id],
      );
      const submissionId = approved.rows[0]?.id;
      if (!submissionId) throw new Error(`R8C task thread has no approved submission: ${thread.task_id}`);
      const governed = await client.query<{ sources: AnyRow[] }>(
        `select public.collect_submission_thread_occurrence_sources(
          $1::uuid,$2::uuid,$3::uuid
        ) as sources`,
        [thread.task_id, thread.parent_user_id, thread.child_id],
      );
      const ids = (governed.rows[0]?.sources ?? [])
        .map((source) => source.candidate_mapping_id)
        .filter(Boolean)
        .sort();
      if (ids.length === 0 || new Set(ids).size !== ids.length) {
        throw new Error(`R8C governed source set is invalid for task ${thread.task_id}`);
      }
      await client.query(
        `select public.adle_authorize_parent_approval_exact_id_handoff(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid[]
        )`,
        [submissionId, thread.parent_user_id, thread.child_id, ids],
      );
    }
    await client.query("commit");
  } catch (error) {
    try { await client.query("rollback"); } catch { /* original error wins */ }
    throw error;
  } finally {
    await client.end();
  }

  const serviceClient = productionSupabaseClient();
  const { intakeApprovedSubmissionCorrections } = await import(
    "../lib/adle/loaders/canonical-intake-live"
  );
  const intakeActions: AnyRow[] = [];
  for (const state of states) {
    const lookup = await new pg.Client({
      connectionString: productionConnectionString(),
      ssl: { rejectUnauthorized: false },
    });
    await lookup.connect();
    let source: AnyRow;
    try {
      const result = await lookup.query<AnyRow>(
        `select * from public.parent_verified_spelling_candidate_mappings
          where child_id=$1::uuid and source_misspelling_instance_id=$2::uuid
            and candidate_status in ('parent_local_promoted','global_canonical_promoted')`,
        [state.manifest.child_id, state.manifest.occurrence_id],
      );
      if (result.rows.length !== 1) throw new Error(`No exact live source after materialisation: ${state.manifest.occurrence_id}`);
      source = result.rows[0];
    } finally {
      await lookup.end();
    }
    const result = await intakeApprovedSubmissionCorrections({
      serviceClient,
      parentUserId: source.parent_user_id,
      childId: source.child_id,
      submissionId: source.task_submission_id,
      candidateMappingIds: [source.id],
      dryRun: false,
    });
    const expected = bool(state.manifest.canonical_mapping_ready)
      ? bool(state.manifest.canonical_content_ready) ? "READY" : "canonical_word_missing"
      : "mapping_missing";
    const actual = result.eligible === 1
      ? "READY"
      : result.blocked[0]?.blockers?.[0]?.code ?? "UNKNOWN";
    if (actual !== expected) {
      throw new Error(`R8E intake outcome failed for ${state.manifest.occurrence_id}: ${actual}`);
    }
    intakeActions.push({
      occurrenceId: state.manifest.occurrence_id,
      sourceId: source.id,
      expected,
      result,
    });
  }

  const verification = await verifyProduction(states, beforeCounts, beforeProtected);
  const receipt = {
    verdict: "R8E HISTORICAL REPAIR COMPLETED AND VERIFIED",
    generatedAt: new Date().toISOString(),
    productionProjectRef: PRODUCTION_PROJECT_REF,
    originalArtifactHashes: EXPECTED_ARTIFACT_HASHES,
    repairPopulation: gate.receipt.repairPopulation,
    sourceActions,
    intakeActions,
    ...verification,
  };
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  writeFileSync(
    resolve(OUTPUT_DIRECTORY, "r8e-post-repair-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return receipt;
}

async function verifyProduction(
  states: CandidateState[],
  beforeCounts?: Record<string, number>,
  beforeProtected?: Record<string, AnyRow>,
): Promise<AnyRow> {
  const client = new pg.Client({
    connectionString: productionConnectionString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const repaired: AnyRow[] = [];
    for (const state of states) {
      const result = await client.query<AnyRow>(
        `select source.id as source_id, source.canonical_intake_handoff_state,
                intake.id as intake_id, intake.candidate_state, intake.blockers,
                intake.learning_item_id, word.normalised_word as canonical_word,
                item.micro_skill_key,
                lineage.id as lineage_id,
                (select count(*)::int from public.adle_learning_items duplicate
                  where duplicate.child_id=source.child_id
                    and duplicate.canonical_word=$3
                    and duplicate.micro_skill_key=$4
                    and duplicate.row_status='active') as active_target_count,
                (select count(*)::int from public.adle_canonical_intake_candidates duplicate
                  where duplicate.source_candidate_mapping_id=source.id) as intake_count,
                (select count(*)::int from public.adle_learning_item_sources duplicate
                  where duplicate.parent_verified_candidate_mapping_id=source.id
                    and duplicate.row_status='active') as lineage_count
           from public.parent_verified_spelling_candidate_mappings source
           join public.adle_canonical_intake_candidates intake
             on intake.source_candidate_mapping_id=source.id
           left join public.adle_learning_items item on item.id=intake.learning_item_id
           left join public.canonical_teaching_dictionary_words word
             on word.id=item.canonical_word_id
           left join public.adle_learning_item_sources lineage
             on lineage.parent_verified_candidate_mapping_id=source.id
            and lineage.learning_item_id=intake.learning_item_id
            and lineage.row_status='active'
          where source.child_id=$1::uuid
            and source.source_misspelling_instance_id=$2::uuid
            and source.candidate_status in ('parent_local_promoted','global_canonical_promoted')`,
        [
          state.manifest.child_id,
          state.manifest.occurrence_id,
          state.manifest.canonical_word,
          state.manifest.micro_skill_key,
        ],
      );
      const row = result.rows[0];
      const ready = bool(state.manifest.canonical_mapping_ready) &&
        bool(state.manifest.canonical_content_ready);
      if (
        result.rows.length !== 1 || !row?.source_id || !row.intake_id ||
        Number(row.intake_count) !== 1 ||
        (ready && (
          row.candidate_state !== "activated" || !row.learning_item_id ||
          !row.lineage_id || Number(row.lineage_count) !== 1 ||
          Number(row.active_target_count) !== 1 ||
          row.canonical_word !== state.manifest.canonical_word ||
          row.micro_skill_key !== state.manifest.micro_skill_key
        )) ||
        (!ready && (
          !new Set(["pending_content", "pending_mapping"]).has(row.candidate_state) ||
          row.learning_item_id !== null || row.lineage_id !== null ||
          Number(row.lineage_count) !== 0 || Number(row.active_target_count) !== 0
        ))
      ) {
        throw new Error(`R8E immediate verification failed: ${state.manifest.occurrence_id}`);
      }
      repaired.push({
        learner: state.manifest.learner_alias,
        word: state.manifest.canonical_word,
        occurrenceId: state.manifest.occurrence_id,
        sourceId: row.source_id,
        intakeId: row.intake_id,
        candidateState: row.candidate_state,
        blocker: row.blockers?.[0]?.code ?? null,
        learningItemId: row.learning_item_id,
        lineageId: row.lineage_id,
      });
    }
    const afterCounts = await rowCounts(client);
    const afterProtected = await protectedSnapshot(client);
    await client.query("rollback");
    const actualEffects = beforeCounts
      ? Object.fromEntries(Object.keys(EXPECTED_EFFECTS).map((key) => [
          key,
          (afterCounts[key] ?? 0) - (beforeCounts[key] ?? 0),
        ]))
      : null;
    if (
      actualEffects &&
      JSON.stringify(actualEffects) !== JSON.stringify(EXPECTED_EFFECTS)
    ) throw new Error(`R8E actual effects differ: ${JSON.stringify(actualEffects)}`);
    if (
      beforeProtected &&
      JSON.stringify(afterProtected) !== JSON.stringify(beforeProtected)
    ) throw new Error("R8E REPAIR FAILED — protected Review/rollout history changed.");
    return {
      verifiedOccurrences: repaired,
      actualEffects,
      beforeCounts,
      afterCounts,
      protectedHistoryBefore: beforeProtected,
      protectedHistoryAfter: afterProtected,
      protectedHistoryUnchanged: beforeProtected
        ? JSON.stringify(afterProtected) === JSON.stringify(beforeProtected)
        : null,
    };
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "preflight";
  if (mode === "preflight") {
    const result = await preflight({ writeArtifacts: true });
    process.stdout.write(`${JSON.stringify(result.receipt, null, 2)}\n`);
    return;
  }
  if (mode === "compatibility-preflight") {
    const result = await preflight({
      writeArtifacts: false,
      compatibilityPreview: true,
    });
    process.stdout.write(`${JSON.stringify(result.receipt, null, 2)}\n`);
    return;
  }
  if (mode === "execute") {
    const result = await executeRepair();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (mode === "verify") {
    const manifest = loadManifest();
    const states = manifest.deterministic.map((row) => ({ manifest: row })) as CandidateState[];
    const result = await verifyProduction(states);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new Error(`Unsupported mode: ${mode}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
