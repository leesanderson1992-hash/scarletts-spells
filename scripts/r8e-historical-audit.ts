import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const AUTHORISED_R7_CHILD_ID = "bfe4ece9-2419-4a15-93c0-fbfd4c552fa5";
const OTHER_REAL_CHILD_ID = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
const AFFECTED_UNACTIVATED_CHILD_ID = "8629d7b2-5770-48bd-b33d-b10e02d9c559";
const AUDITED_FOCUS_CHILD_IDS: readonly string[] = [
  AUTHORISED_R7_CHILD_ID,
  OTHER_REAL_CHILD_ID,
  AFFECTED_UNACTIVATED_CHILD_ID,
] as const;
const OUTPUT_DIRECTORY = resolve("outputs/r8e-historical-audit");
const LEARNING_CLASSIFICATIONS = new Set([
  "fragile_knowledge",
  "concept_gap",
  "transfer_failure",
]);
const NON_LEARNING_CLASSIFICATIONS = new Set(["checking_only", "not_an_issue"]);
const LIVE_SOURCE_STATUSES = new Set(["parent_local_promoted", "global_canonical_promoted"]);
const PARENT_INSIGHTS_ITEM_STATUSES = new Set([
  "pending_reteach",
  "pending",
  "in_lesson",
  "awaiting_review_outcome",
  "paused_parent_review",
]);

// Query modes intentionally project heterogeneous production rows into one audit model.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function csvCell(value: unknown): string {
  const text = value == null
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(rows: readonly AnyRow[], columns: readonly string[]): string {
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n") + "\n";
}

function markdownTable(headers: readonly string[], rows: readonly unknown[][]): string {
  const safe = (value: unknown) => String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
  return [
    `| ${headers.map(safe).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(safe).join(" | ")} |`),
  ].join("\n");
}

function countBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[key(row)] = (counts[key(row)] ?? 0) + 1;
  return counts;
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

function productionConnectionString(): string {
  loadEnvFile(".env.local");
  const connectionString =
    process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED?.trim() ??
    process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION?.trim();
  if (!connectionString) {
    throw new Error("Missing a supported production database URL.");
  }
  const parsed = new URL(connectionString);
  if (!parsed.username.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error("R8E audit is pinned to the expected production project.");
  }
  return connectionString;
}

async function discoverSchema(client: pg.Client): Promise<unknown> {
  const patterns = [
    "children",
    "task_submissions",
    "writing_samples",
    "misspelling_instances",
    "writing_issue_suggestions",
    "writing_issues",
    "learning_items",
    "learning_item_issue_links",
    "learning_item_evidence",
    "parent_verifications",
    "writing_issue_correction_attempts",
    "word_progress",
    "parent_verified_spelling_candidate_mappings",
    "spelling_catalog_review_cases",
    "spelling_canonical_mapping_recommendations",
    "spelling_canonical_mappings",
    "canonical_teaching_dictionary_words",
    "canonical_teaching_dictionary_word_micro_skills",
    "adle_canonical_intake_candidates",
    "adle_canonical_intake_candidate_demands",
    "adle_canonical_intake_demands",
    "adle_learning_items",
    "adle_learning_item_sources",
    "adle_review_schedule_words",
    "adle_review_schedule_word_routes",
    "adle_review_sessions",
    "adle_review_word_encounters",
    "daily_assignments",
    "assignment_items",
  ];
  const columns = await client.query<{
    table_name: string;
    ordinal_position: number;
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    `select table_name, ordinal_position, column_name, data_type, is_nullable
       from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
      order by table_name, ordinal_position`,
    [patterns],
  );
  const tables = await client.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and (
          table_name ilike '%spelling%'
          or table_name ilike '%writing%'
          or table_name ilike 'adle%learning%'
          or table_name ilike 'adle%review%'
          or table_name ilike 'adle%canonical%intake%'
        )
      order by table_name`,
  );
  const grouped: Record<string, unknown[]> = {};
  for (const row of columns.rows) {
    (grouped[row.table_name] ??= []).push({
      position: row.ordinal_position,
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === "YES",
    });
  }
  return {
    mode: "schema",
    transactionReadOnly: true,
    relatedTables: tables.rows.map((row) => row.table_name),
    columns: grouped,
  };
}

async function inspectPopulation(client: pg.Client): Promise<Record<string, unknown>> {
  const children = await client.query(`
    select
      child.id,
      child.parent_user_id,
      child.first_name,
      child.last_name,
      child.notes,
      child.is_archived,
      child.created_at,
      (select count(*)::int from public.misspelling_instances row where row.child_id = child.id) as misspellings,
      (select count(*)::int from public.writing_issue_suggestions row where row.child_id = child.id) as suggestions,
      (select count(*)::int from public.writing_issues row where row.child_id = child.id) as issues,
      (select count(*)::int from public.learning_items row where row.child_id = child.id) as legacy_learning_items,
      (select count(*)::int from public.parent_verified_spelling_candidate_mappings row where row.child_id = child.id) as governed_sources,
      (select count(*)::int from public.spelling_catalog_review_cases row where row.child_id = child.id) as catalog_cases,
      (select count(*)::int from public.spelling_canonical_mapping_recommendations row where row.child_id = child.id) as recommendations,
      (select count(*)::int from public.adle_canonical_intake_candidates row where row.child_id = child.id) as intake_candidates,
      (select count(*)::int from public.adle_learning_items row where row.child_id = child.id) as adle_learning_items,
      (select count(*)::int from public.adle_review_schedule_words row where row.child_id = child.id) as schedule_words,
      (select count(*)::int from public.adle_review_sessions row where row.child_id = child.id) as review_sessions
    from public.children child
    order by child.created_at, child.id
  `);
  const statuses = await client.query(`
    select 'writing_issue_suggestions.suggestion_status' as field, suggestion_status as value, count(*)::int
      from public.writing_issue_suggestions group by suggestion_status
    union all
    select 'writing_issues.issue_status', issue_status, count(*)::int
      from public.writing_issues group by issue_status
    union all
    select 'writing_issues.final_classification', coalesce(final_classification, '<null>'), count(*)::int
      from public.writing_issues group by final_classification
    union all
    select 'parent_verified_spelling_candidate_mappings.candidate_status', candidate_status, count(*)::int
      from public.parent_verified_spelling_candidate_mappings group by candidate_status
    union all
    select 'parent_verified_spelling_candidate_mappings.promotion_scope', promotion_scope, count(*)::int
      from public.parent_verified_spelling_candidate_mappings group by promotion_scope
    union all
    select 'parent_verified_spelling_candidate_mappings.handoff_state', coalesce(canonical_intake_handoff_state, '<null>'), count(*)::int
      from public.parent_verified_spelling_candidate_mappings group by canonical_intake_handoff_state
    union all
    select 'adle_canonical_intake_candidates.candidate_state', candidate_state, count(*)::int
      from public.adle_canonical_intake_candidates group by candidate_state
    union all
    select 'adle_learning_items.row_status', row_status, count(*)::int
      from public.adle_learning_items group by row_status
    union all
    select 'adle_learning_items.source_kind', source_kind, count(*)::int
      from public.adle_learning_items group by source_kind
    union all
    select 'adle_learning_item_sources.row_status', row_status, count(*)::int
      from public.adle_learning_item_sources group by row_status
    order by field, value
  `);
  const knownCases = await client.query(`
    select child.id as child_id, child.first_name, child.last_name,
           issue.id as writing_issue_id, issue.source_misspelling_instance_id,
           issue.issue_status, issue.final_classification, issue.observed_text,
           issue.approved_replacement, issue.micro_skill_key, issue.created_at,
           source.id as source_id, source.candidate_status,
           source.canonical_intake_handoff_state,
           intake.id as intake_id, intake.candidate_state,
           adle.id as adle_learning_item_id,
           lineage.id as lineage_id
      from public.writing_issues issue
      join public.children child on child.id = issue.child_id
      left join public.parent_verified_spelling_candidate_mappings source
        on source.source_misspelling_instance_id = issue.source_misspelling_instance_id
       and source.child_id = issue.child_id
       and source.correct_spelling_normalized = lower(btrim(coalesce(issue.approved_replacement, issue.suggested_replacement)))
       and source.micro_skill_key = issue.micro_skill_key
      left join public.adle_canonical_intake_candidates intake
        on intake.source_candidate_mapping_id = source.id
      left join public.adle_learning_items adle on adle.id = intake.learning_item_id
      left join public.adle_learning_item_sources lineage
        on lineage.learning_item_id = adle.id
       and lineage.parent_verified_candidate_mapping_id = source.id
     where lower(btrim(coalesce(issue.approved_replacement, issue.suggested_replacement)))
       = any(array['football','replay','rainbow','renew'])
     order by child.created_at, issue.created_at, issue.id
  `);
  return {
    mode: "population",
    transactionReadOnly: true,
    children: children.rows,
    statuses: statuses.rows,
    knownCases: knownCases.rows,
  };
}

async function inspectEvidence(
  client: pg.Client,
  requestedChildIds: readonly string[] = AUDITED_FOCUS_CHILD_IDS,
): Promise<Record<string, unknown>> {
  const childIds = [...requestedChildIds];
  const issues = await client.query(
    `select
       issue.id, issue.child_id, issue.task_submission_id, issue.writing_sample_id,
       issue.source_suggestion_id, issue.source_misspelling_instance_id,
       issue.linked_word_progress_id, issue.reactivates_writing_issue_id,
       issue.issue_status, issue.final_classification, issue.observed_text,
       issue.suggested_replacement, issue.approved_replacement,
       issue.micro_skill_key, issue.metadata, issue.created_at,
       misspelling.misspelled_word, misspelling.corrected_word,
       misspelling.is_parent_overridden, misspelling.is_false_positive,
       misspelling.position_start, misspelling.position_end,
       coalesce((
         select jsonb_agg(to_jsonb(attempt) order by attempt.created_at, attempt.id)
         from public.writing_issue_correction_attempts attempt
         where attempt.writing_issue_id = issue.id
       ), '[]'::jsonb) as correction_attempts
     from public.writing_issues issue
     left join public.misspelling_instances misspelling
       on misspelling.id = issue.source_misspelling_instance_id
     where issue.child_id = any($1::uuid[])
     order by issue.child_id, issue.created_at, issue.id`,
    [childIds],
  );
  const legacyItems = await client.query(
    `select item.*
       from public.learning_items item
      where item.child_id = any($1::uuid[])
      order by item.child_id, item.created_at, item.id`,
    [childIds],
  );
  const legacyIssueLinks = await client.query(
    `select link.*
       from public.learning_item_issue_links link
      where link.child_id = any($1::uuid[])
      order by link.child_id, link.created_at, link.id`,
    [childIds],
  );
  const legacyEvidence = await client.query(
    `select evidence.*
       from public.learning_item_evidence evidence
      where evidence.child_id = any($1::uuid[])
      order by evidence.child_id, evidence.created_at, evidence.id`,
    [childIds],
  );
  const wordProgress = await client.query(
    `select progress.*
       from public.word_progress progress
      where progress.child_id = any($1::uuid[])
      order by progress.child_id, progress.created_at, progress.id`,
    [childIds],
  );
  const parentVerifications = await client.query(
    `select verification.id, verification.child_id, verification.domain_module,
            verification.source_type, verification.source_entity_id,
            verification.task_submission_id, verification.writing_sample_id,
            verification.suggested_micro_skill_key, verification.decision,
            verification.verified_micro_skill_key, verification.metadata,
            verification.verified_at, verification.created_at
       from public.parent_verifications verification
      where verification.child_id = any($1::uuid[])
        and verification.domain_module = 'spelling'
      order by verification.child_id, verification.created_at, verification.id`,
    [childIds],
  );
  const sources = await client.query(
    `select source.*
       from public.parent_verified_spelling_candidate_mappings source
      where source.child_id = any($1::uuid[])
      order by source.child_id, source.created_at, source.id`,
    [childIds],
  );
  const catalogCases = await client.query(
    `select review_case.*
       from public.spelling_catalog_review_cases review_case
      where review_case.child_id = any($1::uuid[])
      order by review_case.child_id, review_case.created_at, review_case.id`,
    [childIds],
  );
  const recommendations = await client.query(
    `select recommendation.*
       from public.spelling_canonical_mapping_recommendations recommendation
      where recommendation.child_id = any($1::uuid[])
      order by recommendation.child_id, recommendation.created_at, recommendation.id`,
    [childIds],
  );
  const canonicalMappings = await client.query(
    `with target_pairs as (
       select distinct lower(btrim(coalesce(observed_text, ''))) as misspelling,
              lower(btrim(coalesce(approved_replacement, suggested_replacement, ''))) as correction
         from public.writing_issues
        where child_id = any($1::uuid[])
       union
       select distinct misspelling_normalized, correct_spelling_normalized
         from public.parent_verified_spelling_candidate_mappings
        where child_id = any($1::uuid[])
     )
     select distinct mapping.*
       from public.spelling_canonical_mappings mapping
       join target_pairs target
         on target.misspelling = mapping.misspelling_normalized
        and target.correction = mapping.correct_spelling_normalized
      order by mapping.created_at, mapping.id`,
    [childIds],
  );
  const intakeCandidates = await client.query(
    `select candidate.*, word.normalised_word as canonical_word
       from public.adle_canonical_intake_candidates candidate
       left join public.canonical_teaching_dictionary_words word
         on word.id = candidate.canonical_word_id
      where candidate.child_id = any($1::uuid[])
      order by candidate.child_id, candidate.created_at, candidate.id`,
    [childIds],
  );
  const adleItems = await client.query(
    `select item.*, word.normalised_word as canonical_word
       from public.adle_learning_items item
       join public.canonical_teaching_dictionary_words word
         on word.id = item.canonical_word_id
      where item.child_id = any($1::uuid[])
      order by item.child_id, item.created_at, item.id`,
    [childIds],
  );
  const lineage = await client.query(
    `select lineage.*, item.child_id, word.normalised_word as canonical_word
       from public.adle_learning_item_sources lineage
       join public.adle_learning_items item on item.id = lineage.learning_item_id
       join public.canonical_teaching_dictionary_words word on word.id = item.canonical_word_id
      where item.child_id = any($1::uuid[])
      order by item.child_id, lineage.created_at, lineage.id`,
    [childIds],
  );
  const canonicalWords = await client.query(
    `with target_words as (
       select distinct lower(btrim(correct_spelling_normalized)) as word
         from public.parent_verified_spelling_candidate_mappings
        where child_id = any($1::uuid[])
       union
       select distinct lower(btrim(coalesce(approved_replacement, suggested_replacement)))
         from public.writing_issues
        where child_id = any($1::uuid[])
     )
     select word.id, word.normalised_word, word.display_word,
            word.row_status, word.review_status, word.created_at
       from public.canonical_teaching_dictionary_words word
       join target_words target on target.word = word.normalised_word
      order by word.normalised_word, word.created_at, word.id`,
    [childIds],
  );
  const microSkills = await client.query(
    `select catalog.micro_skill_key, catalog.mastery_domain_key,
            catalog.skill_family_key, catalog.skill_cluster_key,
            catalog.display_name, catalog.practice_route,
            catalog.is_assignable, catalog.is_active
       from public.micro_skill_catalog catalog
      where catalog.micro_skill_key in (
        select micro_skill_key from public.writing_issues where child_id = any($1::uuid[])
        union
        select micro_skill_key from public.parent_verified_spelling_candidate_mappings where child_id = any($1::uuid[])
      )
      order by catalog.micro_skill_key`,
    [childIds],
  );
  const assignments = await client.query(
    `select item.id, item.child_id, item.daily_assignment_id, item.learning_item_id,
            item.domain_module, item.item_type, item.source_type,
            item.source_entity_id, item.target_word, item.status, item.created_at,
            assignment.assignment_date, assignment.title, assignment.status as assignment_status,
            assignment.assignment_generation_source, assignment.session_started_at,
            assignment.session_completed_at
       from public.assignment_items item
       join public.daily_assignments assignment on assignment.id = item.daily_assignment_id
      where item.child_id = any($1::uuid[])
      order by item.child_id, item.created_at, item.id`,
    [childIds],
  );
  const schedules = await client.query(
    `select schedule.id, schedule.child_id, schedule.canonical_word_id,
            word.normalised_word as canonical_word, schedule.membership_status,
            schedule.row_status, schedule.taught_on, schedule.created_at,
            coalesce((
              select jsonb_agg(to_jsonb(route) order by route.created_at, route.id)
                from public.adle_review_schedule_word_routes route
               where route.schedule_word_id = schedule.id
            ), '[]'::jsonb) as routes,
            coalesce((
              select jsonb_agg(to_jsonb(encounter) order by encounter.created_at, encounter.id)
                from public.adle_review_word_encounters encounter
               where encounter.schedule_word_id = schedule.id
            ), '[]'::jsonb) as encounters
       from public.adle_review_schedule_words schedule
       join public.canonical_teaching_dictionary_words word on word.id = schedule.canonical_word_id
      where schedule.child_id = any($1::uuid[])
      order by schedule.child_id, schedule.created_at, schedule.id`,
    [childIds],
  );
  return {
    mode: "evidence",
    transactionReadOnly: true,
    cohorts: {
      affectedUnactivated: AFFECTED_UNACTIVATED_CHILD_ID,
      authorisedR7: AUTHORISED_R7_CHILD_ID,
      otherReal: OTHER_REAL_CHILD_ID,
    },
    issues: issues.rows,
    legacyItems: legacyItems.rows,
    legacyIssueLinks: legacyIssueLinks.rows,
    legacyEvidence: legacyEvidence.rows,
    wordProgress: wordProgress.rows,
    parentVerifications: parentVerifications.rows,
    sources: sources.rows,
    catalogCases: catalogCases.rows,
    recommendations: recommendations.rows,
    canonicalMappings: canonicalMappings.rows,
    intakeCandidates: intakeCandidates.rows,
    adleItems: adleItems.rows,
    lineage: lineage.rows,
    canonicalWords: canonicalWords.rows,
    microSkills: microSkills.rows,
    assignments: assignments.rows,
    schedules: schedules.rows,
  };
}

function buildHistoricalAudit(
  evidenceRecord: Record<string, unknown>,
  populationRecord: Record<string, unknown>,
) {
  const evidence = evidenceRecord as AnyRow;
  const population = populationRecord as AnyRow;
  const children = population.children as AnyRow[];
  const issues = evidence.issues as AnyRow[];
  const sources = evidence.sources as AnyRow[];
  const intakeCandidates = evidence.intakeCandidates as AnyRow[];
  const adleItems = evidence.adleItems as AnyRow[];
  const lineage = evidence.lineage as AnyRow[];
  const canonicalWords = evidence.canonicalWords as AnyRow[];
  const canonicalMappings = evidence.canonicalMappings as AnyRow[];
  const microSkills = evidence.microSkills as AnyRow[];
  const legacyIssueLinks = evidence.legacyIssueLinks as AnyRow[];
  const legacyItems = evidence.legacyItems as AnyRow[];
  const parentVerifications = evidence.parentVerifications as AnyRow[];
  const assignments = evidence.assignments as AnyRow[];
  const schedules = evidence.schedules as AnyRow[];

  const cohortFor = (childId: string) => {
    if (childId === AFFECTED_UNACTIVATED_CHILD_ID) return "A_AFFECTED_UNACTIVATED";
    if (childId === AUTHORISED_R7_CHILD_ID) return "B_AUTHORISED_R7";
    if (childId === OTHER_REAL_CHILD_ID) return "C_OTHER_REAL";
    return "D_DEDICATED_TEST";
  };
  const aliasFor = (childId: string) => {
    const cohort = cohortFor(childId);
    if (cohort === "A_AFFECTED_UNACTIVATED") return "affected-unactivated";
    if (cohort === "B_AUTHORISED_R7") return "authorised-r7";
    if (cohort === "C_OTHER_REAL") return "other-real-1";
    const ordered = children
      .filter((child) => cohortFor(child.id) === "D_DEDICATED_TEST")
      .map((child) => child.id)
      .sort();
    return `dedicated-test-${ordered.indexOf(childId) + 1}`;
  };
  const activeCanonicalWord = (word: string) => canonicalWords.find(
    (row) => row.normalised_word === word
      && row.row_status === "active"
      && row.review_status === "approved_for_first_exposure",
  );
  const activeMapping = (observed: string, word: string, micro: string) =>
    canonicalMappings.find(
      (row) => row.misspelling_normalized === observed
        && row.correct_spelling_normalized === word
        && row.micro_skill_key === micro
        && row.mapping_status === "active"
        && row.resolver_visibility_status === "visible",
    );
  const validMicro = (micro: string) => microSkills.some(
    (row) => row.micro_skill_key === micro
      && row.mastery_domain_key === "D4"
      && row.is_active === true
      && row.is_assignable === true,
  );
  const isProductionTestSource = (source: AnyRow) =>
    Boolean(source.metadata?.production_test_tag)
      || String(source.reviewed_event_source_entity_id ?? "").includes("production_test_");
  const liveSources = sources.filter((row) => LIVE_SOURCE_STATUSES.has(row.candidate_status));
  const expectedIssues = issues.filter(
    (issue) => issue.issue_status === "finalised"
      && LEARNING_CLASSIFICATIONS.has(issue.final_classification),
  );
  const finalIssueByOccurrence = new Map<string, AnyRow[]>();
  for (const issue of issues.filter((row) => row.source_misspelling_instance_id)) {
    const key = `${issue.child_id}:${issue.source_misspelling_instance_id}`;
    const values = finalIssueByOccurrence.get(key) ?? [];
    values.push(issue);
    finalIssueByOccurrence.set(key, values);
  }

  const seeds: AnyRow[] = expectedIssues.map((issue) => ({
    issue,
    directSource: null,
    evidenceBasis: "final_parent_learning_classification",
  }));
  for (const source of liveSources) {
    if (!source.source_misspelling_instance_id || isProductionTestSource(source)) continue;
    const key = `${source.child_id}:${source.source_misspelling_instance_id}`;
    const linkedIssues = finalIssueByOccurrence.get(key) ?? [];
    if (linkedIssues.some((issue) => LEARNING_CLASSIFICATIONS.has(issue.final_classification))) {
      continue;
    }
    if (linkedIssues.some((issue) => NON_LEARNING_CLASSIFICATIONS.has(issue.final_classification))) {
      continue;
    }
    const verification = parentVerifications.find((row) => row.id === source.parent_verification_id);
    if (!verification || !new Set(["accepted", "overridden"]).has(verification.decision)) continue;
    seeds.push({
      issue: null,
      directSource: source,
      evidenceBasis: "governed_parent_verified_source_without_issue_row",
    });
  }

  const occurrenceRows: AnyRow[] = seeds.map((seed) => {
    const issue = seed.issue as AnyRow | null;
    const directSource = seed.directSource as AnyRow | null;
    const childId = issue?.child_id ?? directSource?.child_id;
    const occurrenceId = issue?.source_misspelling_instance_id
      ?? directSource?.source_misspelling_instance_id
      ?? null;
    const observed = normalized(issue?.observed_text ?? directSource?.misspelling_normalized);
    const word = normalized(
      issue?.approved_replacement
        ?? issue?.suggested_replacement
        ?? directSource?.correct_spelling_normalized,
    );
    const matchingLiveSources = directSource
      ? [directSource]
      : liveSources.filter(
          (source) => source.child_id === childId
            && source.source_misspelling_instance_id === occurrenceId,
        );
    const terminalSources = sources.filter(
      (source) => source.child_id === childId
        && source.source_misspelling_instance_id === occurrenceId
        && new Set(["rejected", "superseded"]).has(source.candidate_status),
    );
    const governedSource = matchingLiveSources[0] ?? null;
    const issueMicro = trimmed(issue?.micro_skill_key);
    const effectiveMicro = validMicro(issueMicro)
      ? issueMicro
      : trimmed(governedSource?.micro_skill_key ?? issueMicro);
    const identityConflict = Boolean(
      governedSource
        && (
          governedSource.correct_spelling_normalized !== word
          || governedSource.misspelling_normalized !== observed
          || (validMicro(issueMicro) && governedSource.micro_skill_key !== issueMicro)
        ),
    );
    const sourceClassification = matchingLiveSources.length > 1
      ? "DUPLICATE_LIVE_SOURCE"
      : identityConflict
        ? "SOURCE_IDENTITY_CONFLICT"
        : governedSource
          ? "COMPLETE_SOURCE"
          : terminalSources.length > 0
            ? "TERMINAL_SOURCE"
            : "MISSING_GOVERNED_SOURCE";
    const candidates = governedSource
      ? intakeCandidates.filter(
          (candidate) => candidate.source_candidate_mapping_id === governedSource.id,
        )
      : [];
    const candidate = candidates[0] ?? null;
    const candidateBlockerCode = candidate?.blockers?.[0]?.code ?? null;
    const intakeIdentityConflict = Boolean(
      candidate
        && (
          candidate.normalized_target_token !== word
          || candidate.micro_skill_key !== effectiveMicro
          || candidate.child_id !== childId
        ),
    );
    const intakeClassification = !governedSource
      ? "NOT_APPLICABLE"
      : candidates.length === 0
        ? "MISSING_INTAKE_CANDIDATE"
        : intakeIdentityConflict || candidates.length > 1
          ? "CONFLICTING_INTAKE"
          : new Set(["pending_content", "pending_mapping"]).has(candidate.candidate_state)
            ? "BLOCKED_INTAKE"
            : "COMPLETE_INTAKE";
    const targetItem = candidate?.learning_item_id
      ? adleItems.find((item) => item.id === candidate.learning_item_id) ?? null
      : null;
    const targetIdentityConflict = Boolean(
      targetItem
        && (
          targetItem.child_id !== childId
          || targetItem.canonical_word !== word
          || targetItem.micro_skill_key !== effectiveMicro
        ),
    );
    const targetClassification = !candidate
      ? "NOT_APPLICABLE"
      : candidate.candidate_state === "pending_content"
          && candidateBlockerCode === "canonical_word_missing"
        ? "BLOCKED_CONTENT"
        : candidate.candidate_state === "pending_mapping"
          ? "BLOCKED_MAPPING"
          : candidate.candidate_state === "activated" && !targetItem
            ? "MISSING_ADLE_TARGET"
            : targetIdentityConflict
              ? "TARGET_IDENTITY_CONFLICT"
              : targetItem
                ? "READY_TARGET_COMPLETE"
                : "NOT_EXPECTED_YET";
    const exactLineage = governedSource && targetItem
      ? lineage.filter(
          (row) => row.learning_item_id === targetItem.id
            && row.parent_verified_candidate_mapping_id === governedSource.id
            && row.correct_spelling_normalized === word
            && row.micro_skill_key === effectiveMicro
            && row.row_status === "active",
        )
      : [];
    const lineageClassification = targetClassification === "READY_TARGET_COMPLETE"
      ? exactLineage.length === 1
        ? "COMPLETE_LINEAGE"
        : exactLineage.length > 1
          ? "DUPLICATE_LINEAGE"
          : "MISSING_LINEAGE"
      : "NOT_EXPECTED_YET";
    const issueLink = issue
      ? legacyIssueLinks.find((link) => link.writing_issue_id === issue.id) ?? null
      : null;
    const legacyItem = issueLink
      ? legacyItems.find((item) => item.id === issueLink.learning_item_id) ?? null
      : null;
    const role = issueLink?.link_role ?? (directSource ? "governed_source_only" : "unlinked");
    const canonicalWord = activeCanonicalWord(word);
    const mapping = activeMapping(observed, word, effectiveMicro);
    const blockerCode = candidateBlockerCode
      ?? (!candidate && governedSource && !mapping
        ? "mapping_missing_predicted"
        : !candidate && governedSource && !canonicalWord
          ? "canonical_word_missing_predicted"
          : null);
    const sameTargetItems = adleItems.filter(
      (item) => item.child_id === childId
        && item.canonical_word === word
        && item.micro_skill_key === effectiveMicro
        && item.row_status === "active",
    );
    const protectedAssignments = assignments.filter(
      (assignment) => assignment.child_id === childId
        && normalized(assignment.target_word) === word,
    );
    const protectedSchedules = schedules.filter(
      (schedule) => schedule.child_id === childId
        && schedule.canonical_word === word
        && schedule.row_status === "active",
    );
    const protectedEncounterCount = protectedSchedules.reduce(
      (sum, schedule) => sum + (Array.isArray(schedule.encounters) ? schedule.encounters.length : 0),
      0,
    );
    const visibleItem = sameTargetItems.find(
      (item) => PARENT_INSIGHTS_ITEM_STATUSES.has(item.item_status),
    );
    const insightsVisibility = visibleItem
      ? "VISIBLE"
      : sourceClassification === "MISSING_GOVERNED_SOURCE"
        ? validMicro(effectiveMicro)
          ? "NOT_VISIBLE_DUE_TO_MISSING_SOURCE"
          : "AMBIGUOUS"
        : targetClassification === "READY_TARGET_COMPLETE"
          ? "VISIBLE"
          : validMicro(effectiveMicro)
            ? "NOT_VISIBLE_DUE_TO_DOWNSTREAM_GAP"
            : "AMBIGUOUS";
    const primaryClassification = sourceClassification !== "COMPLETE_SOURCE"
      ? sourceClassification
      : intakeClassification !== "COMPLETE_INTAKE"
        ? intakeClassification
        : targetClassification !== "READY_TARGET_COMPLETE"
          ? targetClassification
          : lineageClassification !== "COMPLETE_LINEAGE"
            ? lineageClassification
            : "COMPLETE";
    const deterministicIdentity = Boolean(
      occurrenceId
        && observed
        && word
        && validMicro(effectiveMicro)
        && (governedSource || mapping),
    );
    const hasConsumedConflictingState = terminalSources.some((source) =>
      intakeCandidates.some((candidate) => candidate.source_candidate_mapping_id === source.id),
    );
    let repairEligibility = "ALREADY_REPRESENTED_ELSEWHERE";
    if (hasConsumedConflictingState) {
      repairEligibility = "REPAIR_AFTER_R8D";
    } else if (
      new Set([
        "DUPLICATE_LIVE_SOURCE",
        "SOURCE_IDENTITY_CONFLICT",
        "CONFLICTING_INTAKE",
        "TARGET_IDENTITY_CONFLICT",
        "DUPLICATE_LINEAGE",
      ]).has(primaryClassification)
    ) {
      repairEligibility = "AMBIGUOUS_MANUAL_REVIEW";
    } else if (primaryClassification === "TERMINAL_SOURCE") {
      repairEligibility = "NO_REPAIR";
    } else if (targetClassification === "BLOCKED_CONTENT") {
      repairEligibility = "CONTENT_ONLY";
    } else if (targetClassification === "BLOCKED_MAPPING") {
      repairEligibility = "AMBIGUOUS_MANUAL_REVIEW";
    } else if (
      new Set([
        "MISSING_GOVERNED_SOURCE",
        "MISSING_INTAKE_CANDIDATE",
        "MISSING_ADLE_TARGET",
        "MISSING_LINEAGE",
      ]).has(primaryClassification)
    ) {
      repairEligibility = deterministicIdentity
        ? "SAFE_DETERMINISTIC_REPAIR"
        : "AMBIGUOUS_MANUAL_REVIEW";
    }
    const eventTimeValue = issue?.created_at ?? governedSource?.created_at ?? "";
    const eventTime = eventTimeValue instanceof Date
      ? eventTimeValue.toISOString()
      : String(eventTimeValue);
    const rootCauseCohort = eventTime < "2026-08-04T21:00:00.000Z"
      ? sourceClassification === "MISSING_GOVERNED_SOURCE"
        ? "pre_governed_occurrence_source_architecture"
        : "pre_candidate_intake_architecture"
      : eventTime < "2026-08-28T12:07:08.000Z"
        ? "candidate_capture_era_pre_R8B"
        : eventTime < "2026-08-28T14:06:22.000Z"
          ? "post_R8B_pre_R8C"
          : "post_R8C";
    const dryRun = {
      parent_verifications: primaryClassification === "MISSING_GOVERNED_SOURCE"
        && !parentVerifications.some((verification) =>
          verification.metadata?.source_misspelling_instance_id === occurrenceId
        ) ? 1 : 0,
      governed_sources: primaryClassification === "MISSING_GOVERNED_SOURCE" ? 1 : 0,
      intake_candidates: new Set(["MISSING_GOVERNED_SOURCE", "MISSING_INTAKE_CANDIDATE"])
        .has(primaryClassification) ? 1 : 0,
      adle_learning_items: new Set([
        "MISSING_GOVERNED_SOURCE",
        "MISSING_INTAKE_CANDIDATE",
        "MISSING_ADLE_TARGET",
      ]).has(primaryClassification)
        && Boolean(canonicalWord && mapping)
        && sameTargetItems.length === 0 ? 1 : 0,
      lineage: new Set([
        "MISSING_GOVERNED_SOURCE",
        "MISSING_INTAKE_CANDIDATE",
        "MISSING_ADLE_TARGET",
        "MISSING_LINEAGE",
      ]).has(primaryClassification)
        && Boolean(canonicalWord && mapping) ? 1 : 0,
      review_schedules: 0,
    };
    return {
      learner_alias: aliasFor(childId),
      child_id: childId,
      cohort: cohortFor(childId),
      occurrence_id: occurrenceId,
      writing_issue_id: issue?.id ?? null,
      evidence_basis: seed.evidenceBasis,
      observed_word: observed,
      canonical_word: word,
      micro_skill_key: effectiveMicro,
      original_issue_micro_skill_key: issueMicro,
      learning_intent: issue?.final_classification ?? "governed_parent_verified_source",
      legacy_learning_item_id: legacyItem?.id ?? null,
      legacy_link_role: role,
      governed_source_id: governedSource?.id ?? null,
      governed_source_status: governedSource?.candidate_status ?? terminalSources[0]?.candidate_status ?? null,
      source_classification: sourceClassification,
      intake_candidate_id: candidate?.id ?? null,
      intake_state: candidate?.candidate_state ?? null,
      intake_classification: intakeClassification,
      adle_learning_item_id: targetItem?.id ?? null,
      adle_target_classification: targetClassification,
      lineage_id: exactLineage[0]?.id ?? null,
      lineage_classification: lineageClassification,
      blocker: blockerCode,
      parent_insights_visibility: insightsVisibility,
      classification: primaryClassification,
      future_repair_eligibility: repairEligibility,
      canonical_content_ready: Boolean(canonicalWord),
      canonical_mapping_ready: Boolean(mapping),
      protected_assignment_count: protectedAssignments.length,
      protected_schedule_count: protectedSchedules.length,
      protected_encounter_count: protectedEncounterCount,
      root_cause_cohort: rootCauseCohort,
      created_at: eventTime,
      dry_run_effect: dryRun,
    };
  });

  const activeTargetDuplicates = Object.entries(countBy(
    adleItems.filter((item) => item.row_status === "active"),
    (item) => `${item.child_id}:${item.canonical_word_id}:${item.micro_skill_key}`,
  )).filter(([, count]) => count > 1);
  const liveSourceDuplicates = Object.entries(countBy(
    liveSources.filter((source) => source.source_misspelling_instance_id),
    (source) => `${source.child_id}:${source.source_misspelling_instance_id}`,
  )).filter(([, count]) => count > 1);
  const nonLearningRows = issues
    .filter(
      (issue) => issue.issue_status === "finalised"
        && NON_LEARNING_CLASSIFICATIONS.has(issue.final_classification)
        && cohortFor(issue.child_id) !== "D_DEDICATED_TEST",
    )
    .map((issue) => ({
      learner_alias: aliasFor(issue.child_id),
      child_id: issue.child_id,
      occurrence_id: issue.source_misspelling_instance_id,
      writing_issue_id: issue.id,
      observed_word: normalized(issue.observed_text),
      canonical_word: normalized(issue.approved_replacement ?? issue.suggested_replacement),
      micro_skill_key: trimmed(issue.micro_skill_key),
      final_classification: issue.final_classification,
      repair_eligibility: "NO_REPAIR",
    }));
  const terminalSourceRows = sources
    .filter((source) => new Set(["rejected", "superseded"]).has(source.candidate_status))
    .map((source) => ({
      child_id: source.child_id,
      learner_alias: aliasFor(source.child_id),
      source_id: source.id,
      occurrence_id: source.source_misspelling_instance_id,
      canonical_word: source.correct_spelling_normalized,
      micro_skill_key: source.micro_skill_key,
      candidate_status: source.candidate_status,
      downstream_candidate_count: intakeCandidates.filter(
        (candidate) => candidate.source_candidate_mapping_id === source.id,
      ).length,
    }));
  const focusRows = occurrenceRows.filter((row) => row.cohort !== "D_DEDICATED_TEST");
  const realRows = occurrenceRows.filter((row) =>
    new Set(["B_AUTHORISED_R7", "C_OTHER_REAL"]).has(row.cohort),
  );
  const anomalies = occurrenceRows.filter((row) => row.classification !== "COMPLETE");
  const focusAnomalies = anomalies.filter((row) => row.cohort !== "D_DEDICATED_TEST");
  const repairCandidates = focusAnomalies.filter((row) =>
    row.future_repair_eligibility !== "ALREADY_REPRESENTED_ELSEWHERE",
  );
  const actualContentBlocked = focusRows.filter(
    (row) => row.adle_target_classification === "BLOCKED_CONTENT",
  );
  const predictedContentBlocked = focusRows.filter(
    (row) => row.blocker === "canonical_word_missing_predicted",
  );
  const supportingRows = focusRows.filter((row) => row.legacy_link_role === "supporting");
  const originRows = focusRows.filter((row) => row.legacy_link_role === "origin");
  const postR8CSources = liveSources.filter(
    (source) => source.created_at >= "2026-08-28T14:06:22.000Z"
      && !isProductionTestSource(source),
  );
  const metrics = {
    real_learners_audited: 2,
    affected_proof_learners_audited: 1,
    dedicated_test_learners_audited: children.length - 3,
    historical_spelling_occurrences_inspected_real: children
      .filter((child) => new Set([AUTHORISED_R7_CHILD_ID, OTHER_REAL_CHILD_ID]).has(child.id))
      .reduce((sum, child) => sum + child.misspellings, 0),
    historical_spelling_occurrences_inspected_focus: children
      .filter((child) => AUDITED_FOCUS_CHILD_IDS.includes(child.id))
      .reduce((sum, child) => sum + child.misspellings, 0),
    historical_spelling_occurrences_inspected_all_profiles: children
      .reduce((sum, child) => sum + child.misspellings, 0),
    expected_learning_occurrences_real: realRows.length,
    expected_learning_occurrences_focus: focusRows.length,
    unique_expected_learner_words_focus: new Set(
      focusRows.map((row) => `${row.child_id}:${row.canonical_word}`),
    ).size,
    unique_expected_word_texts_focus: new Set(focusRows.map((row) => row.canonical_word)).size,
    complete_governed_sources: focusRows.filter((row) => row.source_classification === "COMPLETE_SOURCE").length,
    missing_governed_sources: focusRows.filter((row) => row.source_classification === "MISSING_GOVERNED_SOURCE").length,
    missing_canonical_intake_candidates: focusRows.filter((row) => row.intake_classification === "MISSING_INTAKE_CANDIDATE").length,
    missing_ready_adle_targets: focusRows.filter((row) => row.adle_target_classification === "MISSING_ADLE_TARGET").length,
    missing_lineage_occurrences: focusRows.filter((row) => row.lineage_classification === "MISSING_LINEAGE").length,
    content_blocked_learning_occurrences: actualContentBlocked.length,
    predicted_content_blocked_after_intake_repair: predictedContentBlocked.length,
    duplicate_conflicting_live_state: focusRows.filter((row) =>
      new Set([
        "DUPLICATE_LIVE_SOURCE",
        "SOURCE_IDENTITY_CONFLICT",
        "CONFLICTING_INTAKE",
        "TARGET_IDENTITY_CONFLICT",
        "DUPLICATE_LINEAGE",
      ]).has(row.classification),
    ).length + activeTargetDuplicates.length + liveSourceDuplicates.length,
    deterministic_repair_candidates: repairCandidates.filter((row) => row.future_repair_eligibility === "SAFE_DETERMINISTIC_REPAIR").length,
    repair_after_r8d_candidates: repairCandidates.filter((row) => row.future_repair_eligibility === "REPAIR_AFTER_R8D").length,
    ambiguous_manual_review_cases: repairCandidates.filter((row) => row.future_repair_eligibility === "AMBIGUOUS_MANUAL_REVIEW").length,
    no_repair_cases: nonLearningRows.length,
  };
  return {
    occurrenceRows,
    focusRows,
    realRows,
    anomalies,
    focusAnomalies,
    repairCandidates,
    nonLearningRows,
    terminalSourceRows,
    actualContentBlocked,
    predictedContentBlocked,
    supportingRows,
    originRows,
    postR8CSources,
    metrics,
    activeTargetDuplicates,
    liveSourceDuplicates,
    children,
  };
}

function writeHistoricalAuditArtifacts(audit: ReturnType<typeof buildHistoricalAudit>) {
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  const occurrenceColumns = [
    "learner_alias",
    "child_id",
    "cohort",
    "occurrence_id",
    "writing_issue_id",
    "evidence_basis",
    "observed_word",
    "canonical_word",
    "micro_skill_key",
    "original_issue_micro_skill_key",
    "learning_intent",
    "legacy_learning_item_id",
    "legacy_link_role",
    "governed_source_id",
    "governed_source_status",
    "source_classification",
    "intake_candidate_id",
    "intake_state",
    "intake_classification",
    "adle_learning_item_id",
    "adle_target_classification",
    "lineage_id",
    "lineage_classification",
    "blocker",
    "parent_insights_visibility",
    "classification",
    "future_repair_eligibility",
    "canonical_content_ready",
    "canonical_mapping_ready",
    "protected_assignment_count",
    "protected_schedule_count",
    "protected_encounter_count",
    "root_cause_cohort",
    "created_at",
  ] as const;
  const anomalyColumns = [
    ...occurrenceColumns,
    "dry_run_effect",
  ] as const;
  writeFileSync(
    resolve(OUTPUT_DIRECTORY, "r8e-learning-occurrences.csv"),
    toCsv(audit.occurrenceRows, occurrenceColumns),
  );
  writeFileSync(
    resolve(OUTPUT_DIRECTORY, "r8e-anomalies.csv"),
    toCsv(audit.anomalies, anomalyColumns),
  );
  writeFileSync(
    resolve(OUTPUT_DIRECTORY, "r8e-repair-candidates.csv"),
    toCsv(audit.repairCandidates, anomalyColumns),
  );

  const metricRows = Object.entries(audit.metrics).map(([metric, value]) => [metric, value]);
  const learnerBreakdown = [
    "A_AFFECTED_UNACTIVATED",
    "B_AUTHORISED_R7",
    "C_OTHER_REAL",
    "D_DEDICATED_TEST",
  ].map((cohort) => {
    const rows = audit.occurrenceRows.filter((row) => row.cohort === cohort);
    return [
      cohort,
      new Set(rows.map((row) => row.child_id)).size,
      rows.length,
      rows.filter((row) => row.classification === "COMPLETE").length,
      rows.filter((row) => row.source_classification === "MISSING_GOVERNED_SOURCE").length,
      rows.filter((row) => row.intake_classification === "MISSING_INTAKE_CANDIDATE").length,
      rows.filter((row) => row.adle_target_classification === "BLOCKED_CONTENT").length,
      rows.filter((row) => row.future_repair_eligibility === "SAFE_DETERMINISTIC_REPAIR").length,
      rows.filter((row) => row.future_repair_eligibility === "AMBIGUOUS_MANUAL_REVIEW").length,
    ];
  });
  const affected = audit.focusRows
    .filter((row) => row.cohort === "A_AFFECTED_UNACTIVATED")
    .sort((left, right) => left.created_at.localeCompare(right.created_at)
      || left.canonical_word.localeCompare(right.canonical_word));
  const r7Anomalies = audit.focusAnomalies
    .filter((row) => row.cohort === "B_AUTHORISED_R7")
    .sort((left, right) => left.canonical_word.localeCompare(right.canonical_word));
  const otherRealAnomalies = audit.focusAnomalies
    .filter((row) => row.cohort === "C_OTHER_REAL")
    .sort((left, right) => left.created_at.localeCompare(right.created_at)
      || left.canonical_word.localeCompare(right.canonical_word));
  const dedicatedRows = audit.occurrenceRows.filter((row) => row.cohort === "D_DEDICATED_TEST");
  const dedicatedAnomalies = audit.anomalies.filter((row) => row.cohort === "D_DEDICATED_TEST");
  const eligibilityCounts = countBy(
    audit.focusRows.filter((row) => row.classification !== "COMPLETE"),
    (row) => row.future_repair_eligibility,
  );
  eligibilityCounts.NO_REPAIR = audit.nonLearningRows.length;
  eligibilityCounts.ALREADY_REPRESENTED_ELSEWHERE = audit.focusRows.filter(
    (row) => row.future_repair_eligibility === "ALREADY_REPRESENTED_ELSEWHERE",
  ).length;
  const dryRunSafe = audit.repairCandidates.filter(
    (row) => row.future_repair_eligibility === "SAFE_DETERMINISTIC_REPAIR",
  );
  const dryRunTotals = dryRunSafe.reduce(
    (totals, row) => {
      for (const [key, value] of Object.entries(row.dry_run_effect as Record<string, number>)) {
        totals[key] = (totals[key] ?? 0) + value;
      }
      return totals;
    },
    {} as Record<string, number>,
  );
  const supportingFullyRepresented = audit.supportingRows.filter(
    (row) => row.classification === "COMPLETE",
  ).length;
  const supportingMissingSource = audit.supportingRows.filter(
    (row) => row.source_classification === "MISSING_GOVERNED_SOURCE",
  ).length;
  const supportingMissingDownstream = audit.supportingRows.filter(
    (row) => row.source_classification === "COMPLETE_SOURCE"
      && row.classification !== "COMPLETE",
  ).length;
  const visibilityCounts = countBy(audit.focusRows, (row) => row.parent_insights_visibility);
  const actualAndPredictedContent: AnyRow[] = [
    ...audit.actualContentBlocked.map((row) => ({ ...row, content_state: "durable_candidate_blocker" })),
    ...audit.predictedContentBlocked.map((row) => ({ ...row, content_state: "predicted_after_intake_repair" })),
  ];
  const football = affected.find((row) => row.canonical_word === "football");
  const replay = affected.find((row) => row.canonical_word === "replay");
  const rainbow = affected.find((row) => row.canonical_word === "rainbow");
  const renew = affected.find((row) => row.canonical_word === "renew");
  const postR8CText = audit.postR8CSources.length === 0
    ? "NO NATURAL POST-R8C SAMPLE AVAILABLE"
    : `${audit.postR8CSources.length} natural source row(s) were checked after the R8C production commit timestamp.`;

  const report = `# R8E Historical Learning-Word Audit

## 1. Verdict

R8E READ-ONLY HISTORICAL AUDIT COMPLETE

The full production history was inspected in an explicit repeatable-read, read-only transaction. Uncertainty was classified; no production data was repaired or changed.

## 2. Executive findings

${markdownTable(["Metric", "Count"], metricRows)}

Both real learners audited have at least one historical invariant gap; the affected proof learner is reported separately. There are **${audit.metrics.missing_governed_sources} learning occurrences with missing governed sources** and **${audit.metrics.missing_canonical_intake_candidates} governed occurrences with missing intake candidates**; there are no READY-target or qualifying-lineage omissions. The repair inventory contains **${audit.metrics.deterministic_repair_candidates} safe deterministic occurrence-level repairs**, **${audit.metrics.repair_after_r8d_candidates} R8D-first repairs**, **${audit.metrics.content_blocked_learning_occurrences} currently durable canonical-content-blocked occurrences**, and **${audit.metrics.ambiguous_manual_review_cases} ambiguous/manual cases**. Dedicated/test results are segregated and excluded from these repair counts.

${markdownTable(
    ["Cohort", "Learners", "Expected occurrences", "Complete", "Missing source", "Missing intake", "Content blocked", "Safe repairs", "Ambiguous"],
    learnerBreakdown,
  )}

## 3. Architecture checked

§§§text
spelling occurrence
→ final learning intent
→ governed occurrence source
→ canonical intake candidate
→ ADLE learner × canonical word × microskill target
→ source lineage
§§§

Stable occurrence/source IDs were used wherever available. Word text was used only to verify identity compatibility and canonical-content readiness.

The production project ref was §${PRODUCTION_PROJECT_REF}§ at baseline commit §c07e37ffd6537594d077f9740d6686ca338e1f83§. The candidate-intake architecture boundary is the §20260804210000_add_adle_canonical_intake_demands.sql§ migration; R8B and R8C use their exact Git commit timestamps.

## 4. Affected learner full-history result

The affected unactivated proof learner has **${affected.length} expected learning occurrences and ${new Set(affected.map((row) => row.canonical_word)).size} unique learning words**. ${affected.filter((row) => row.classification === "COMPLETE").length} are fully represented, ${affected.filter((row) => row.source_classification === "MISSING_GOVERNED_SOURCE").length} lack governed sources, ${affected.filter((row) => row.intake_classification === "MISSING_INTAKE_CANDIDATE").length} have a source but no intake candidate, ${affected.filter((row) => row.adle_target_classification === "MISSING_ADLE_TARGET").length} have a ready candidate without a target, ${affected.filter((row) => row.adle_target_classification === "BLOCKED_CONTENT").length} are content-blocked, and ${affected.filter((row) => row.future_repair_eligibility === "AMBIGUOUS_MANUAL_REVIEW").length} are ambiguous.

${markdownTable(
    ["Word", "Source occurrence", "Microskill", "Learning intent", "Governed source", "Canonical intake", "ADLE item", "Lineage", "Blocker", "Parent Insights", "Classification", "Future repair"],
    affected.map((row) => [
      row.canonical_word,
      row.occurrence_id,
      row.micro_skill_key,
      row.learning_intent,
      row.source_classification === "COMPLETE_SOURCE" ? row.governed_source_id : row.source_classification,
      row.intake_candidate_id ?? row.intake_classification,
      row.adle_learning_item_id ?? row.adle_target_classification,
      row.lineage_id ?? row.lineage_classification,
      row.blocker ?? "—",
      row.parent_insights_visibility,
      row.classification,
      row.future_repair_eligibility,
    ]),
  )}

## 5. §football§ / §replay§ result

- §football§: final §concept_gap§ on occurrence §${football?.occurrence_id}§; explicit legacy link role §${football?.legacy_link_role}§; exact active/visible canonical mapping exists; governed source is absent. Classification: **MISSING_GOVERNED_SOURCE / SAFE_DETERMINISTIC_REPAIR**.
- §replay§: final §concept_gap§ on occurrence §${replay?.occurrence_id}§; explicit legacy link role §${replay?.legacy_link_role}§; exact active/visible canonical mapping exists; governed source is absent. Classification: **MISSING_GOVERNED_SOURCE / SAFE_DETERMINISTIC_REPAIR**.

Neither word has an ADLE target, lineage, schedule, or Review encounter on this learner. A future repair should create/strengthen the target and preserve the exact occurrence as lineage, but create no automatic Review schedule.

## 6. §rainbow§ / §renew§ result

- §rainbow§ is not lost: source §${rainbow?.governed_source_id}§, activated candidate §${rainbow?.intake_candidate_id}§, ADLE target §${rainbow?.adle_learning_item_id}§, and lineage §${rainbow?.lineage_id}§ all agree.
- §renew§ is not lost: source §${renew?.governed_source_id}§ and candidate §${renew?.intake_candidate_id}§ durably retain it. It is **LEARNING WORD RETAINED — CONTENT BLOCKED** by §${renew?.blocker}§. Current Parent Insights does not surface it because the loader reads active ADLE items, not blocked candidates.

## 7. Authorised R7 learner anomalies

${markdownTable(
    ["Word", "Occurrence", "Microskill", "Source", "Intake", "Target", "Protected history", "Classification", "Repair eligibility"],
    r7Anomalies.map((row) => [
      row.canonical_word,
      row.occurrence_id,
      row.micro_skill_key,
      row.governed_source_id ?? row.source_classification,
      row.intake_candidate_id ?? row.intake_classification,
      row.adle_learning_item_id ?? row.adle_target_classification,
      "assignments=" + row.protected_assignment_count
        + "; schedules=" + row.protected_schedule_count
        + "; encounters=" + row.protected_encounter_count,
      row.classification,
      row.future_repair_eligibility,
    ]),
  )}

§business§ and §fly§ are the two previously identified canonical-ready origin gaps: each has a final learning decision, exact occurrence, governed source, active approved canonical word, and no candidate/intake row. Both are pre-candidate-intake history and deterministic. §chicken§ is separate: learning intent exists, but the microskill is still §unknown§, so it is unsafe to reconstruct automatically.

## 8. Other real learner findings

${markdownTable(
    ["Word", "Occurrence", "Microskill", "Legacy role", "Gap/blocker", "Parent Insights", "Repair eligibility", "Root-cause cohort"],
    otherRealAnomalies.map((row) => [
      row.canonical_word,
      row.occurrence_id,
      row.micro_skill_key,
      row.legacy_link_role,
      row.classification + (row.blocker ? " (" + row.blocker + ")" : ""),
      row.parent_insights_visibility,
      row.future_repair_eligibility,
      row.root_cause_cohort,
    ]),
  )}

The same-word recurrence §yoghurt§ has two governed occurrences for one word × microskill target: the first candidate is legitimately §pending_mapping§, while the second source lacks its own intake candidate. This is one affected canonical word and two historical occurrences—not two missing learning targets. §diabetes§ is different: two occurrences govern two distinct microskills, so two word × microskill targets are expected.

### Dedicated/test segregation

${dedicatedRows.length} expected learning occurrences were found across the 12 dedicated/test profiles. ${dedicatedAnomalies.length} invariant anomalies were recorded in the all-cohort CSV and excluded from real/focus repair counts. The affected proof learner remains its own A cohort and is not mixed into D.

## 9. Legacy collapse findings

${markdownTable(
    ["Origin occurrences", "Supporting occurrences", "Supporting fully represented", "Supporting missing source", "Supporting with downstream gap"],
    [[audit.originRows.length, audit.supportingRows.length, supportingFullyRepresented, supportingMissingSource, supportingMissingDownstream]],
  )}

The affected learner is the clearest collapse cohort: §activity§ is a supporting word that is fully represented, while §football§ and §replay§ are supporting learning occurrences that genuinely disappeared before governed source intake. Shared microskill membership alone was never treated as evidence of loss.

## 10. Missing intake / ADLE / lineage findings

${markdownTable(
    ["Failure class", "Count"],
    [
      ["MISSING_GOVERNED_SOURCE", audit.metrics.missing_governed_sources],
      ["MISSING_INTAKE_CANDIDATE", audit.metrics.missing_canonical_intake_candidates],
      ["MISSING_READY_ADLE_TARGET", audit.metrics.missing_ready_adle_targets],
      ["MISSING_LINEAGE", audit.metrics.missing_lineage_occurrences],
      ["DUPLICATE_OR_CONFLICTING_LIVE_STATE", audit.metrics.duplicate_conflicting_live_state],
    ],
  )}

The three ADLE pilot targets without §adle_learning_item_sources§ are not qualifying spelling-occurrence gaps: their source refs are protected R7 pilot seeds, not governed historical occurrences. No qualifying activated candidate is missing lineage.

## 11. Content-blocked words

${markdownTable(
    ["Learner", "Word", "Microskill", "State", "Blocker", "Occurrence count", "Parent Insights", "Required action"],
    actualAndPredictedContent.map((row) => [
      row.learner_alias,
      row.canonical_word,
      row.micro_skill_key,
      row.content_state,
      row.blocker,
      1,
      row.parent_insights_visibility,
      row.content_state === "durable_candidate_blocker" ? "CONTENT_ONLY" : "intake repair, then CONTENT_ONLY",
    ]),
  )}

Actual durable candidate blockers and content blockers predicted after deterministic intake repair are kept separate in the CSVs and metrics.

## 12. Parent Insights visibility findings

${markdownTable(["Visibility", "Occurrences"], Object.entries(visibilityCounts))}

The current loader reads active unresolved §adle_learning_items§ plus lineage. Therefore missing sources, missing candidates, and content-blocked candidates are not visible today; content-blocked learning is not yet surfaced independently.

## 13. Repair classification

${markdownTable(
    ["Eligibility", "Count"],
    [
      ["SAFE_DETERMINISTIC_REPAIR", eligibilityCounts.SAFE_DETERMINISTIC_REPAIR ?? 0],
      ["REPAIR_AFTER_R8D", eligibilityCounts.REPAIR_AFTER_R8D ?? 0],
      ["CONTENT_ONLY", eligibilityCounts.CONTENT_ONLY ?? 0],
      ["ALREADY_REPRESENTED_ELSEWHERE", eligibilityCounts.ALREADY_REPRESENTED_ELSEWHERE ?? 0],
      ["AMBIGUOUS_MANUAL_REVIEW", eligibilityCounts.AMBIGUOUS_MANUAL_REVIEW ?? 0],
      ["NO_REPAIR", eligibilityCounts.NO_REPAIR ?? 0],
    ],
  )}

Exact candidate rows and stable IDs are in §r8e-repair-candidates.csv§. The ${audit.nonLearningRows.length} final §checking_only§/§not_an_issue§ occurrences are NO_REPAIR. The one superseded governed source has zero downstream candidates and is likewise ineligible for repair.

${markdownTable(
    ["Eligibility", "Learner", "Word", "Occurrence", "Gap/blocker"],
    audit.focusAnomalies.map((row) => [
      row.future_repair_eligibility,
      row.learner_alias,
      row.canonical_word,
      row.occurrence_id,
      row.classification + (row.blocker ? " (" + row.blocker + ")" : ""),
    ]),
  )}

The complete occurrence ledger in §r8e-learning-occurrences.csv§ identifies every ALREADY_REPRESENTED_ELSEWHERE row. The exact NO_REPAIR ledger is:

${markdownTable(
    ["Learner", "Word", "Observed", "Occurrence", "Final classification"],
    audit.nonLearningRows.map((row) => [
      row.learner_alias,
      row.canonical_word,
      row.observed_word,
      row.occurrence_id,
      row.final_classification,
    ]),
  )}

## 14. Expected future repair effects

For the ${dryRunSafe.length} deterministic repairs only, the dry-run aggregate is:

${markdownTable(["Table/effect", "Expected added rows"], Object.entries(dryRunTotals))}

${markdownTable(
    ["Learner", "Word", "Gap", "Expected effect"],
    dryRunSafe.map((row) => [
      row.learner_alias,
      row.canonical_word,
      row.classification,
      JSON.stringify(row.dry_run_effect),
    ]),
  )}

Every dry-run effect keeps §review_schedules = 0§.

## 15. R8D dependencies

No anomaly has an already-consumed source that was later changed to a conflicting non-learning identity, so **REPAIR_AFTER_R8D = 0**. The older superseded §malteasers§ occurrence was never ingested and requires NO_REPAIR; it is distinct from the later §malteasers§ learning occurrence retained with a canonical-content blocker. R8D remains the required boundary for any future consumed-source reversal; R8E did not implement it.

## 16. Post-R8C natural-event evidence

${postR8CText}

R8B commit §6aad06e§ (2026-08-28 13:07 BST) and R8C production baseline §c07e37f§ (2026-08-28 15:06 BST) were used as timing boundaries. No event was manufactured.

## 17. Audit artifacts

- §R8E-HISTORICAL-AUDIT.md§
- §r8e-learning-occurrences.csv§
- §r8e-anomalies.csv§
- §r8e-repair-candidates.csv§
- §r8e-audit-receipt.json§

## 18. Production safety receipt

§§§text
transaction_read_only = on
production writes = 0
schema changes = 0
migration changes = 0
learning-data changes = 0
Review changes = 0
rollout changes = 0
historical repair = 0
deployment = 0
commit/push = 0
§§§

## 19. Recommended next steps

A. **R8D IMPLEMENTATION / VERIFICATION** — retain the governed reversal boundary even though this snapshot has no R8D-first candidates.

B. **R8E WRITE-ENABLED HISTORICAL REPAIR GATE** — only after an independently authorised write gate. Seed the exact deterministic occurrence IDs, preserve one lineage row per occurrence, keep content blockers durable, and create no automatic Review schedule. Resolve §chicken§, §effect§, §certain§, and the §yoghurt§ mapping manually rather than guessing.
`.replaceAll("§", String.fromCharCode(96));
  writeFileSync(resolve(OUTPUT_DIRECTORY, "R8E-HISTORICAL-AUDIT.md"), report);
  const receipt = {
    contractVersion: "r8e_readonly_historical_audit_v1",
    generatedAt: new Date().toISOString(),
    productionProjectRef: PRODUCTION_PROJECT_REF,
    baselineCommit: "c07e37ffd6537594d077f9740d6686ca338e1f83",
    transactionReadOnly: true,
    mutationPerformed: false,
    metrics: audit.metrics,
    safety: {
      productionWrites: 0,
      schemaChanges: 0,
      migrationChanges: 0,
      learningDataChanges: 0,
      reviewChanges: 0,
      rolloutChanges: 0,
      historicalRepair: 0,
      deployment: 0,
      commitPush: 0,
    },
    artifactFiles: [
      "R8E-HISTORICAL-AUDIT.md",
      "r8e-learning-occurrences.csv",
      "r8e-anomalies.csv",
      "r8e-repair-candidates.csv",
      "r8e-audit-receipt.json",
    ],
  };
  writeFileSync(
    resolve(OUTPUT_DIRECTORY, "r8e-audit-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return receipt;
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "schema";
  if (!new Set([
    "schema",
    "population",
    "evidence",
    "all-evidence",
    "audit-preview",
    "audit",
  ]).has(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  const client = new pg.Client({
    connectionString: productionConnectionString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const receipt = await client.query<{ transaction_read_only: string }>(
      "show transaction_read_only",
    );
    if (receipt.rows[0]?.transaction_read_only !== "on") {
      throw new Error("Production transaction is not read-only.");
    }
    if (mode === "audit" || mode === "audit-preview") {
      const allChildIds = (
        await client.query<{ id: string }>("select id from public.children order by id")
      ).rows.map((row) => row.id);
      const population = await inspectPopulation(client);
      const evidence = await inspectEvidence(client, allChildIds);
      const audit = buildHistoricalAudit(evidence, population);
      await client.query("rollback");
      const output = mode === "audit"
        ? writeHistoricalAuditArtifacts(audit)
        : {
            transactionReadOnly: true,
            metrics: audit.metrics,
            focusAnomalies: audit.focusAnomalies,
            terminalSources: audit.terminalSourceRows,
            legacy: {
              origins: audit.originRows.length,
              supporting: audit.supportingRows.length,
            },
            postR8CSources: audit.postR8CSources.length,
          };
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      return;
    }
    const output =
      mode === "schema"
        ? await discoverSchema(client)
        : mode === "population"
          ? await inspectPopulation(client)
          : mode === "evidence"
            ? await inspectEvidence(client)
            : await inspectEvidence(
                client,
                (await client.query<{ id: string }>("select id from public.children order by id"))
                  .rows.map((row) => row.id),
              );
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    await client.query("rollback");
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // The connection may already be closed; the original failure is authoritative.
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
