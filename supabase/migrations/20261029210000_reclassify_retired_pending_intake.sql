begin;

-- A parent approval is historical evidence.  This receipt changes only the
-- effective route of an unactivated intake candidate after new authority has
-- been checked.  It is never an inferred transfer of a word-skill approval.
create table public.adle_pending_intake_skill_reclassifications (
  id uuid primary key default gen_random_uuid(),
  source_candidate_mapping_id uuid not null unique references public.parent_verified_spelling_candidate_mappings(id) on delete restrict,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  old_micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  new_micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  resolver_mapping_id uuid not null references public.spelling_canonical_mappings(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default timezone('utc',now()),
  constraint adle_pending_intake_reclass_distinct check (old_micro_skill_key<>new_micro_skill_key),
  constraint adle_pending_intake_reclass_reason check (length(btrim(reason))>=12)
);
alter table public.adle_pending_intake_skill_reclassifications enable row level security;
revoke all on public.adle_pending_intake_skill_reclassifications from public,anon,authenticated;
grant select,insert on public.adle_pending_intake_skill_reclassifications to service_role;

create function public.adle_effective_pending_intake_skill_v1(p_source_id uuid, p_requested_skill text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1 from public.parent_verified_spelling_candidate_mappings source
    left join public.adle_pending_intake_skill_reclassifications receipt
      on receipt.source_candidate_mapping_id=source.id
    where source.id=p_source_id and source.candidate_status in ('parent_local_promoted','global_canonical_promoted')
      and ((receipt.id is null and source.micro_skill_key=p_requested_skill) or (
        receipt.old_micro_skill_key=source.micro_skill_key
        and receipt.new_micro_skill_key=p_requested_skill
      ))
  );
$$;
revoke all on function public.adle_effective_pending_intake_skill_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.adle_effective_pending_intake_skill_v1(uuid,text) to service_role;

create function public.adle_reclassify_retired_pending_intake_v1(
  p_source_id uuid, p_new_skill text, p_resolver_mapping_id uuid,
  p_actor_user_id uuid, p_reason text
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  source public.parent_verified_spelling_candidate_mappings%rowtype;
  candidate public.adle_canonical_intake_candidates%rowtype;
  word public.canonical_teaching_dictionary_words%rowtype;
  prior public.adle_pending_intake_skill_reclassifications%rowtype;
  receipt_id uuid;
  word_count integer;
  old_demand record;
begin
  if length(btrim(coalesce(p_reason,'')))<12 then raise exception 'Reclassification requires an audit reason'; end if;
  select * into source from public.parent_verified_spelling_candidate_mappings where id=p_source_id for update;
  if source.id is null or source.candidate_status not in ('parent_local_promoted','global_canonical_promoted')
    then raise exception 'Source is not an approved pending spelling candidate'; end if;
  select * into candidate from public.adle_canonical_intake_candidates
    where source_candidate_mapping_id=p_source_id for update;
  if candidate.id is null or candidate.candidate_state not in ('queued','pending_mapping','pending_content','error_retryable')
    or candidate.learning_item_id is not null or candidate.activated_at is not null
    then raise exception 'Only unactivated pending intake can be reclassified'; end if;
  if not exists(select 1 from public.micro_skill_catalog where micro_skill_key=source.micro_skill_key and not is_active)
    then raise exception 'Original micro-skill is not retired'; end if;
  select count(*) into word_count from public.canonical_teaching_dictionary_words
    where normalised_word=source.correct_spelling_normalized and row_status='active';
  if word_count<>1 then raise exception 'Canonical word identity is not singular'; end if;
  select * into word from public.canonical_teaching_dictionary_words
    where normalised_word=source.correct_spelling_normalized and row_status='active'
      and review_status='approved_for_first_exposure';
  if word.id is null then raise exception 'Approved canonical word is missing'; end if;
  if exists(select 1 from public.teaching_dictionary_pair_latest_decisions
    where environment_key='production' and canonical_word_id=word.id
      and micro_skill_key=p_new_skill and action='deassign')
    then raise exception 'New word-skill relationship was deassigned'; end if;
  if not exists(select 1 from public.micro_skill_catalog
    where micro_skill_key=p_new_skill and is_active and is_assignable)
    then raise exception 'Replacement skill is not active and assignable'; end if;
  if not exists(select 1 from public.spelling_canonical_mappings mapping
    where mapping.id=p_resolver_mapping_id and mapping.mapping_status='active'
      and mapping.resolver_visibility_status='visible' and mapping.micro_skill_key=p_new_skill
      and mapping.misspelling_normalized=source.misspelling_normalized
      and mapping.correct_spelling_normalized=source.correct_spelling_normalized
      and exists(select 1 from public.spelling_canonical_mapping_events event
        where event.mapping_id=mapping.id and event.event_type='resolver_visibility_enabled'
          and event.new_resolver_visibility_status='visible'))
    then raise exception 'Exact approved resolver mapping is missing'; end if;
  select * into prior from public.adle_pending_intake_skill_reclassifications
    where source_candidate_mapping_id=p_source_id;
  if prior.id is not null then
    if prior.new_micro_skill_key<>p_new_skill or prior.resolver_mapping_id<>p_resolver_mapping_id
      then raise exception 'Pending intake has a different reclassification receipt'; end if;
    return prior.id;
  end if;
  insert into public.adle_pending_intake_skill_reclassifications
    (source_candidate_mapping_id,canonical_word_id,old_micro_skill_key,new_micro_skill_key,
      resolver_mapping_id,actor_user_id,reason)
  values (p_source_id,word.id,source.micro_skill_key,p_new_skill,p_resolver_mapping_id,
    p_actor_user_id,btrim(p_reason)) returning id into receipt_id;
  -- The candidate remains queued until the normal readiness evaluator names
  -- its current content blocker.  It retains its source and first-seen date.
  update public.adle_canonical_intake_candidates set micro_skill_key=p_new_skill,
    candidate_state='queued',blockers='[]'::jsonb,readiness_fingerprint='not_evaluated',
    updated_at=timezone('utc',now()),lock_version=lock_version+1 where id=candidate.id;
  update public.adle_canonical_intake_candidate_demands set link_status='superseded',
    resolved_at=timezone('utc',now()),updated_at=timezone('utc',now())
    where candidate_id=candidate.id and link_status='waiting';
  for old_demand in select demand.id from public.adle_canonical_intake_demands demand
    where demand.micro_skill_key=source.micro_skill_key
      and demand.normalized_target_token=source.correct_spelling_normalized
      and demand.lifecycle_status in ('pending','in_review','content_ready','reconciling')
      and not exists(select 1 from public.adle_canonical_intake_candidate_demands link
        where link.demand_id=demand.id and link.link_status='waiting') for update
  loop
    update public.adle_canonical_intake_demands set lifecycle_status='superseded',
      resolution_note='Pending intake moved to '||p_new_skill||' under receipt '||receipt_id::text,
      updated_at=timezone('utc',now()) where id=old_demand.id;
    insert into public.adle_canonical_intake_events(candidate_id,demand_id,event_type,actor_type,
      actor_user_id,event_payload)
    values(candidate.id,old_demand.id,'retired_skill_demand_superseded','admin',p_actor_user_id,
      jsonb_build_object('receiptId',receipt_id,'newMicroSkillKey',p_new_skill));
  end loop;
  insert into public.adle_canonical_intake_events(candidate_id,event_type,actor_type,actor_user_id,event_payload)
    values(candidate.id,'pending_skill_reclassified','admin',p_actor_user_id,
      jsonb_build_object('receiptId',receipt_id,'oldMicroSkillKey',source.micro_skill_key,
        'newMicroSkillKey',p_new_skill,'resolverMappingId',p_resolver_mapping_id));
  perform public.adle_enqueue_canonical_intake_candidate(candidate.id,'retired_skill_reclassification',
    'receipt:'||receipt_id::text);
  return receipt_id;
end $$;
revoke all on function public.adle_reclassify_retired_pending_intake_v1(uuid,text,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.adle_reclassify_retired_pending_intake_v1(uuid,text,uuid,uuid,text) to service_role;

-- Existing delegates still validate the immutable parent source.  Permit the
-- effective skill only through the receipt and its live resolver authority.
do $patch$
declare name text; signature text; definition text; old_check text; new_check text;
begin
  foreach name in array array[
    'adle_seed_canonical_intake_candidate_r8b_delegate',
    'adle_record_canonical_intake_blocked_r8b_delegate',
    'adle_persist_canonical_intake_r8b_delegate'] loop
    select pg_get_functiondef(p.oid) into definition from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name;
    if definition is null then raise exception 'Missing canonical intake delegate %',name; end if;
    if name='adle_persist_canonical_intake_r8b_delegate' then
      old_check:='and c.micro_skill_key = p_micro_skill_key';
      new_check:='and public.adle_effective_pending_intake_skill_v1(c.id,p_micro_skill_key)';
    else
      old_check:='v_source.micro_skill_key <> p_micro_skill_key';
      new_check:='not public.adle_effective_pending_intake_skill_v1(v_source.id,p_micro_skill_key)';
    end if;
    if position(old_check in definition)=0 or position(new_check in definition)>0
      then raise exception 'Canonical intake delegate % differs from reviewed predecessor',name; end if;
    definition:=replace(definition,old_check,new_check);
    execute definition;
  end loop;
end $patch$;
commit;
