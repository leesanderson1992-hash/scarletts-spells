begin;

-- Durable, child-scoped activation state. Teaching facts remain in the
-- governed Teaching Dictionary; these rows store only evaluated state and
-- evidence references.
create table public.adle_canonical_intake_candidates (
  id uuid primary key default gen_random_uuid(),
  source_candidate_mapping_id uuid not null unique
    references public.parent_verified_spelling_candidate_mappings(id) on delete restrict,
  source_submission_id uuid not null references public.task_submissions(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete cascade,
  normalized_target_token text not null,
  canonical_word_id uuid references public.canonical_teaching_dictionary_words(id) on delete restrict,
  target_identity_status text not null,
  route_id text not null,
  route_version text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  candidate_state text not null default 'queued',
  priority integer not null default 100,
  blockers jsonb not null default '[]'::jsonb,
  readiness_fingerprint text not null default 'not_evaluated',
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_evaluated_at timestamptz,
  next_retry_at timestamptz,
  learning_item_id uuid references public.adle_learning_items(id) on delete restrict,
  activated_at timestamptz,
  resolved_at timestamptz,
  lock_version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_canonical_intake_candidates_token_check check (
    btrim(normalized_target_token) <> '' and normalized_target_token = lower(normalized_target_token)
  ),
  constraint adle_canonical_intake_candidates_identity_check check (
    target_identity_status = any (array['unresolved', 'established'])
  ),
  constraint adle_canonical_intake_candidates_state_check check (
    candidate_state = any (array[
      'queued', 'evaluating', 'pending_mapping', 'pending_content',
      'activated', 'rejected', 'superseded', 'error_retryable'
    ])
  ),
  constraint adle_canonical_intake_candidates_state_identity_check check (
    (candidate_state <> 'pending_mapping' or target_identity_status = 'unresolved') and
    (candidate_state <> 'pending_content' or target_identity_status = 'established') and
    (candidate_state <> 'activated' or (target_identity_status = 'established' and learning_item_id is not null))
  ),
  constraint adle_canonical_intake_candidates_route_check check (
    btrim(route_id) <> '' and btrim(route_version) <> ''
  ),
  constraint adle_canonical_intake_candidates_blockers_check check (
    jsonb_typeof(blockers) = 'array'
  )
);

create index adle_canonical_intake_candidates_state_idx
  on public.adle_canonical_intake_candidates(candidate_state, priority desc, first_seen_at, id);
create index adle_canonical_intake_candidates_target_idx
  on public.adle_canonical_intake_candidates(normalized_target_token, route_id, route_version, micro_skill_key)
  where candidate_state in ('pending_mapping', 'pending_content', 'error_retryable');
create index adle_canonical_intake_candidates_word_idx
  on public.adle_canonical_intake_candidates(canonical_word_id)
  where canonical_word_id is not null;

create table public.adle_canonical_intake_demands (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  demand_type text not null,
  target_identity_status text not null,
  normalized_target_token text not null,
  canonical_word_id uuid references public.canonical_teaching_dictionary_words(id) on delete restrict,
  target_record_link_status text not null default 'token_only',
  route_id text not null,
  route_version text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  lifecycle_status text not null default 'pending',
  primary_blocker_code text not null,
  blockers jsonb not null,
  readiness_fingerprint text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  governed_release_id text,
  occurrence_count integer not null default 0,
  notification_status text not null default 'unread',
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  content_ready_at timestamptz,
  activated_at timestamptz,
  notification_opened_at timestamptz,
  notification_resolved_at timestamptz,
  last_reconciled_at timestamptz,
  last_reconciliation_outcome text,
  resolution_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_canonical_intake_demands_key_check check (length(stable_key) = 64),
  constraint adle_canonical_intake_demands_type_check check (
    demand_type = any (array['resolver', 'teaching_content'])
  ),
  constraint adle_canonical_intake_demands_identity_check check (
    target_identity_status = any (array['unresolved', 'established'])
  ),
  constraint adle_canonical_intake_demands_token_check check (
    btrim(normalized_target_token) <> '' and normalized_target_token = lower(normalized_target_token)
  ),
  constraint adle_canonical_intake_demands_target_link_check check (
    (target_record_link_status = 'token_only' and canonical_word_id is null) or
    (target_record_link_status = 'canonical_word_linked' and canonical_word_id is not null)
  ),
  constraint adle_canonical_intake_demands_lifecycle_check check (
    lifecycle_status = any (array[
      'pending', 'in_review', 'content_ready', 'reconciling',
      'activated', 'rejected', 'superseded'
    ])
  ),
  constraint adle_canonical_intake_demands_notification_check check (
    notification_status = any (array['unread', 'open', 'resolved'])
  ),
  constraint adle_canonical_intake_demands_blockers_check check (
    jsonb_typeof(blockers) = 'array' and jsonb_array_length(blockers) > 0
  ),
  constraint adle_canonical_intake_demands_occurrence_check check (occurrence_count >= 0),
  constraint adle_canonical_intake_demands_classification_check check (
    not (primary_blocker_code = 'canonical_word_missing' and demand_type <> 'teaching_content') and
    not (target_identity_status = 'established' and demand_type = 'resolver')
  )
);

create index adle_canonical_intake_demands_unresolved_idx
  on public.adle_canonical_intake_demands(notification_status, lifecycle_status, first_seen_at, id)
  where lifecycle_status not in ('activated', 'rejected', 'superseded');
create index adle_canonical_intake_demands_target_idx
  on public.adle_canonical_intake_demands(normalized_target_token, route_id, route_version, micro_skill_key);
create index adle_canonical_intake_demands_word_idx
  on public.adle_canonical_intake_demands(canonical_word_id)
  where canonical_word_id is not null;

create table public.adle_canonical_intake_candidate_demands (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.adle_canonical_intake_candidates(id) on delete cascade,
  demand_id uuid not null references public.adle_canonical_intake_demands(id) on delete restrict,
  link_status text not null default 'waiting',
  first_linked_at timestamptz not null default timezone('utc', now()),
  last_linked_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolution_event_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_canonical_intake_candidate_demands_status_check check (
    link_status = any (array['waiting', 'resolved', 'rejected', 'superseded'])
  ),
  unique(candidate_id, demand_id)
);

create unique index adle_canonical_intake_candidate_demands_waiting_idx
  on public.adle_canonical_intake_candidate_demands(candidate_id)
  where link_status = 'waiting';
create index adle_canonical_intake_candidate_demands_demand_idx
  on public.adle_canonical_intake_candidate_demands(demand_id, link_status);

create table public.adle_canonical_intake_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.adle_canonical_intake_candidates(id) on delete cascade,
  trigger_type text not null,
  source_ref text not null,
  job_status text not null default 'pending',
  available_at timestamptz not null default timezone('utc', now()),
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  last_error_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint adle_canonical_intake_queue_trigger_check check (btrim(trigger_type) <> ''),
  constraint adle_canonical_intake_queue_source_check check (btrim(source_ref) <> ''),
  constraint adle_canonical_intake_queue_status_check check (
    job_status = any (array['pending', 'leased', 'retry', 'completed', 'failed'])
  ),
  constraint adle_canonical_intake_queue_attempt_check check (attempt_count >= 0)
);

create unique index adle_canonical_intake_queue_active_candidate_idx
  on public.adle_canonical_intake_reconciliation_queue(candidate_id)
  where job_status in ('pending', 'leased', 'retry');
create index adle_canonical_intake_queue_claim_idx
  on public.adle_canonical_intake_reconciliation_queue(job_status, available_at, created_at, id);

create table public.adle_canonical_intake_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.adle_canonical_intake_candidates(id) on delete restrict,
  demand_id uuid references public.adle_canonical_intake_demands(id) on delete restrict,
  event_type text not null,
  actor_type text not null default 'system',
  actor_user_id uuid references auth.users(id) on delete set null,
  readiness_fingerprint text,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_canonical_intake_events_type_check check (btrim(event_type) <> ''),
  constraint adle_canonical_intake_events_actor_check check (
    actor_type = any (array['system', 'admin', 'release', 'reconciler'])
  ),
  constraint adle_canonical_intake_events_payload_check check (jsonb_typeof(event_payload) = 'object')
);

create index adle_canonical_intake_events_candidate_idx
  on public.adle_canonical_intake_events(candidate_id, created_at, id);
create index adle_canonical_intake_events_demand_idx
  on public.adle_canonical_intake_events(demand_id, created_at, id);

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

  select * into v_source
  from public.parent_verified_spelling_candidate_mappings
  where id = p_candidate_mapping_id
    and candidate_status = any(array['parent_local_promoted', 'global_canonical_promoted'])
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

  select * into v_demand
  from public.adle_canonical_intake_demands
  where stable_key = v_stable_key
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
    update public.adle_canonical_intake_demands set
      target_identity_status = p_target_identity_status,
      canonical_word_id = coalesce(p_canonical_word_id, canonical_word_id),
      target_record_link_status = case
        when coalesce(p_canonical_word_id, canonical_word_id) is null then 'token_only'
        else 'canonical_word_linked'
      end,
      lifecycle_status = case
        when lifecycle_status in ('in_review', 'rejected', 'superseded') then lifecycle_status
        else 'pending'
      end,
      primary_blocker_code = p_primary_blocker_code,
      blockers = p_blockers,
      readiness_fingerprint = p_readiness_fingerprint,
      notification_status = case when notification_status = 'resolved' then 'unread' else notification_status end,
      notification_resolved_at = case when notification_status = 'resolved' then null else notification_resolved_at end,
      last_seen_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = v_demand.id
    returning * into v_demand;
  end if;

  select exists(
    select 1 from public.adle_canonical_intake_candidate_demands
    where candidate_id = v_candidate.id and demand_id = v_demand.id
  ) into v_link_existed;

  update public.adle_canonical_intake_candidate_demands set
    link_status = 'superseded', resolved_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where candidate_id = v_candidate.id and demand_id <> v_demand.id and link_status = 'waiting';

  insert into public.adle_canonical_intake_candidate_demands(
    candidate_id, demand_id, link_status
  ) values (v_candidate.id, v_demand.id, 'waiting')
  on conflict(candidate_id, demand_id) do update set
    link_status = 'waiting', last_linked_at = timezone('utc', now()),
    resolved_at = null, updated_at = timezone('utc', now());

  if not v_link_existed then
    update public.adle_canonical_intake_demands
    set occurrence_count = occurrence_count + 1,
        updated_at = timezone('utc', now())
    where id = v_demand.id;
  end if;

  update public.adle_canonical_intake_reconciliation_queue
  set job_status = 'completed', completed_at = timezone('utc', now()),
      lease_owner = null, lease_expires_at = null, updated_at = timezone('utc', now())
  where candidate_id = v_candidate.id and job_status in ('pending', 'leased', 'retry');

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

create or replace function public.adle_enqueue_canonical_intake_candidate(
  p_candidate_id uuid,
  p_trigger_type text,
  p_source_ref text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_job_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_candidate_id::text, 1));
  insert into public.adle_canonical_intake_reconciliation_queue(
    candidate_id, trigger_type, source_ref, job_status, available_at
  ) values (
    p_candidate_id, p_trigger_type, p_source_ref, 'pending', timezone('utc', now())
  )
  on conflict (candidate_id) where job_status in ('pending', 'leased', 'retry')
  do update set
    trigger_type = excluded.trigger_type,
    source_ref = excluded.source_ref,
    job_status = 'pending',
    available_at = least(public.adle_canonical_intake_reconciliation_queue.available_at, excluded.available_at),
    lease_owner = null,
    lease_expires_at = null,
    updated_at = timezone('utc', now())
  returning id into v_job_id;
  return v_job_id;
end;
$$;

create or replace function public.adle_seed_canonical_intake_candidate(
  p_candidate_mapping_id uuid,
  p_normalized_target_token text,
  p_route_id text,
  p_route_version text,
  p_micro_skill_key text,
  p_source_ref text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.parent_verified_spelling_candidate_mappings%rowtype;
  v_candidate public.adle_canonical_intake_candidates%rowtype;
begin
  select * into v_source
  from public.parent_verified_spelling_candidate_mappings
  where id = p_candidate_mapping_id
    and candidate_status = any(array['parent_local_promoted', 'global_canonical_promoted'])
  for update;
  if not found or v_source.task_submission_id is null then
    raise exception 'canonical intake source candidate is not approved or has no submission';
  end if;
  if lower(btrim(v_source.correct_spelling_normalized)) <> lower(btrim(p_normalized_target_token)) or
     v_source.micro_skill_key <> p_micro_skill_key then
    raise exception 'canonical intake seed differs from reviewed source';
  end if;

  insert into public.adle_canonical_intake_candidates(
    source_candidate_mapping_id, source_submission_id, child_id,
    normalized_target_token, target_identity_status, route_id, route_version,
    micro_skill_key, candidate_state, blockers, readiness_fingerprint
  ) values (
    p_candidate_mapping_id, v_source.task_submission_id, v_source.child_id,
    lower(btrim(p_normalized_target_token)), 'unresolved', p_route_id, p_route_version,
    p_micro_skill_key, 'queued', '[]'::jsonb, 'not_evaluated'
  )
  on conflict (source_candidate_mapping_id) do update set
    normalized_target_token = excluded.normalized_target_token,
    route_id = excluded.route_id,
    route_version = excluded.route_version,
    micro_skill_key = excluded.micro_skill_key,
    updated_at = timezone('utc', now())
  returning * into v_candidate;

  if v_candidate.candidate_state not in ('activated', 'rejected', 'superseded') then
    perform public.adle_enqueue_canonical_intake_candidate(
      v_candidate.id, 'parent_approval', p_source_ref
    );
  end if;
  return v_candidate.id;
end;
$$;

create or replace function public.adle_enqueue_canonical_intake_by_target(
  p_normalized_target_token text,
  p_trigger_type text,
  p_source_ref text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_candidate record; v_count integer := 0;
begin
  if btrim(p_trigger_type) = '' or btrim(p_source_ref) = '' then
    raise exception 'canonical intake target enqueue requires a trigger and source';
  end if;
  if p_trigger_type like '%release%' then
    update public.adle_canonical_intake_demands
    set governed_release_id = p_source_ref,
        last_seen_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where normalized_target_token = lower(btrim(p_normalized_target_token))
      and lifecycle_status in ('pending', 'in_review', 'content_ready', 'reconciling');
  end if;
  for v_candidate in
    select id from public.adle_canonical_intake_candidates
    where normalized_target_token = lower(btrim(p_normalized_target_token))
      and candidate_state in ('pending_content', 'pending_mapping', 'error_retryable')
  loop
    perform public.adle_enqueue_canonical_intake_candidate(
      v_candidate.id, p_trigger_type, p_source_ref
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.adle_claim_canonical_intake_jobs(
  p_limit integer,
  p_lease_owner text,
  p_lease_seconds integer default 240
)
returns table(job_id uuid, candidate_id uuid, trigger_type text, source_ref text, attempt_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit < 1 or p_limit > 100 or btrim(p_lease_owner) = '' or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'invalid canonical intake claim parameters';
  end if;
  return query
  with claimable as (
    select q.id
    from public.adle_canonical_intake_reconciliation_queue q
    join public.adle_canonical_intake_candidates c on c.id = q.candidate_id
    where (
      q.job_status in ('pending', 'retry') and q.available_at <= timezone('utc', now())
    ) or (
      q.job_status = 'leased' and q.lease_expires_at < timezone('utc', now())
    )
    order by c.priority desc, q.available_at, q.created_at, q.id
    for update of q skip locked
    limit p_limit
  )
  update public.adle_canonical_intake_reconciliation_queue q
  set job_status = 'leased', lease_owner = p_lease_owner,
      lease_expires_at = timezone('utc', now()) + make_interval(secs => p_lease_seconds),
      attempt_count = q.attempt_count + 1, updated_at = timezone('utc', now())
  from claimable
  where q.id = claimable.id
  returning q.id, q.candidate_id, q.trigger_type, q.source_ref, q.attempt_count;
end;
$$;

-- Extend the existing atomic item persistence boundary so candidate state,
-- demand resolution and learning-item lineage commit together.
create or replace function public.adle_persist_canonical_intake(
  p_child_id uuid,
  p_canonical_word_id uuid,
  p_micro_skill_key text,
  p_candidate_mapping_id uuid,
  p_canonical_mapping_id uuid,
  p_misspelling_normalized text,
  p_correct_spelling_normalized text,
  p_source_ref text,
  p_verified_on date
)
returns table (learning_item_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learning_item_id uuid;
  v_inserted boolean := false;
  v_candidate public.adle_canonical_intake_candidates%rowtype;
  v_source public.parent_verified_spelling_candidate_mappings%rowtype;
  v_route_id text;
  v_route_version text;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    p_child_id::text || ':' || p_canonical_word_id::text || ':' || p_micro_skill_key,
    0
  ));

  select * into v_source
  from public.parent_verified_spelling_candidate_mappings c
  where c.id = p_candidate_mapping_id
    and c.child_id = p_child_id
    and c.misspelling_normalized = p_misspelling_normalized
    and c.correct_spelling_normalized = p_correct_spelling_normalized
    and c.micro_skill_key = p_micro_skill_key
    and c.candidate_status = any (array['parent_local_promoted', 'global_canonical_promoted'])
  for update;
  if not found or v_source.task_submission_id is null then
    raise exception 'canonical intake candidate identity is no longer approved';
  end if;

  if not exists (
    select 1 from public.canonical_teaching_dictionary_words w
    where w.id = p_canonical_word_id
      and w.normalised_word = p_correct_spelling_normalized
      and w.row_status = 'active'
      and w.review_status = 'approved_for_first_exposure'
  ) then
    raise exception 'canonical intake target identity is no longer assignment-approved';
  end if;

  select li.id into v_learning_item_id
  from public.adle_learning_items li
  where li.child_id = p_child_id
    and li.canonical_word_id = p_canonical_word_id
    and li.micro_skill_key = p_micro_skill_key
    and li.row_status = 'active'
  order by li.intake_on desc, li.id
  limit 1;

  if v_learning_item_id is null then
    insert into public.adle_learning_items (
      child_id, canonical_word_id, micro_skill_key, item_status, source_kind,
      source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status
    ) values (
      p_child_id, p_canonical_word_id, p_micro_skill_key, 'pending', 'verified_misspelling',
      p_source_ref, p_misspelling_normalized, false, null, p_verified_on, 'active'
    ) returning id into v_learning_item_id;
    v_inserted := true;
  end if;

  insert into public.adle_learning_item_sources (
    learning_item_id, parent_verified_candidate_mapping_id, canonical_mapping_id,
    misspelling_normalized, correct_spelling_normalized, micro_skill_key, source_ref, row_status
  ) values (
    v_learning_item_id, p_candidate_mapping_id, p_canonical_mapping_id,
    p_misspelling_normalized, p_correct_spelling_normalized, p_micro_skill_key, p_source_ref, 'active'
  ) on conflict do nothing;

  v_route_id := case when p_micro_skill_key like 'D4_MOR_PREFIXES_%'
    then 'dynamic_prefix_word_lab' else 'adle_word_level' end;
  v_route_version := case when p_micro_skill_key like 'D4_MOR_PREFIXES_%'
    then 'v2' else 'v1' end;

  insert into public.adle_canonical_intake_candidates(
    source_candidate_mapping_id, source_submission_id, child_id,
    normalized_target_token, canonical_word_id, target_identity_status,
    route_id, route_version, micro_skill_key, candidate_state, blockers,
    readiness_fingerprint, last_evaluated_at, learning_item_id,
    activated_at, resolved_at
  ) values (
    p_candidate_mapping_id, v_source.task_submission_id, p_child_id,
    lower(btrim(p_correct_spelling_normalized)), p_canonical_word_id, 'established',
    v_route_id, v_route_version, p_micro_skill_key, 'activated', '[]'::jsonb,
    encode(extensions.digest(concat_ws(E'\x1f', p_candidate_mapping_id::text,
      p_canonical_mapping_id::text, p_canonical_word_id::text, p_micro_skill_key), 'sha256'), 'hex'),
    timezone('utc', now()), v_learning_item_id, timezone('utc', now()), timezone('utc', now())
  )
  on conflict(source_candidate_mapping_id) do update set
    canonical_word_id = excluded.canonical_word_id,
    target_identity_status = 'established',
    route_id = excluded.route_id,
    route_version = excluded.route_version,
    micro_skill_key = excluded.micro_skill_key,
    candidate_state = 'activated',
    blockers = '[]'::jsonb,
    readiness_fingerprint = excluded.readiness_fingerprint,
    last_evaluated_at = excluded.last_evaluated_at,
    next_retry_at = null,
    learning_item_id = excluded.learning_item_id,
    activated_at = coalesce(public.adle_canonical_intake_candidates.activated_at, excluded.activated_at),
    resolved_at = excluded.resolved_at,
    lock_version = public.adle_canonical_intake_candidates.lock_version + 1,
    updated_at = timezone('utc', now())
  returning * into v_candidate;

  update public.adle_canonical_intake_candidate_demands
  set link_status = 'resolved', resolved_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where candidate_id = v_candidate.id and link_status = 'waiting';

  update public.adle_canonical_intake_demands d
  set lifecycle_status = 'activated', notification_status = 'resolved',
      activated_at = coalesce(d.activated_at, timezone('utc', now())),
      notification_resolved_at = coalesce(d.notification_resolved_at, timezone('utc', now())),
      last_reconciled_at = timezone('utc', now()),
      last_reconciliation_outcome = 'all_waiting_candidates_activated',
      updated_at = timezone('utc', now())
  where exists (
    select 1 from public.adle_canonical_intake_candidate_demands l
    where l.demand_id = d.id and l.candidate_id = v_candidate.id
  ) and not exists (
    select 1 from public.adle_canonical_intake_candidate_demands waiting
    where waiting.demand_id = d.id and waiting.link_status = 'waiting'
  );

  update public.adle_canonical_intake_reconciliation_queue
  set job_status = 'completed', completed_at = timezone('utc', now()),
      lease_owner = null, lease_expires_at = null, updated_at = timezone('utc', now())
  where candidate_id = v_candidate.id and job_status in ('pending', 'leased', 'retry');

  insert into public.adle_canonical_intake_events(
    candidate_id, event_type, actor_type, readiness_fingerprint, event_payload
  ) values (
    v_candidate.id, 'candidate_activated', 'reconciler', v_candidate.readiness_fingerprint,
    jsonb_build_object('learningItemId', v_learning_item_id, 'inserted', v_inserted)
  );

  return query select v_learning_item_id, v_inserted;
end;
$$;

alter table public.adle_canonical_intake_candidates enable row level security;
alter table public.adle_canonical_intake_demands enable row level security;
alter table public.adle_canonical_intake_candidate_demands enable row level security;
alter table public.adle_canonical_intake_reconciliation_queue enable row level security;
alter table public.adle_canonical_intake_events enable row level security;

revoke all on table public.adle_canonical_intake_candidates from public, anon, authenticated;
revoke all on table public.adle_canonical_intake_demands from public, anon, authenticated;
revoke all on table public.adle_canonical_intake_candidate_demands from public, anon, authenticated;
revoke all on table public.adle_canonical_intake_reconciliation_queue from public, anon, authenticated;
revoke all on table public.adle_canonical_intake_events from public, anon, authenticated;
grant all on table public.adle_canonical_intake_candidates to service_role;
grant all on table public.adle_canonical_intake_demands to service_role;
grant all on table public.adle_canonical_intake_candidate_demands to service_role;
grant all on table public.adle_canonical_intake_reconciliation_queue to service_role;
grant all on table public.adle_canonical_intake_events to service_role;

revoke all on function public.adle_record_canonical_intake_blocked(uuid,text,uuid,text,text,text,text,text,jsonb,text,text,text) from public, anon, authenticated;
revoke all on function public.adle_enqueue_canonical_intake_candidate(uuid,text,text) from public, anon, authenticated;
revoke all on function public.adle_seed_canonical_intake_candidate(uuid,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.adle_enqueue_canonical_intake_by_target(text,text,text) from public, anon, authenticated;
revoke all on function public.adle_claim_canonical_intake_jobs(integer,text,integer) from public, anon, authenticated;
revoke all on function public.adle_persist_canonical_intake(uuid,uuid,text,uuid,uuid,text,text,text,date) from public, anon, authenticated;
grant execute on function public.adle_record_canonical_intake_blocked(uuid,text,uuid,text,text,text,text,text,jsonb,text,text,text) to service_role;
grant execute on function public.adle_enqueue_canonical_intake_candidate(uuid,text,text) to service_role;
grant execute on function public.adle_seed_canonical_intake_candidate(uuid,text,text,text,text,text) to service_role;
grant execute on function public.adle_enqueue_canonical_intake_by_target(text,text,text) to service_role;
grant execute on function public.adle_claim_canonical_intake_jobs(integer,text,integer) to service_role;
grant execute on function public.adle_persist_canonical_intake(uuid,uuid,text,uuid,uuid,text,text,text,date) to service_role;

commit;
