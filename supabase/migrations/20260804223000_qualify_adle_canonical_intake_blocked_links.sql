-- Qualify link and queue columns that otherwise conflict with the table-shaped
-- function's candidate_id/demand_id output parameters in PL/pgSQL.
create or replace function public.adle_record_canonical_intake_blocked(
  p_candidate_mapping_id uuid,
  p_normalized_target_token text,
  p_canonical_word_id uuid,
  p_target_identity_status text,
  p_route_id text,
  p_route_version text,
  p_micro_skill_key text,
  p_candidate_state text,
  p_blockers jsonb,
  p_readiness_fingerprint text,
  p_demand_type text,
  p_primary_blocker_code text
)
returns table(candidate_id uuid, demand_id uuid, demand_created boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_candidate public.adle_canonical_intake_candidates%rowtype;
  v_demand public.adle_canonical_intake_demands%rowtype;
  v_source public.parent_verified_spelling_candidate_mappings%rowtype;
  v_stable_key text;
  v_link_existed boolean;
  v_demand_created boolean := false;
begin
  if p_candidate_state not in ('pending_mapping', 'pending_content') then
    raise exception 'canonical intake blocked state is invalid';
  end if;
  if jsonb_typeof(p_blockers) <> 'array' or jsonb_array_length(p_blockers) = 0 then
    raise exception 'canonical intake blockers must be a non-empty array';
  end if;
  if p_primary_blocker_code = 'canonical_word_missing' and
     (p_demand_type <> 'teaching_content' or p_candidate_state <> 'pending_content' or p_target_identity_status <> 'established') then
    raise exception 'canonical_word_missing requires established teaching-content state';
  end if;

  select source.* into v_source
  from public.parent_verified_spelling_candidate_mappings source
  where source.id = p_candidate_mapping_id
    and source.candidate_status = any(array['parent_local_promoted', 'global_canonical_promoted'])
  for update;
  if not found or v_source.task_submission_id is null then
    raise exception 'canonical intake source candidate is not approved or has no submission';
  end if;
  if lower(btrim(v_source.correct_spelling_normalized)) <> lower(btrim(p_normalized_target_token)) or
     v_source.micro_skill_key <> p_micro_skill_key then
    raise exception 'canonical intake target identity differs from reviewed source';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_candidate_mapping_id::text, 0));
  insert into public.adle_canonical_intake_candidates(
    source_candidate_mapping_id, source_submission_id, child_id,
    normalized_target_token, canonical_word_id, target_identity_status,
    route_id, route_version, micro_skill_key, candidate_state, blockers,
    readiness_fingerprint, last_evaluated_at, next_retry_at
  ) values (
    p_candidate_mapping_id, v_source.task_submission_id, v_source.child_id,
    lower(btrim(p_normalized_target_token)), p_canonical_word_id, p_target_identity_status,
    p_route_id, p_route_version, p_micro_skill_key, p_candidate_state, p_blockers,
    p_readiness_fingerprint, timezone('utc', now()), null
  )
  on conflict (source_candidate_mapping_id) do update set
    normalized_target_token = excluded.normalized_target_token,
    canonical_word_id = excluded.canonical_word_id,
    target_identity_status = excluded.target_identity_status,
    route_id = excluded.route_id,
    route_version = excluded.route_version,
    micro_skill_key = excluded.micro_skill_key,
    candidate_state = excluded.candidate_state,
    blockers = excluded.blockers,
    readiness_fingerprint = excluded.readiness_fingerprint,
    last_evaluated_at = excluded.last_evaluated_at,
    next_retry_at = null,
    learning_item_id = null,
    activated_at = null,
    resolved_at = null,
    lock_version = public.adle_canonical_intake_candidates.lock_version + 1,
    updated_at = timezone('utc', now())
  returning * into v_candidate;

  v_stable_key := encode(digest(concat_ws(E'\x1f',
    p_demand_type, lower(btrim(p_normalized_target_token)),
    p_route_id, p_route_version, p_micro_skill_key
  ), 'sha256'), 'hex');

  select demand.* into v_demand
  from public.adle_canonical_intake_demands demand
  where demand.stable_key = v_stable_key
  for update;
  if not found then
    insert into public.adle_canonical_intake_demands(
      stable_key, demand_type, target_identity_status, normalized_target_token,
      canonical_word_id, target_record_link_status, route_id, route_version,
      micro_skill_key, lifecycle_status, primary_blocker_code, blockers,
      readiness_fingerprint, notification_status
    ) values (
      v_stable_key, p_demand_type, p_target_identity_status,
      lower(btrim(p_normalized_target_token)), p_canonical_word_id,
      case when p_canonical_word_id is null then 'token_only' else 'canonical_word_linked' end,
      p_route_id, p_route_version, p_micro_skill_key, 'pending',
      p_primary_blocker_code, p_blockers, p_readiness_fingerprint, 'unread'
    ) returning * into v_demand;
    v_demand_created := true;
  else
    update public.adle_canonical_intake_demands demand set
      target_identity_status = p_target_identity_status,
      canonical_word_id = coalesce(p_canonical_word_id, demand.canonical_word_id),
      target_record_link_status = case
        when coalesce(p_canonical_word_id, demand.canonical_word_id) is null then 'token_only'
        else 'canonical_word_linked'
      end,
      lifecycle_status = case
        when demand.lifecycle_status in ('in_review', 'rejected', 'superseded') then demand.lifecycle_status
        else 'pending'
      end,
      primary_blocker_code = p_primary_blocker_code,
      blockers = p_blockers,
      readiness_fingerprint = p_readiness_fingerprint,
      notification_status = case when demand.notification_status = 'resolved' then 'unread' else demand.notification_status end,
      notification_resolved_at = case when demand.notification_status = 'resolved' then null else demand.notification_resolved_at end,
      last_seen_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where demand.id = v_demand.id
    returning * into v_demand;
  end if;

  select exists(
    select 1
    from public.adle_canonical_intake_candidate_demands link
    where link.candidate_id = v_candidate.id
      and link.demand_id = v_demand.id
  ) into v_link_existed;

  update public.adle_canonical_intake_candidate_demands link set
    link_status = 'superseded',
    resolved_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where link.candidate_id = v_candidate.id
    and link.demand_id <> v_demand.id
    and link.link_status = 'waiting';

  insert into public.adle_canonical_intake_candidate_demands(
    candidate_id, demand_id, link_status
  ) values (v_candidate.id, v_demand.id, 'waiting')
  on conflict on constraint adle_canonical_intake_candidate_dema_candidate_id_demand_id_key do update set
    link_status = 'waiting',
    last_linked_at = timezone('utc', now()),
    resolved_at = null,
    updated_at = timezone('utc', now());

  if not v_link_existed then
    update public.adle_canonical_intake_demands demand
    set occurrence_count = demand.occurrence_count + 1,
        updated_at = timezone('utc', now())
    where demand.id = v_demand.id;
  end if;

  update public.adle_canonical_intake_reconciliation_queue queue
  set job_status = 'completed',
      completed_at = timezone('utc', now()),
      lease_owner = null,
      lease_expires_at = null,
      updated_at = timezone('utc', now())
  where queue.candidate_id = v_candidate.id
    and queue.job_status in ('pending', 'leased', 'retry');

  insert into public.adle_canonical_intake_events(
    candidate_id, demand_id, event_type, actor_type,
    readiness_fingerprint, event_payload
  ) values (
    v_candidate.id, v_demand.id, 'candidate_blocked', 'reconciler',
    p_readiness_fingerprint,
    jsonb_build_object(
      'candidateState', p_candidate_state,
      'demandType', p_demand_type,
      'targetIdentityStatus', p_target_identity_status,
      'primaryBlocker', p_primary_blocker_code
    )
  );

  return query select v_candidate.id, v_demand.id, v_demand_created;
end;
$$;

revoke all on function public.adle_record_canonical_intake_blocked(
  uuid, text, uuid, text, text, text, text, text, jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.adle_record_canonical_intake_blocked(
  uuid, text, uuid, text, text, text, text, text, jsonb, text, text, text
) to service_role;
