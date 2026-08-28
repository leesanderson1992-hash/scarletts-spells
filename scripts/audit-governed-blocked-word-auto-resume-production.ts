#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

import pg from "pg";

const CONFIRMATION = "AUDIT_GOVERNED_BLOCKED_WORD_AUTO_RESUME_READ_ONLY";
const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";

if (!process.argv.slice(2).includes(CONFIRMATION)) {
  throw new Error(`Refusing production audit without: -- ${CONFIRMATION}`);
}

const probes = [
  { word: "chicken", occurrenceId: "7c601125-43fd-4566-ae56-94dfea577f65", sourceId: null },
  { word: "effect", occurrenceId: "f9eb445a-3b59-4e9c-b53d-bf587212b35f", sourceId: null },
  { word: "certain", occurrenceId: "891566e1-d8fa-480a-b6a9-8ba5065f9592", sourceId: null },
  { word: "business", occurrenceId: "8402cc6c-bcf9-42fa-82c5-90e8795f0363", sourceId: "2f44cadc-3d86-4235-951e-bcc22c8d3a1e" },
  { word: "deterministic yoghurt", occurrenceId: "f1cc634b-cc2c-4377-ba9d-44d9d7ab7e93", sourceId: "2c5dd9b3-a80f-40a5-8a5a-72f8294f2a8b" },
  { word: "ingredients", occurrenceId: "63048f8a-d510-487f-a359-a17a7f0b9c75", sourceId: "71deea87-9d0b-42ef-8c1c-90bc55a2328d" },
  { word: "ingredient", occurrenceId: "7c7c13cf-0b3f-4bc2-b2c9-25d149e432d2", sourceId: "fa35d57f-d7ae-45ee-8e05-870f408a90ae" },
  { word: "renew", occurrenceId: "fd534c8b-87c7-47a2-8a13-de1c9b40aaec", sourceId: "9c5444cb-9ade-4fc8-b7a3-daceae8220f1" },
  { word: "malteasers", occurrenceId: "d41ff6b1-2d8f-4dac-8080-802823bf0c60", sourceId: "81b899e6-966c-42a1-84ec-92f925451984" },
  { word: "unlocked", occurrenceId: "6159ac13-0013-4554-8e34-34bc73425ac9", sourceId: "566d36b8-816d-4ddc-92ac-0a6d9dfc761d" },
  { word: "repeated", occurrenceId: "e90f14de-d794-4d09-ba9f-b6b100bb7d79", sourceId: "51c93c47-3bea-49be-b817-2d9443fc7bf0" },
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
  if (!value) throw new Error("Missing production database URL");
  if (!new URL(value).username.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error("Auto-resume audit is not pointed at expected production");
  }
  return value;
}

type ProbeRow = {
  occurrence_id: string;
  issue_count: number;
  issue_micro_skill_key: string | null;
  issue_status: string | null;
  final_classification: string | null;
  replay_route_source: string | null;
  replay_admin_decision_id: string | null;
  admin_terminal_decision_count: number;
  admin_case_status: string | null;
  admin_decision_type: string | null;
  admin_linked_micro_skill_key: string | null;
  source_id: string | null;
  source_status: string | null;
  source_micro_skill_key: string | null;
  source_misspelling: string | null;
  source_correction: string | null;
  source_handoff_state: string | null;
  source_anchor_count: number | null;
  occurrence_exact: boolean | null;
  verification_exact: boolean | null;
  exact_issue_authority: boolean | null;
  legacy_no_issue_authority: boolean | null;
  verification_source_type: string | null;
  verification_observed: string | null;
  verification_correction: string | null;
  verification_occurrence_id: string | null;
  verification_task_matches_source: boolean | null;
  intake_candidate_id: string | null;
  intake_state: string | null;
  intake_blockers: unknown;
  mapping_ready: boolean | null;
  canonical_word_ready: boolean | null;
  micro_skill_ready: boolean | null;
  generic_profile_ready: boolean | null;
  generic_content_ready: boolean | null;
  prefix_profile_ready: boolean | null;
  suffix_profile_ready: boolean | null;
};

function blockerCode(blockers: unknown): string | null {
  if (!Array.isArray(blockers)) return null;
  const first = blockers[0];
  return first && typeof first === "object" && "code" in first
    ? String((first as { code?: unknown }).code ?? "") || null
    : null;
}

function predictedStatus(row: ProbeRow): string {
  const persisted = blockerCode(row.intake_blockers);
  if (row.intake_state === "activated") return "READY";
  if (persisted) return persisted;
  if (!row.source_id) return "awaiting_governed_admin_replay";
  if (row.mapping_ready === false) return "mapping_missing";
  if (row.canonical_word_ready === false) return "canonical_word_missing";
  if (row.micro_skill_ready === false) return "micro_skill_inactive";
  const profileReady = row.generic_profile_ready || row.prefix_profile_ready || row.suffix_profile_ready;
  if (!profileReady) return "profile_not_enabled";
  if (row.generic_profile_ready && !row.generic_content_ready) return "payload_not_compilable";
  return "ordinary_route_specific_evaluation_required";
}

async function main(): Promise<void> {
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
    if (readOnly !== "on") throw new Error("Production transaction is not read-only");

    const rows: Array<Record<string, unknown>> = [];
    for (const probe of probes) {
      const result = await client.query<ProbeRow>(`
        with selected_source as (
          select source.*
          from public.parent_verified_spelling_candidate_mappings source
          where source.id = $2::uuid
        ), issue_population as (
          select issue.*
          from public.writing_issues issue
          where issue.source_misspelling_instance_id = $1::uuid
        ), selected_issue as (
          select * from issue_population order by id limit 1
        )
        select
          $1::uuid::text as occurrence_id,
          (select count(*)::int from issue_population) as issue_count,
          issue.micro_skill_key as issue_micro_skill_key,
          issue.issue_status,
          issue.final_classification,
          issue.metadata->'returned_correction_stage_f_replay'->>'route_source'
            as replay_route_source,
          issue.metadata->'returned_correction_stage_f_replay'->>'admin_decision_id'
            as replay_admin_decision_id,
          (select count(*)::int
            from public.spelling_catalog_review_cases review_case
            join public.spelling_catalog_review_case_decisions decision
              on decision.case_id=review_case.id
            where review_case.source_misspelling_instance_id=$1::uuid
              and decision.new_status=review_case.case_status
          ) as admin_terminal_decision_count,
          admin_authority.case_status as admin_case_status,
          admin_authority.decision_type as admin_decision_type,
          admin_authority.linked_micro_skill_key as admin_linked_micro_skill_key,
          source.id::text as source_id,
          source.candidate_status as source_status,
          source.micro_skill_key as source_micro_skill_key,
          source.misspelling_normalized as source_misspelling,
          source.correct_spelling_normalized as source_correction,
          source.canonical_intake_handoff_state as source_handoff_state,
          num_nonnulls(source.task_submission_id,source.source_adle_review_session_id)::int
            as source_anchor_count,
          case when source.id is null then null else exists(
            select 1 from public.misspelling_instances occurrence
            where occurrence.id=source.source_misspelling_instance_id
              and occurrence.parent_user_id=source.parent_user_id
              and occurrence.child_id=source.child_id
              and lower(btrim(occurrence.misspelled_word))=source.misspelling_normalized
              and (nullif(btrim(occurrence.corrected_word),'') is null
                or lower(btrim(occurrence.corrected_word))=source.correct_spelling_normalized)
          ) end as occurrence_exact,
          case when source.id is null then null else exists(
            select 1 from public.parent_verifications verification
            where verification.id=source.parent_verification_id
              and verification.parent_user_id=source.parent_user_id
              and verification.child_id=source.child_id
              and verification.domain_module='spelling'
              and verification.decision in ('accepted','overridden')
              and verification.source_entity_id=source.reviewed_event_source_entity_id
              and coalesce(verification.verified_micro_skill_key,
                verification.suggested_micro_skill_key)=source.micro_skill_key
          ) end as verification_exact,
          case when source.id is null then null else exists(
            select 1 from issue_population exact_issue
            join public.task_submissions issue_submission on issue_submission.id=exact_issue.task_submission_id
            join public.task_submissions source_submission on source_submission.id=source.task_submission_id
            where exact_issue.issue_status='finalised'
              and exact_issue.final_classification in ('fragile_knowledge','concept_gap','transfer_failure')
              and lower(btrim(coalesce(nullif(exact_issue.observed_text,''),'')))=source.misspelling_normalized
              and lower(btrim(coalesce(nullif(exact_issue.approved_replacement,''),nullif(exact_issue.suggested_replacement,''))))=source.correct_spelling_normalized
              and exact_issue.micro_skill_key=source.micro_skill_key
              and issue_submission.task_id=source_submission.task_id
          ) end as exact_issue_authority,
          case when source.id is null then null else
            not exists(select 1 from issue_population)
            and source.canonical_intake_handoff_state is null
            and exists(
              select 1 from public.parent_verifications verification
              join public.task_submissions verification_submission on verification_submission.id=verification.task_submission_id
              join public.task_submissions source_submission on source_submission.id=source.task_submission_id
              where verification.id=source.parent_verification_id
                and verification.source_type='authentic_writing'
                and verification_submission.task_id=source_submission.task_id
            )
          end as legacy_no_issue_authority,
          verification.source_type as verification_source_type,
          verification.suggestion_payload->>'observed_text' as verification_observed,
          verification.suggestion_payload->>'suggested_replacement' as verification_correction,
          verification.suggestion_payload->>'source_misspelling_instance_id'
            as verification_occurrence_id,
          case when source.id is null then null else exists(
            select 1 from public.task_submissions verification_submission
            join public.task_submissions source_submission
              on source_submission.id=source.task_submission_id
            where verification_submission.id=verification.task_submission_id
              and verification_submission.task_id=source_submission.task_id
          ) end as verification_task_matches_source,
          intake.id::text as intake_candidate_id,
          intake.candidate_state as intake_state,
          intake.blockers as intake_blockers,
          case when source.id is null then null else exists(
            select 1 from public.spelling_canonical_mappings mapping
            where mapping.misspelling_normalized=source.misspelling_normalized
              and mapping.correct_spelling_normalized=source.correct_spelling_normalized
              and mapping.micro_skill_key=source.micro_skill_key
              and mapping.mapping_status='active'
              and mapping.resolver_visibility_status='visible'
              and exists(select 1 from public.spelling_canonical_mapping_events event
                where event.mapping_id=mapping.id and event.event_type='resolver_visibility_enabled'
                  and event.new_resolver_visibility_status='visible')
          ) end as mapping_ready,
          case when source.id is null then null else exists(
            select 1 from public.canonical_teaching_dictionary_words word
            where word.normalised_word=source.correct_spelling_normalized
              and word.row_status='active'
              and word.review_status in ('approved_for_guided_review','approved_for_first_exposure')
          ) end as canonical_word_ready,
          case when source.id is null then null else exists(
            select 1 from public.micro_skill_catalog skill
            where skill.micro_skill_key=source.micro_skill_key
              and skill.mastery_domain_key='D4' and skill.is_active and skill.is_assignable
          ) end as micro_skill_ready,
          case when source.id is null then null else exists(
            select 1 from public.canonical_teaching_dictionary_transfer_selector_profiles profile
            where profile.micro_skill_key=source.micro_skill_key
              and profile.row_status='active'
              and profile.review_status='approved_for_first_exposure'
          ) end as generic_profile_ready,
          case when source.id is null then null else exists(
            select 1 from public.canonical_teaching_dictionary_content_versions content
            where content.micro_skill_key=source.micro_skill_key
              and content.version_status='active' and content.is_active
              and content.final_readiness_review_status='signed_off'
              and btrim(coalesce(content.child_friendly_explanation,''))<>''
              and btrim(coalesce(content.rule_explanation,''))<>''
          ) end as generic_content_ready,
          case when source.id is null then null else exists(
            select 1 from public.canonical_teaching_dictionary_prefix_profiles profile
            where profile.micro_skill_key=source.micro_skill_key
              and profile.production_enabled and profile.row_status='active'
              and profile.review_status='approved_for_first_exposure'
          ) end as prefix_profile_ready,
          case when source.id is null then null else exists(
            select 1 from public.canonical_teaching_dictionary_suffix_profiles profile
            where profile.micro_skill_key=source.micro_skill_key
              and profile.production_enabled and profile.row_status='active'
              and profile.review_status='approved_for_first_exposure'
          ) end as suffix_profile_ready
        from selected_issue issue
        full join selected_source source on true
        left join public.adle_canonical_intake_candidates intake
          on intake.source_candidate_mapping_id=source.id
        left join public.parent_verifications verification
          on verification.id=source.parent_verification_id
        left join lateral (
          select review_case.case_status,decision.decision_type,
            decision.linked_micro_skill_key
          from public.spelling_catalog_review_cases review_case
          join public.spelling_catalog_review_case_decisions decision
            on decision.case_id=review_case.id
          where review_case.source_misspelling_instance_id=$1::uuid
            and decision.new_status=review_case.case_status
          order by decision.created_at desc,decision.id desc
          limit 1
        ) admin_authority on true
      `, [probe.occurrenceId, probe.sourceId]);
      const row = result.rows[0] ?? ({
        occurrence_id: probe.occurrenceId,
        issue_count: 0,
        issue_micro_skill_key: null,
        issue_status: null,
        final_classification: null,
        replay_route_source: null,
        replay_admin_decision_id: null,
        admin_terminal_decision_count: 0,
        admin_case_status: null,
        admin_decision_type: null,
        admin_linked_micro_skill_key: null,
        source_id: null,
        source_status: null,
        source_micro_skill_key: null,
        source_misspelling: null,
        source_correction: null,
        source_handoff_state: null,
        source_anchor_count: null,
        occurrence_exact: null,
        verification_exact: null,
        exact_issue_authority: null,
        legacy_no_issue_authority: null,
        verification_source_type: null,
        verification_observed: null,
        verification_correction: null,
        verification_occurrence_id: null,
        verification_task_matches_source: null,
        intake_candidate_id: null,
        intake_state: null,
        intake_blockers: null,
        mapping_ready: null,
        canonical_word_ready: null,
        micro_skill_ready: null,
        generic_profile_ready: null,
        generic_content_ready: null,
        prefix_profile_ready: null,
        suffix_profile_ready: null,
      } satisfies ProbeRow);
      const sourceAuthorityCompatible = row.source_id === null
        ? null
        : row.source_status !== null &&
          ["parent_local_promoted", "global_canonical_promoted"].includes(row.source_status) &&
          row.source_anchor_count === 1 && row.occurrence_exact === true &&
          row.verification_exact === true &&
          (row.exact_issue_authority === true || row.legacy_no_issue_authority === true);
      rows.push({
        word: probe.word,
        occurrenceId: probe.occurrenceId,
        sourceId: row.source_id,
        sourceAuthorityCompatible,
        sourceAnchorCount: row.source_anchor_count,
        occurrenceExact: row.occurrence_exact,
        verificationExact: row.verification_exact,
        exactIssueAuthority: row.exact_issue_authority,
        legacyNoIssueAuthority: row.legacy_no_issue_authority,
        verificationSourceType: row.verification_source_type,
        verificationObserved: row.verification_observed,
        verificationCorrection: row.verification_correction,
        verificationOccurrenceId: row.verification_occurrence_id,
        verificationTaskMatchesSource: row.verification_task_matches_source,
        issueMicroSkillKey: row.issue_micro_skill_key,
        replayRouteSource: row.replay_route_source,
        replayAdminDecisionId: row.replay_admin_decision_id,
        adminTerminalDecisionCount: row.admin_terminal_decision_count,
        adminCaseStatus: row.admin_case_status,
        adminDecisionType: row.admin_decision_type,
        adminLinkedMicroSkillKey: row.admin_linked_micro_skill_key,
        intakeCandidateId: row.intake_candidate_id,
        intakeState: row.intake_state,
        mappingReady: row.mapping_ready,
        canonicalWordReady: row.canonical_word_ready,
        microSkillReady: row.micro_skill_ready,
        genericProfileReady: row.generic_profile_ready,
        genericContentReady: row.generic_content_ready,
        prefixProfileReady: row.prefix_profile_ready,
        suffixProfileReady: row.suffix_profile_ready,
        predictedStatus: predictedStatus(row),
      });
    }

    const migration = await client.query<{ installed: boolean }>(`
      select exists(
        select 1 from supabase_migrations.schema_migrations
        where version='20260828160000'
      ) as installed
    `);
    const sourceOnly = rows.filter((row) => [
      "business", "deterministic yoghurt", "ingredients", "ingredient",
    ].includes(String(row.word)));
    if (sourceOnly.some((row) => row.sourceAuthorityCompatible !== true)) {
      throw new Error(
        `A known source-only production row fails the exact compatibility predicate: ${JSON.stringify(sourceOnly)}`,
      );
    }
    await client.query("rollback");
    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      productionTransactionReadOnly: readOnly,
      compatibilityMigrationInstalled: migration.rows[0]?.installed ?? false,
      productionWritesPerformed: 0,
      probes: rows,
    }, null, 2)}\n`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
