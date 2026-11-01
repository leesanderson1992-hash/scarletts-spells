begin;

-- A resolver supersession is a change to future teaching authority. Record it
-- separately from the immutable spelling and learner evidence that preceded it.
create table public.adle_resolver_change_reconciliations (
  id uuid primary key default gen_random_uuid(),
  sequence_number bigint generated always as identity unique,
  old_mapping_id uuid not null unique references public.spelling_canonical_mappings(id) on delete restrict,
  new_mapping_id uuid not null references public.spelling_canonical_mappings(id) on delete restrict,
  misspelling_normalized text not null,
  correct_spelling_normalized text not null,
  dialect_code text not null,
  normalization_version text not null,
  old_micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  new_micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  requested_by uuid references auth.users(id) on delete set null,
  reason text not null,
  reconciliation_status text not null default 'pending'
    check (reconciliation_status in ('pending','processing','complete','needs_review')),
  affected_candidate_count integer not null default 0,
  moved_need_count integer not null default 0,
  issued_need_count integer not null default 0,
  last_error_code text,
  created_at timestamptz not null default timezone('utc',now()),
  completed_at timestamptz,
  check (old_micro_skill_key<>new_micro_skill_key),
  check (length(btrim(reason))>=12)
);
create index adle_resolver_change_reconciliations_pending_idx
  on public.adle_resolver_change_reconciliations(created_at,id)
  where reconciliation_status in ('pending','processing');
alter table public.adle_resolver_change_reconciliations enable row level security;
revoke all on public.adle_resolver_change_reconciliations from public,anon,authenticated;
grant select,insert,update on public.adle_resolver_change_reconciliations to service_role;

create table public.adle_resolver_change_source_outcomes (
  id uuid primary key default gen_random_uuid(),
  change_id uuid not null references public.adle_resolver_change_reconciliations(id) on delete restrict,
  source_candidate_mapping_id uuid not null references public.parent_verified_spelling_candidate_mappings(id) on delete restrict,
  old_learning_item_id uuid references public.adle_learning_items(id) on delete restrict,
  new_learning_item_id uuid references public.adle_learning_items(id) on delete restrict,
  outcome text not null check (outcome in ('moved','requeued','issued_pinned','needs_review')),
  reason text not null,
  created_at timestamptz not null default timezone('utc',now()),
  unique(change_id,source_candidate_mapping_id)
);
create index adle_resolver_change_source_latest_idx on public.adle_resolver_change_source_outcomes
  (source_candidate_mapping_id,created_at desc,id desc);
alter table public.adle_resolver_change_source_outcomes enable row level security;
revoke all on public.adle_resolver_change_source_outcomes from public,anon,authenticated;
grant select,insert on public.adle_resolver_change_source_outcomes to service_role;

-- Enqueue only when the replacement becomes resolver-visible. The old and new
-- mappings, exact spelling pair and actor are locked into the receipt.
create function public.adle_record_visible_resolver_change_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare old_mapping public.spelling_canonical_mappings%rowtype;
begin
  if new.mapping_status<>'active' or new.resolver_visibility_status<>'visible'
    or old.resolver_visibility_status='visible' then return new; end if;
  select * into old_mapping from public.spelling_canonical_mappings
    where replacement_mapping_id=new.id and mapping_status='superseded';
  if old_mapping.id is null then return new; end if;
  if old_mapping.micro_skill_key=new.micro_skill_key then return new; end if;
  if old_mapping.misspelling_normalized<>new.misspelling_normalized
    or old_mapping.correct_spelling_normalized<>new.correct_spelling_normalized
    or old_mapping.dialect_code<>new.dialect_code
    or old_mapping.normalization_version<>new.normalization_version
    then raise exception 'Resolver supersession changed its exact spelling identity'; end if;
  insert into public.adle_resolver_change_reconciliations(
    old_mapping_id,new_mapping_id,misspelling_normalized,correct_spelling_normalized,
    dialect_code,normalization_version,old_micro_skill_key,new_micro_skill_key,
    requested_by,reason)
  values(old_mapping.id,new.id,new.misspelling_normalized,new.correct_spelling_normalized,
    new.dialect_code,new.normalization_version,old_mapping.micro_skill_key,new.micro_skill_key,
    case when exists(select 1 from auth.users u where u.id=new.created_by_admin_user_id)
      then new.created_by_admin_user_id else null end,
    coalesce(nullif(btrim(new.decision_note),''),
      'Visible exact resolver mapping supersession'))
  on conflict(old_mapping_id) do nothing;
  return new;
end $$;
create trigger adle_record_visible_resolver_change
after update of resolver_visibility_status on public.spelling_canonical_mappings
for each row execute function public.adle_record_visible_resolver_change_v1();
revoke all on function public.adle_record_visible_resolver_change_v1() from public,anon,authenticated;

-- A newly generated lesson may not select an old skill while its exact
-- resolver source has a visible replacement. Existing assignment rows are
-- immutable and continue with their pinned payloads.
create function public.adle_guard_stale_resolver_assignment_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare item_id uuid; skill_key text;
begin
  if new.domain_module<>'spelling' then return new; end if;
  skill_key:=new.metadata->>'microSkillKey';
  if skill_key is null then return new; end if;
  if nullif(coalesce(new.metadata->>'adleLearningItemRef',
    new.metadata->>'learningItemId'),'') is not null then
    item_id:=coalesce(new.metadata->>'adleLearningItemRef',
      new.metadata->>'learningItemId')::uuid;
  end if;
  if exists (
    select 1 from public.adle_learning_items item
    join public.adle_learning_item_sources source on source.learning_item_id=item.id
      and source.row_status='active'
    join public.spelling_canonical_mappings old_mapping on old_mapping.id=source.canonical_mapping_id
    join public.spelling_canonical_mappings replacement on replacement.id=old_mapping.replacement_mapping_id
    where item.child_id=new.child_id and item.micro_skill_key=skill_key
      and item.row_status='active' and (item_id is null or item.id=item_id)
      and old_mapping.mapping_status='superseded'
      and replacement.mapping_status='active'
      and replacement.resolver_visibility_status='visible'
      and replacement.micro_skill_key<>item.micro_skill_key
  ) then raise exception 'ADLE_RESOLVER_RECONCILIATION_REQUIRED'; end if;
  return new;
end $$;
create trigger adle_guard_stale_resolver_assignment
before insert on public.assignment_items
for each row execute function public.adle_guard_stale_resolver_assignment_v1();
revoke all on function public.adle_guard_stale_resolver_assignment_v1() from public,anon,authenticated;

create function public.adle_process_resolver_changes_v1(p_limit integer default 20)
returns table(change_id uuid, outcome text) language plpgsql security definer
set search_path=public,pg_temp as $$
declare
  change_row public.adle_resolver_change_reconciliations%rowtype;
  candidate public.adle_canonical_intake_candidates%rowtype;
  source_row public.adle_learning_item_sources%rowtype;
  old_item public.adle_learning_items%rowtype;
  new_item_id uuid;
  issued_count integer;
  remaining_count integer;
  moved_count integer;
  pinned_count integer;
  affected_count integer;
  route record;
begin
  if p_limit not between 1 and 100 then raise exception 'Invalid resolver reconciliation limit'; end if;
  for change_row in select * from public.adle_resolver_change_reconciliations
    where reconciliation_status='pending' order by created_at,id limit p_limit for update skip locked
  loop
    change_id:=change_row.id;
    moved_count:=0; pinned_count:=0; affected_count:=0;
    begin
      if not exists(select 1 from public.spelling_canonical_mappings m
        where m.id=change_row.new_mapping_id and m.mapping_status='active'
          and m.resolver_visibility_status='visible') then
        update public.adle_resolver_change_reconciliations
          set reconciliation_status='needs_review',last_error_code='replacement_not_visible'
          where id=change_row.id;
        outcome:='replacement_not_visible'; return next; continue;
      end if;
      for candidate in select c.* from public.adle_canonical_intake_candidates c
        join public.parent_verified_spelling_candidate_mappings p on p.id=c.source_candidate_mapping_id
        where p.misspelling_normalized=change_row.misspelling_normalized
          and p.correct_spelling_normalized=change_row.correct_spelling_normalized
          and c.micro_skill_key=change_row.old_micro_skill_key
          and c.candidate_state not in ('rejected','superseded')
        order by c.id for update of c
      loop
        affected_count:=affected_count+1;
        if exists(select 1 from public.adle_resolver_change_source_outcomes x
          where x.change_id=change_row.id and x.source_candidate_mapping_id=candidate.source_candidate_mapping_id)
          then continue; end if;
        if candidate.learning_item_id is null then
          update public.adle_canonical_intake_candidates set micro_skill_key=change_row.new_micro_skill_key,
            candidate_state='queued',blockers='[]'::jsonb,readiness_fingerprint='not_evaluated',
            lock_version=lock_version+1,updated_at=timezone('utc',now()) where id=candidate.id;
          update public.adle_canonical_intake_candidate_demands set link_status='superseded',
            resolved_at=timezone('utc',now()),updated_at=timezone('utc',now())
            where candidate_id=candidate.id and link_status='waiting';
          update public.adle_canonical_intake_demands d set lifecycle_status='superseded',
            resolution_note='Resolver changed under reconciliation '||change_row.id::text,
            updated_at=timezone('utc',now())
            where d.micro_skill_key=change_row.old_micro_skill_key
              and d.normalized_target_token=change_row.correct_spelling_normalized
              and d.lifecycle_status in ('pending','in_review','content_ready','reconciling')
              and exists(select 1 from public.adle_canonical_intake_candidate_demands l
                where l.demand_id=d.id and l.candidate_id=candidate.id)
              and not exists(select 1 from public.adle_canonical_intake_candidate_demands l
                where l.demand_id=d.id and l.link_status='waiting');
          insert into public.adle_resolver_change_source_outcomes
            (change_id,source_candidate_mapping_id,outcome,reason)
            values(change_row.id,candidate.source_candidate_mapping_id,'requeued',change_row.reason);
          perform public.adle_enqueue_canonical_intake_candidate(candidate.id,
            'resolver_change','change:'||change_row.id::text);
          continue;
        end if;
        select * into old_item from public.adle_learning_items
          where id=candidate.learning_item_id for update;
        if old_item.id is null or old_item.row_status<>'active'
          or old_item.micro_skill_key<>change_row.old_micro_skill_key then
          raise exception 'Source learning item identity changed'; end if;
        select count(*) into issued_count from public.assignment_items a
          where a.child_id=old_item.child_id and (
            a.metadata::text like '%'||old_item.id::text||'%'
            or a.prompt_data::text like '%'||old_item.id::text||'%');
        if issued_count>0 or exists(select 1 from public.adle_review_outcome_event_routes r
          where r.learning_item_id=old_item.id) then
          pinned_count:=pinned_count+1;
          insert into public.adle_resolver_change_source_outcomes
            (change_id,source_candidate_mapping_id,old_learning_item_id,outcome,reason)
            values(change_row.id,candidate.source_candidate_mapping_id,old_item.id,'issued_pinned',
              'An issued lesson or review outcome remains pinned; future work uses the replacement mapping');
          continue;
        end if;
        select * into source_row from public.adle_learning_item_sources
          where learning_item_id=old_item.id
            and parent_verified_candidate_mapping_id=candidate.source_candidate_mapping_id
            and row_status='active' for update;
        if source_row.id is null or source_row.canonical_mapping_id<>change_row.old_mapping_id
          then raise exception 'Exact active learner source is missing'; end if;
        select id into new_item_id from public.adle_learning_items
          where child_id=old_item.child_id and canonical_word_id=old_item.canonical_word_id
            and micro_skill_key=change_row.new_micro_skill_key and row_status='active'
          order by intake_on,id limit 1 for update;
        if new_item_id is null then
          insert into public.adle_learning_items(child_id,canonical_word_id,micro_skill_key,item_status,
            source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status)
          values(old_item.child_id,old_item.canonical_word_id,change_row.new_micro_skill_key,
            old_item.item_status,old_item.source_kind,old_item.source_ref,old_item.source_attempt_text,
            old_item.reteach_priority,old_item.ejected_on,old_item.intake_on,'active') returning id into new_item_id;
        else
          update public.adle_learning_items set intake_on=least(intake_on,old_item.intake_on),
            reteach_priority=reteach_priority or old_item.reteach_priority,
            item_status=case when array_position(array['pending_reteach','paused_parent_review',
                'pending','in_lesson','awaiting_review_outcome','resolved'],old_item.item_status)
              < array_position(array['pending_reteach','paused_parent_review',
                'pending','in_lesson','awaiting_review_outcome','resolved'],item_status)
              then old_item.item_status else item_status end where id=new_item_id;
        end if;
        insert into public.adle_learning_item_sources(learning_item_id,parent_verified_candidate_mapping_id,
          canonical_mapping_id,misspelling_normalized,correct_spelling_normalized,
          micro_skill_key,source_ref,row_status)
        values(new_item_id,candidate.source_candidate_mapping_id,change_row.new_mapping_id,
          source_row.misspelling_normalized,source_row.correct_spelling_normalized,
          change_row.new_micro_skill_key,source_row.source_ref,'active')
        on conflict(learning_item_id,source_ref) do nothing;
        if not exists(select 1 from public.adle_learning_item_sources s
          where s.learning_item_id=new_item_id and s.source_ref=source_row.source_ref
            and s.canonical_mapping_id=change_row.new_mapping_id and s.row_status='active')
          then raise exception 'Destination source-ref conflict'; end if;
        update public.adle_learning_item_sources set row_status='superseded' where id=source_row.id;
        select count(*) into remaining_count from public.adle_learning_item_sources
          where learning_item_id=old_item.id and row_status='active';
        for route in select * from public.adle_review_schedule_word_routes
          where learning_item_id=old_item.id and row_status='active' for update
        loop
          insert into public.adle_review_schedule_word_routes(schedule_word_id,learning_item_id,
            micro_skill_key,attached_on,attachment_ordinal,row_status)
          values(route.schedule_word_id,new_item_id,change_row.new_micro_skill_key,
            route.attached_on,route.attachment_ordinal,'active')
          on conflict do nothing;
          if not exists(select 1 from public.adle_review_schedule_word_routes r
            where r.schedule_word_id=route.schedule_word_id
              and r.learning_item_id=new_item_id and r.row_status='active'
              and r.attached_on=route.attached_on) then
            raise exception 'Destination review route did not retain its scheduled date';
          end if;
          if remaining_count=0 then update public.adle_review_schedule_word_routes
            set row_status='superseded' where id=route.id; end if;
        end loop;
        if remaining_count=0 then update public.adle_learning_items
          set row_status='superseded' where id=old_item.id; end if;
        update public.adle_canonical_intake_candidates set micro_skill_key=change_row.new_micro_skill_key,
          learning_item_id=new_item_id,lock_version=lock_version+1,
          updated_at=timezone('utc',now()) where id=candidate.id;
        moved_count:=moved_count+1;
        insert into public.adle_resolver_change_source_outcomes
          (change_id,source_candidate_mapping_id,old_learning_item_id,new_learning_item_id,outcome,reason)
        values(change_row.id,candidate.source_candidate_mapping_id,old_item.id,new_item_id,'moved',change_row.reason);
      end loop;
      -- Some approved learner sources predate the canonical-intake candidate
      -- table. They are still active demand and must follow the exact resolver
      -- mapping even though there is no candidate row to requeue.
      for source_row in select s.* from public.adle_learning_item_sources s
        join public.adle_learning_items item on item.id=s.learning_item_id
        where s.canonical_mapping_id=change_row.old_mapping_id and s.row_status='active'
          and s.parent_verified_candidate_mapping_id is not null
          and item.row_status='active' and item.micro_skill_key=change_row.old_micro_skill_key
          and not exists(select 1 from public.adle_canonical_intake_candidates c
            where c.source_candidate_mapping_id=s.parent_verified_candidate_mapping_id)
        order by s.id for update of s
      loop
        affected_count:=affected_count+1;
        select * into old_item from public.adle_learning_items
          where id=source_row.learning_item_id for update;
        select count(*) into issued_count from public.assignment_items a
          where a.child_id=old_item.child_id and (
            a.metadata::text like '%'||old_item.id::text||'%'
            or a.prompt_data::text like '%'||old_item.id::text||'%');
        if issued_count>0 or exists(select 1 from public.adle_review_outcome_event_routes r
          where r.learning_item_id=old_item.id) then
          pinned_count:=pinned_count+1;
          insert into public.adle_resolver_change_source_outcomes
            (change_id,source_candidate_mapping_id,old_learning_item_id,outcome,reason)
          values(change_row.id,source_row.parent_verified_candidate_mapping_id,old_item.id,
            'issued_pinned','An issued lesson remains pinned; future work uses the replacement mapping');
          continue;
        end if;
        select id into new_item_id from public.adle_learning_items
          where child_id=old_item.child_id and canonical_word_id=old_item.canonical_word_id
            and micro_skill_key=change_row.new_micro_skill_key and row_status='active'
          order by intake_on,id limit 1 for update;
        if new_item_id is null then
          insert into public.adle_learning_items(child_id,canonical_word_id,micro_skill_key,item_status,
            source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status)
          values(old_item.child_id,old_item.canonical_word_id,change_row.new_micro_skill_key,
            old_item.item_status,old_item.source_kind,old_item.source_ref,old_item.source_attempt_text,
            old_item.reteach_priority,old_item.ejected_on,old_item.intake_on,'active') returning id into new_item_id;
        else
          update public.adle_learning_items set intake_on=least(intake_on,old_item.intake_on),
            reteach_priority=reteach_priority or old_item.reteach_priority,
            item_status=case when array_position(array['pending_reteach','paused_parent_review',
                'pending','in_lesson','awaiting_review_outcome','resolved'],old_item.item_status)
              < array_position(array['pending_reteach','paused_parent_review',
                'pending','in_lesson','awaiting_review_outcome','resolved'],item_status)
              then old_item.item_status else item_status end where id=new_item_id;
        end if;
        insert into public.adle_learning_item_sources(learning_item_id,parent_verified_candidate_mapping_id,
          canonical_mapping_id,misspelling_normalized,correct_spelling_normalized,
          micro_skill_key,source_ref,row_status)
        values(new_item_id,source_row.parent_verified_candidate_mapping_id,change_row.new_mapping_id,
          source_row.misspelling_normalized,source_row.correct_spelling_normalized,
          change_row.new_micro_skill_key,source_row.source_ref,'active')
        on conflict(learning_item_id,source_ref) do nothing;
        if not exists(select 1 from public.adle_learning_item_sources s
          where s.learning_item_id=new_item_id and s.source_ref=source_row.source_ref
            and s.canonical_mapping_id=change_row.new_mapping_id and s.row_status='active')
          then raise exception 'Destination source-ref conflict'; end if;
        update public.adle_learning_item_sources set row_status='superseded' where id=source_row.id;
        select count(*) into remaining_count from public.adle_learning_item_sources
          where learning_item_id=old_item.id and row_status='active';
        for route in select * from public.adle_review_schedule_word_routes
          where learning_item_id=old_item.id and row_status='active' for update
        loop
          insert into public.adle_review_schedule_word_routes(schedule_word_id,learning_item_id,
            micro_skill_key,attached_on,attachment_ordinal,row_status)
          values(route.schedule_word_id,new_item_id,change_row.new_micro_skill_key,
            route.attached_on,route.attachment_ordinal,'active')
          on conflict do nothing;
          if not exists(select 1 from public.adle_review_schedule_word_routes r
            where r.schedule_word_id=route.schedule_word_id
              and r.learning_item_id=new_item_id and r.row_status='active'
              and r.attached_on=route.attached_on) then
            raise exception 'Destination review route did not retain its scheduled date';
          end if;
          if remaining_count=0 then update public.adle_review_schedule_word_routes
            set row_status='superseded' where id=route.id; end if;
        end loop;
        if remaining_count=0 then update public.adle_learning_items
          set row_status='superseded' where id=old_item.id; end if;
        moved_count:=moved_count+1;
        insert into public.adle_resolver_change_source_outcomes
          (change_id,source_candidate_mapping_id,old_learning_item_id,new_learning_item_id,outcome,reason)
        values(change_row.id,source_row.parent_verified_candidate_mapping_id,old_item.id,
          new_item_id,'moved',change_row.reason);
      end loop;
      update public.adle_resolver_change_reconciliations set reconciliation_status='complete',
        affected_candidate_count=affected_count,moved_need_count=moved_count,
        issued_need_count=pinned_count,completed_at=timezone('utc',now()),last_error_code=null
        where id=change_row.id;
      outcome:='complete'; return next;
    exception when others then
      update public.adle_resolver_change_reconciliations set reconciliation_status='needs_review'
        ,last_error_code=sqlstate
        where id=change_row.id;
      outcome:='needs_review:'||sqlstate; return next;
    end;
  end loop;
end $$;
revoke all on function public.adle_process_resolver_changes_v1(integer) from public,anon,authenticated;
grant execute on function public.adle_process_resolver_changes_v1(integer) to service_role;

create or replace function public.adle_effective_pending_intake_skill_v1(
  p_source_id uuid,p_requested_skill text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1 from public.parent_verified_spelling_candidate_mappings source
    left join public.adle_pending_intake_skill_reclassifications legacy
      on legacy.source_candidate_mapping_id=source.id
    left join lateral (
      select change.new_micro_skill_key
      from public.adle_resolver_change_source_outcomes result
      join public.adle_resolver_change_reconciliations change on change.id=result.change_id
      where result.source_candidate_mapping_id=source.id
        and result.outcome in ('moved','requeued')
      order by change.sequence_number desc limit 1
    ) current_route on true
    where source.id=p_source_id
      and source.candidate_status in ('parent_local_promoted','global_canonical_promoted')
      and coalesce(current_route.new_micro_skill_key,legacy.new_micro_skill_key,
        source.micro_skill_key)=p_requested_skill
  );
$$;
revoke all on function public.adle_effective_pending_intake_skill_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.adle_effective_pending_intake_skill_v1(uuid,text)
  to service_role;

commit;
