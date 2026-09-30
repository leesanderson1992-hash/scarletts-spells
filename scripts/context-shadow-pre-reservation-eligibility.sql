-- READ ONLY. Run with trusted operator read access while the failed disposable
-- learner, task, source, job and proof policy still exist, before cleanup.
-- Replace the NULL inputs with the job/claim, exact AI_CONFIGURATION_STOP id,
-- and non-secret values actually supplied by the worker. Never put a key,
-- writing excerpt or connection string here. Run before policy/fixture cleanup.
-- Current control/job state and clock/expiry checks may be false after fail-stop;
-- *_at_stop fields reconstruct the narrow instant of the selected stop record.
-- The control row has no history: its pre-stop ai_mode/updated_at cannot be
-- recovered from this query after the kill switch updates it.
-- Boolean NULL means the required operator input was not supplied.
with input as (
  select null::uuid as job_id, null::uuid as claim_token, null::uuid as stop_id,
    null::uuid as policy_revision_id,
    null::text as runtime_environment, null::text as runtime_project_ref,
    null::text as runtime_deployment_sha, null::text as runtime_config_fingerprint,
    null::text as runtime_fingerprint, null::text as runtime_rate_card_fingerprint,
    null::text as runtime_rate_card_version
), lineage as (
  select i.*, j.id as found_job_id, j.claim_token as stored_claim_token,
    j.status as job_status, j.claimed_at, j.completed_at, j.snapshot_id,
    s.id as source_id, s.child_id, s.parent_user_id, s.task_id as source_task_id,
    s.submission_id, s.occurred_at, s.source_purpose, s.envelope,
    t.id as found_submission_id, t.task_id as submission_task_id,
    t.parent_user_id as submission_parent_id, t.child_id as submission_child_id,
    t.parent_review_status, t.submitted_at,
    k.id as found_task_id, k.parent_user_id as task_parent_id, k.task_type,
    ch.id as found_child_id, ch.parent_user_id as child_parent_id,
    ctl.singleton as control_exists, ctl.enabled, ctl.ai_mode, ctl.updated_at as control_updated_at,
    p.singleton as policy_exists, p.revision_id, p.provider_approval_id,
    p.rate_card_version, p.learner_policy_version, p.dispatch_scope,
    p.execution_policy_kind, p.proof_scan_kind, p.bootstrap_expires_at,
    a.id as found_approval_id, a.environment as approval_environment,
    a.project_ref as approval_project_ref, a.deployment_sha as approval_deployment_sha,
    a.config_fingerprint as approval_config_fingerprint,
    a.runtime_fingerprint as approval_runtime_fingerprint,
    a.dispatch_scope as approval_scope, a.model as approval_model,
    a.endpoint as approval_endpoint, a.approved_at as approval_at,
    a.expires_at as approval_expires_at,
    c.version as found_card_version, c.fingerprint as card_fingerprint,
    c.model as card_model, c.endpoint as card_endpoint,
    c.service_tier as card_tier, c.effective_at as card_effective_at
  from input i
  left join public.writing_context_shadow_jobs j on j.id=i.job_id
  left join public.writing_source_snapshots s on s.id=j.snapshot_id
  left join public.task_submissions t on t.id=s.submission_id
  left join public.course_tasks k on k.id=t.task_id
  left join public.children ch on ch.id=s.child_id
  left join public.writing_context_advisory_control ctl on ctl.singleton
  left join public.writing_context_shadow_policy p on p.singleton
  left join public.writing_context_provider_approvals a on a.id=p.provider_approval_id
  left join public.writing_context_ai_rate_cards c on c.version=p.rate_card_version
), stop_time as (
  select l.*, x.created_at as selected_configuration_stop_at
  from lineage l
  left join public.writing_context_shadow_stops x on x.id=l.stop_id and x.code='AI_CONFIGURATION_STOP'
)
select
  found_job_id is not null as job_exists,
  coalesce(stored_claim_token=claim_token,false) as claim_token_match,
  coalesce(job_status='processing',false) as job_processing_now,
  coalesce(claimed_at<=selected_configuration_stop_at
    and coalesce(completed_at,'infinity'::timestamptz)>=selected_configuration_stop_at,false)
    as job_processing_at_stop,
  selected_configuration_stop_at is not null as selected_stop_exists,
  source_id is not null as source_exists,
  found_submission_id is not null as submission_exists,
  found_task_id is not null as task_exists,
  found_child_id is not null as child_exists,
  control_exists is not null as control_exists,
  coalesce(child_parent_id=parent_user_id,false) as child_owner_match,
  coalesce(submission_parent_id=parent_user_id,false) as submission_parent_match,
  coalesce(submission_child_id=child_id,false) as submission_child_match,
  coalesce(source_task_id=submission_task_id,false) as source_task_match,
  coalesce(task_parent_id=parent_user_id,false) as task_owner_match,
  coalesce(task_type in ('lesson','test'),false) as task_type_allowed,
  coalesce(parent_review_status='pending',false) as parent_review_pending_now,
  coalesce(not exists(select 1 from public.task_submissions newer
    where newer.task_id=z.submission_task_id and newer.child_id=z.child_id
      and newer.submitted_at>z.submitted_at),false) and found_submission_id is not null
    as no_newer_submission,
  selected_configuration_stop_at is not null and not exists(select 1 from public.task_submissions newer
    where newer.task_id=z.submission_task_id and newer.child_id=z.child_id
      and newer.submitted_at>z.submitted_at and newer.submitted_at<=z.selected_configuration_stop_at)
    as no_newer_submission_at_stop,
  coalesce(not enabled,false) as control_enabled_false_now,
  coalesce(ai_mode='shadow',false) as control_shadow_now,
  coalesce(occurred_at>=control_updated_at,false) as source_after_control_update_now,
  coalesce(occurred_at>=approval_at,false) as source_after_approval,
  coalesce(envelope->>'contextAiModeAtCapture'='shadow',false) as captured_shadow,
  coalesce(envelope->>'contextAiShadowCapture'='true',false) as captured_ai,
  coalesce(envelope->>'contextAdvisoryCapture'='false',false) as advisory_capture_off,
  policy_exists is not null as policy_exists,
  case when policy_revision_id is null then null else coalesce(revision_id=policy_revision_id,false) end as policy_revision_match,
  coalesce(execution_policy_kind='DISPOSABLE_BOOTSTRAP',false) as bootstrap_kind,
  coalesce(proof_scan_kind='PASSAGE',false) as proof_passage_kind,
  coalesce(dispatch_scope='DISPOSABLE_PROVIDER_PROOF',false) as proof_scope,
  coalesce(bootstrap_expires_at>clock_timestamp(),false) as bootstrap_unexpired_now,
  found_approval_id is not null as provider_approval_exists,
  coalesce(approval_scope=dispatch_scope,false) as provider_scope_match,
  coalesce(approval_environment='production',false) as provider_production_environment,
  case when runtime_environment is null then null else coalesce(approval_environment=runtime_environment,false) end as environment_match,
  case when runtime_project_ref is null then null else coalesce(approval_project_ref=runtime_project_ref,false) end as project_ref_match,
  case when runtime_deployment_sha is null then null else coalesce(approval_deployment_sha=runtime_deployment_sha,false) end as deployment_sha_match,
  case when runtime_config_fingerprint is null then null else coalesce(approval_config_fingerprint=runtime_config_fingerprint,false) end as config_fingerprint_match,
  case when runtime_fingerprint is null then null else coalesce(approval_runtime_fingerprint=runtime_fingerprint,false) end as runtime_fingerprint_match,
  coalesce(approval_expires_at>clock_timestamp(),false) as provider_approval_unexpired_now,
  coalesce(approval_at<=selected_configuration_stop_at and approval_expires_at>selected_configuration_stop_at,false)
    as provider_approval_valid_at_stop,
  not exists(select 1 from public.writing_context_approval_revocations r
    where r.provider_approval_id=z.provider_approval_id) as provider_not_revoked_now,
  selected_configuration_stop_at is not null and not exists(select 1 from public.writing_context_approval_revocations r
    where r.provider_approval_id=z.provider_approval_id and r.created_at<=z.selected_configuration_stop_at)
    as provider_not_revoked_at_stop,
  found_card_version is not null as rate_card_exists,
  case when runtime_rate_card_version is null then null else coalesce(rate_card_version=runtime_rate_card_version,false) end as rate_card_version_match,
  case when runtime_rate_card_fingerprint is null then null else coalesce(card_fingerprint=runtime_rate_card_fingerprint,false) end as rate_card_fingerprint_match,
  coalesce(card_effective_at<=clock_timestamp(),false) as rate_card_effective_now,
  coalesce(card_effective_at<=selected_configuration_stop_at,false) as rate_card_effective_at_stop,
  coalesce(approval_model=card_model and card_model='gpt-6-luna',false) as model_pin_match,
  coalesce(approval_endpoint=card_endpoint and card_endpoint='/v1/responses',false) as endpoint_pin_match,
  coalesce(card_tier='default',false) as service_tier_pin_match,
  coalesce(source_purpose='DISPOSABLE_PROVIDER_PROOF',false) as proof_source,
  coalesce(source_purpose=dispatch_scope,false) as source_scope_match,
  case when source_id is null then false else public.context_shadow_scope_authorised(source_id) end
    as scope_authorised_now,
  exists(select 1 from public.writing_context_provider_proof_learners f
    where f.child_id=z.child_id and f.parent_user_id=z.parent_user_id
      and f.task_id=z.source_task_id and f.approved_at<=z.occurred_at
      and f.expires_at>clock_timestamp()) as proof_registration_valid_now,
  exists(select 1 from public.writing_context_provider_proof_learners f
    where f.child_id=z.child_id and f.parent_user_id=z.parent_user_id
      and f.task_id=z.source_task_id and f.approved_at<=z.occurred_at
      and f.expires_at>z.selected_configuration_stop_at) as proof_registration_valid_at_stop,
  exists(select 1 from public.writing_context_learner_authorisations l
    where l.child_id=z.child_id and l.parent_user_id=z.parent_user_id
      and l.policy_version=z.learner_policy_version and l.approved_at<=z.occurred_at
      and l.expires_at>clock_timestamp()
      and not exists(select 1 from public.writing_context_approval_revocations r
        where r.learner_authorisation_id=l.id)) as learner_authorisation_exists_now,
  exists(select 1 from public.writing_context_learner_authorisations l
    where l.child_id=z.child_id and l.parent_user_id=z.parent_user_id
      and l.policy_version=z.learner_policy_version and l.approved_at<=z.occurred_at
      and l.expires_at>clock_timestamp() and l.authorisation_kind='OPERATOR_PROOF'
      and l.approved_by=z.parent_user_id
      and not exists(select 1 from public.writing_context_approval_revocations r
        where r.learner_authorisation_id=l.id)) as operator_permission_valid_now,
  exists(select 1 from public.writing_context_learner_authorisations l
    where l.child_id=z.child_id and l.parent_user_id=z.parent_user_id
      and l.policy_version=z.learner_policy_version and l.approved_at<=z.occurred_at
      and l.expires_at>z.selected_configuration_stop_at and l.authorisation_kind='OPERATOR_PROOF'
      and l.approved_by=z.parent_user_id
      and not exists(select 1 from public.writing_context_approval_revocations r
        where r.learner_authorisation_id=l.id and r.created_at<=z.selected_configuration_stop_at))
    as operator_permission_valid_at_stop
from stop_time z;
