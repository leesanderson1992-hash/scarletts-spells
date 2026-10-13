-- A homophone contrast set needs two distinct confirmed occurrences. Other
-- contextual skills retain the existing three-confirmation policy.
begin;
alter table public.contextual_micro_skill_demands
  drop constraint contextual_micro_skill_demands_check;
update public.contextual_micro_skill_demands demand set threshold_count=2
  from public.micro_skill_catalog skill
  where skill.micro_skill_key=demand.micro_skill_key and skill.skill_family_key='D4_HOM'
    and demand.threshold_count<>2;
alter table public.contextual_micro_skill_demands
  add constraint contextual_micro_skill_demands_threshold_check
  check (confirmed_count >= 0 and threshold_count in (2,3));

-- Count a confirmed ADLE Review choice once alongside original-writing cases.
create or replace function public.reconcile_contextual_micro_skill_demand(p_child_id uuid,p_micro_skill_key text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer; v_threshold integer; v_word text; v_word_id uuid; v_existing_word_id uuid;
  v_item uuid; v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended('context-skill:'||p_child_id::text||':'||p_micro_skill_key,0));
  select case when skill_family_key='D4_HOM' then 2 else 3 end into v_threshold
    from public.micro_skill_catalog where micro_skill_key=p_micro_skill_key;
  with confirmed as (
    select distinct d.occurrence_id,
      lower(replace(replace(d.intended_member,'’',chr(39)),'ʼ',chr(39))) intended
    from public.writing_context_current_parent_decisions d
    join public.writing_occurrences o on o.id=d.occurrence_id
    join public.contextual_micro_skill_pairs p on p.micro_skill_key=p_micro_skill_key
      and p.member_a=least(lower(replace(replace(o.observed_text,'’',chr(39)),'ʼ',chr(39))),
        lower(replace(replace(d.intended_member,'’',chr(39)),'ʼ',chr(39))))
      and p.member_b=greatest(lower(replace(replace(o.observed_text,'’',chr(39)),'ʼ',chr(39))),
        lower(replace(replace(d.intended_member,'’',chr(39)),'ʼ',chr(39))))
    where d.child_id=p_child_id and d.classification='INVALID'
    union
    select distinct c.occurrence_id, lower(replace(replace(c.intended_member,'’',chr(39)),'ʼ',chr(39)))
    from public.writing_context_parent_added_cases c
    join public.writing_context_catalog_review_cases review on review.parent_added_case_id=c.id
    join public.contextual_micro_skill_case_links link on link.catalog_case_id=review.id
      and link.micro_skill_key=p_micro_skill_key
    where c.child_id=p_child_id
    union
    select distinct 'adle_review_context:'||d.finding_id::text,
      lower(replace(replace(d.intended_word,'’',chr(39)),'ʼ',chr(39)))
    from public.adle_review_context_decisions d
    join public.adle_review_context_findings f on f.id=d.finding_id
    join public.contextual_micro_skill_pairs p on p.micro_skill_key=p_micro_skill_key
      and p.member_a=least(lower(replace(replace(f.observed_text,'’',chr(39)),'ʼ',chr(39))),
        lower(replace(replace(d.intended_word,'’',chr(39)),'ʼ',chr(39))))
      and p.member_b=greatest(lower(replace(replace(f.observed_text,'’',chr(39)),'ʼ',chr(39))),
        lower(replace(replace(d.intended_word,'’',chr(39)),'ʼ',chr(39))))
    where d.child_id=p_child_id and d.action='confirm'
    union
    select distinct 'spelling_catalog:'||review.source_misspelling_instance_id::text,
      review.correct_spelling_normalized
    from public.spelling_catalog_review_cases review
    join public.contextual_spelling_catalog_case_links link on link.catalog_case_id=review.id
      and link.micro_skill_key=p_micro_skill_key
    where review.child_id=p_child_id and review.case_status='linked_existing_skill'
  )
  select count(*), (select intended from confirmed group by intended order by count(*) desc,intended limit 1)
    into v_count,v_word from confirmed;
  v_status:='BELOW_THRESHOLD';
  if v_count>=v_threshold then
    select id into v_word_id from public.canonical_teaching_dictionary_words
    where normalised_word=v_word and row_status='active'
      and review_status='approved_for_first_exposure' order by id limit 1;
    if v_word_id is null or exists (
      select 1 from public.contextual_micro_skill_members m
      where m.micro_skill_key=p_micro_skill_key and not exists (
        select 1 from public.canonical_teaching_dictionary_words w
        join public.canonical_teaching_dictionary_word_support s on s.canonical_word_id=w.id
          and s.micro_skill_key=p_micro_skill_key and s.row_status='active'
          and s.review_status='approved_for_first_exposure'
        where w.normalised_word=m.member_normalized and w.row_status='active'
          and w.review_status='approved_for_first_exposure'
      )) then v_status:='PENDING_WORD_SUPPORT';
    elsif not exists(select 1 from public.adle_family_methods method
      join public.micro_skill_catalog skill on skill.skill_family_key=method.family_key
      where skill.micro_skill_key=p_micro_skill_key and method.row_status='active')
    then v_status:='PENDING_TEACHING_CONTENT';
    elsif not exists(select 1 from public.canonical_teaching_dictionary_content_versions c
      where c.micro_skill_key=p_micro_skill_key and c.is_active=true
        and c.version_status='active' and c.final_readiness_review_status='signed_off')
    then v_status:='PENDING_TEACHING_CONTENT';
    elsif exists(select 1 from public.adle_learning_items i where i.child_id=p_child_id
      and i.micro_skill_key=p_micro_skill_key and i.row_status='active'
      and i.item_status in ('in_lesson','awaiting_review_outcome','resolved'))
    then v_status:='PENDING_EXISTING_ITEM_REVIEW';
    else
      select id,canonical_word_id into v_item,v_existing_word_id from public.adle_learning_items i where i.child_id=p_child_id
        and i.micro_skill_key=p_micro_skill_key and i.row_status='active'
      order by created_at,id limit 1;
      if v_item is not null then v_word_id:=v_existing_word_id; end if;
      if v_item is null then
        insert into public.adle_learning_items(child_id,canonical_word_id,micro_skill_key,item_status,
          source_kind,source_ref,reteach_priority,intake_on,row_status)
        values(p_child_id,v_word_id,p_micro_skill_key,'pending','parent_verified_contextual_choice',
          'contextual_skill_threshold:'||p_child_id::text||':'||p_micro_skill_key,false,current_date,'active')
        on conflict do nothing returning id into v_item;
      end if;
      if v_item is not null then
        update public.adle_learning_items set item_status='pending',updated_at=clock_timestamp()
          where id=v_item and item_status='paused_parent_review'
            and source_kind='parent_verified_contextual_choice';
      end if;
      if v_item is not null then v_status:='READY'; else v_status:='PENDING_EXISTING_ITEM_REVIEW'; end if;
    end if;
  else
    update public.adle_learning_items set item_status='paused_parent_review',updated_at=clock_timestamp()
      where child_id=p_child_id and micro_skill_key=p_micro_skill_key and row_status='active'
        and source_kind='parent_verified_contextual_choice' and item_status='pending';
  end if;
  if v_status in ('PENDING_WORD_SUPPORT','PENDING_TEACHING_CONTENT') then
    update public.adle_learning_items set item_status='paused_parent_review',updated_at=clock_timestamp()
      where child_id=p_child_id and micro_skill_key=p_micro_skill_key and row_status='active'
        and source_kind='parent_verified_contextual_choice' and item_status='pending';
  end if;
  insert into public.contextual_micro_skill_demands(child_id,micro_skill_key,confirmed_count,threshold_count,
    demand_status,canonical_word_id,adle_learning_item_id)
  values(p_child_id,p_micro_skill_key,v_count,v_threshold,v_status,v_word_id,v_item)
  on conflict(child_id,micro_skill_key) do update set confirmed_count=excluded.confirmed_count,
    threshold_count=excluded.threshold_count,demand_status=excluded.demand_status,canonical_word_id=excluded.canonical_word_id,
    adle_learning_item_id=coalesce(excluded.adle_learning_item_id,public.contextual_micro_skill_demands.adle_learning_item_id),
    updated_at=clock_timestamp();
end $$;

-- The per-issue handoff uses the same threshold and cannot create a second
-- word-level item while this contrast set is in a lesson or review.
create or replace function public.reconcile_contextual_adle_learning_need(
  p_writing_issue_id uuid,p_parent_user_id uuid,p_child_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.writing_issues%rowtype; v_count integer; v_threshold integer;
begin
  select * into v_issue from public.writing_issues where id=p_writing_issue_id
    and parent_user_id=p_parent_user_id and child_id=p_child_id;
  if v_issue.id is null or v_issue.metadata->>'source_kind'<>'contextual_advisory_v4'
  then raise exception 'contextual_handoff_source_invalid'; end if;
  select confirmed_count,threshold_count into v_count,v_threshold from public.contextual_micro_skill_demands
    where child_id=p_child_id and micro_skill_key=v_issue.micro_skill_key;
  if coalesce(v_count,0)<coalesce(v_threshold,3) then
    return jsonb_build_object('handoff_state','PENDING_THRESHOLD',
      'blocker_code',case when v_threshold=2 then 'TWO_CONFIRMATIONS_REQUIRED' else 'THREE_CONFIRMATIONS_REQUIRED' end,
      'confirmed_count',coalesce(v_count,0),'adle_learning_item_id',null);
  end if;
  if exists(select 1 from public.adle_learning_items item
    where item.child_id=p_child_id and item.micro_skill_key=v_issue.micro_skill_key
      and item.row_status='active'
      and item.item_status in ('in_lesson','awaiting_review_outcome','resolved')) then
    return jsonb_build_object('handoff_state','PENDING_EXISTING_ITEM_REVIEW',
      'blocker_code','HOMOPHONE_LESSON_ALREADY_IN_REVIEW','adle_learning_item_id',null);
  end if;
  return public.reconcile_contextual_adle_learning_need_pre_skill_threshold(
    p_writing_issue_id,p_parent_user_id,p_child_id);
end $$;

-- Re-evaluate prior one- and two-instance demands against the new threshold.
do $$
declare v record;
begin
  for v in select child_id,micro_skill_key from public.contextual_micro_skill_demands loop
    perform public.reconcile_contextual_micro_skill_demand(v.child_id,v.micro_skill_key);
  end loop;
end $$;
commit;
