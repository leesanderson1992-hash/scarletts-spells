begin;

-- A reviewed word set is curriculum routing authority. It is separate from
-- canonical misspellings, which must never rewrite a valid word globally.
create table public.contextual_micro_skill_members (
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  member_normalized text not null,
  member_display text not null,
  approved_by_admin_user_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  primary key (micro_skill_key, member_normalized),
  check (member_normalized = lower(replace(replace(member_display, '’', chr(39)), 'ʼ', chr(39)))),
  check (member_normalized ~ '^[[:alpha:]][[:alpha:]''-]*$')
);
create table public.contextual_micro_skill_pairs (
  id uuid not null default gen_random_uuid() unique,
  dialect_code text not null default 'en-GB',
  member_a text not null,
  member_b text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  approved_by_admin_user_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  primary key (dialect_code, member_a, member_b),
  check (member_a < member_b),
  foreign key (micro_skill_key, member_a) references public.contextual_micro_skill_members(micro_skill_key, member_normalized),
  foreign key (micro_skill_key, member_b) references public.contextual_micro_skill_members(micro_skill_key, member_normalized)
);
create index contextual_micro_skill_pairs_skill_idx on public.contextual_micro_skill_pairs(micro_skill_key);
create table public.contextual_micro_skill_case_links (
  catalog_case_id uuid primary key references public.writing_context_catalog_review_cases(id) on delete cascade,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  approved_by_admin_user_id uuid,
  linked_at timestamptz not null default clock_timestamp()
);
create table public.contextual_spelling_catalog_case_links (
  catalog_case_id uuid primary key references public.spelling_catalog_review_cases(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  approved_by_admin_user_id uuid not null,
  linked_at timestamptz not null default clock_timestamp()
);
create table public.contextual_micro_skill_demands (
  child_id uuid not null references public.children(id) on delete cascade,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  confirmed_count integer not null default 0,
  threshold_count integer not null default 3,
  demand_status text not null default 'BELOW_THRESHOLD'
    check (demand_status in ('BELOW_THRESHOLD','PENDING_WORD_SUPPORT','PENDING_TEACHING_CONTENT','PENDING_EXISTING_ITEM_REVIEW','READY')),
  canonical_word_id uuid references public.canonical_teaching_dictionary_words(id),
  adle_learning_item_id uuid references public.adle_learning_items(id),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(child_id, micro_skill_key),
  check (confirmed_count >= 0 and threshold_count = 3)
);
alter table public.contextual_micro_skill_members enable row level security;
alter table public.contextual_micro_skill_pairs enable row level security;
alter table public.contextual_micro_skill_case_links enable row level security;
alter table public.contextual_spelling_catalog_case_links enable row level security;
alter table public.contextual_micro_skill_demands enable row level security;
revoke all on public.contextual_micro_skill_members, public.contextual_micro_skill_pairs,
  public.contextual_micro_skill_case_links, public.contextual_spelling_catalog_case_links,
  public.contextual_micro_skill_demands from public, anon, authenticated;
grant select on public.contextual_micro_skill_members, public.contextual_micro_skill_pairs to authenticated;
grant all on public.contextual_micro_skill_members, public.contextual_micro_skill_pairs,
  public.contextual_micro_skill_case_links, public.contextual_spelling_catalog_case_links,
  public.contextual_micro_skill_demands to service_role;

-- Preserve the four already governed families while making future ones data driven.
with seeded(skill, member) as (values
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE','there'),
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE','their'),
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE','they''re'),
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO','to'),
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO','too'),
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO','two'),
  ('D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE','your'),
  ('D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE','you''re'),
  ('D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS','its'),
  ('D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS','it''s')
)
insert into public.contextual_micro_skill_members(micro_skill_key, member_normalized, member_display)
select skill, member, member from seeded
where exists(select 1 from public.micro_skill_catalog where micro_skill_key=skill)
on conflict do nothing;
insert into public.contextual_micro_skill_pairs(member_a,member_b,micro_skill_key)
select a.member_normalized,b.member_normalized,a.micro_skill_key
from public.contextual_micro_skill_members a
join public.contextual_micro_skill_members b on b.micro_skill_key=a.micro_skill_key
  and a.member_normalized<b.member_normalized
on conflict do nothing;

-- Existing parent catalog decisions are still original-writing evidence when
-- an admin had already linked them to the same contextual skill.
insert into public.contextual_spelling_catalog_case_links(
  catalog_case_id,micro_skill_key,approved_by_admin_user_id)
select review.id,pair.micro_skill_key,decision.admin_user_id
from public.spelling_catalog_review_cases review
join lateral (
  select admin_user_id,linked_micro_skill_key from public.spelling_catalog_review_case_decisions
  where case_id=review.id and decision_type='linked_existing_skill'
  order by created_at desc,id desc limit 1
) decision on true
join public.contextual_micro_skill_pairs pair
  on pair.micro_skill_key=decision.linked_micro_skill_key
  and pair.member_a=least(review.misspelling_normalized,review.correct_spelling_normalized)
  and pair.member_b=greatest(review.misspelling_normalized,review.correct_spelling_normalized)
where review.case_status='linked_existing_skill'
on conflict do nothing;

-- Only a reviewed pair may route a parent-confirmed original occurrence.
create function public.reconcile_contextual_micro_skill_demand(p_child_id uuid,p_micro_skill_key text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer; v_word text; v_word_id uuid; v_existing_word_id uuid;
  v_item uuid; v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended('context-skill:'||p_child_id::text||':'||p_micro_skill_key,0));
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
  if v_count>=3 then
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
      and i.micro_skill_key=p_micro_skill_key and i.row_status='active' and i.item_status='resolved')
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
  insert into public.contextual_micro_skill_demands(child_id,micro_skill_key,confirmed_count,
    demand_status,canonical_word_id,adle_learning_item_id)
  values(p_child_id,p_micro_skill_key,v_count,v_status,v_word_id,v_item)
  on conflict(child_id,micro_skill_key) do update set confirmed_count=excluded.confirmed_count,
    demand_status=excluded.demand_status,canonical_word_id=excluded.canonical_word_id,
    adle_learning_item_id=coalesce(excluded.adle_learning_item_id,public.contextual_micro_skill_demands.adle_learning_item_id),
    updated_at=clock_timestamp();
end $$;
revoke all on function public.reconcile_contextual_micro_skill_demand(uuid,text) from public,anon,authenticated;
grant execute on function public.reconcile_contextual_micro_skill_demand(uuid,text) to service_role;

create function public.contextual_micro_skill_parent_decision_trigger() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_observed text; v_skill text;
  v_previous_skill text; v_previous_intended text;
begin
  select lower(replace(replace(observed_text,'’',chr(39)),'ʼ',chr(39))) into v_observed
    from public.writing_occurrences where id=new.occurrence_id;
  if new.classification='INVALID' then
    select micro_skill_key into v_skill from public.contextual_micro_skill_pairs
      where member_a=least(v_observed,lower(replace(replace(new.intended_member,'’',chr(39)),'ʼ',chr(39))))
        and member_b=greatest(v_observed,lower(replace(replace(new.intended_member,'’',chr(39)),'ʼ',chr(39))));
  end if;
  if new.supersedes_decision_id is not null then
    select intended_member into v_previous_intended from public.writing_context_parent_decisions
      where id=new.supersedes_decision_id and classification='INVALID';
    select micro_skill_key into v_previous_skill from public.contextual_micro_skill_pairs
      where member_a=least(v_observed,lower(replace(replace(v_previous_intended,'’',chr(39)),'ʼ',chr(39))))
        and member_b=greatest(v_observed,lower(replace(replace(v_previous_intended,'’',chr(39)),'ʼ',chr(39))));
  end if;
  if v_skill is not null then perform public.reconcile_contextual_micro_skill_demand(new.child_id,v_skill); end if;
  if v_previous_skill is not null and v_previous_skill is distinct from v_skill then
    perform public.reconcile_contextual_micro_skill_demand(new.child_id,v_previous_skill);
  end if;
  return new;
end $$;
create trigger contextual_micro_skill_parent_decision after insert on public.writing_context_parent_decisions
  for each row execute function public.contextual_micro_skill_parent_decision_trigger();

-- The unified queue also includes parent-confirmed contextual word choice.
create or replace view public.spelling_no_matching_skill_queue with (security_invoker=true) as
select 'resolution:'||item.id::text queue_id,item.id resolution_item_id,null::uuid catalog_case_id,
  item.misspelling,item.correction,item.dialect_code,'resolver_intake'::text source_type,
  'open'::text case_status,item.updated_at,null::text parent_note,
  coalesce((select jsonb_agg(jsonb_build_object('type',link.source_type,'id',link.source_id)
    order by link.source_type,link.source_id) from public.spelling_resolution_item_sources link
    where link.item_id=item.id),'[]'::jsonb) source_evidence
from public.spelling_resolution_items item
join public.spelling_no_matching_skill_cases disposition on disposition.resolution_item_id=item.id
  and disposition.case_status='open'
where item.review_status='no_matching_skill'
union all
select 'catalog:'||review_case.id::text,null::uuid,review_case.id,
  review_case.misspelling_normalized,review_case.correct_spelling_normalized,'en-GB'::text,
  'parent_catalog'::text,review_case.case_status,review_case.updated_at,review_case.parent_note,
  jsonb_build_array(jsonb_build_object('type','catalog','id',review_case.id))
from public.spelling_catalog_review_cases review_case
where review_case.case_status in ('open','needs_new_micro_skill','word_level_only')
  and not exists(select 1 from public.spelling_resolution_item_sources link
    join public.spelling_resolution_items item on item.id=link.item_id
    where link.source_type='catalog' and link.source_id=review_case.id
      and item.review_status='no_matching_skill')
union all
select 'context:'||review.id::text,null::uuid,review.id,o.observed_text,c.intended_member,
  'en-GB'::text,'parent_context'::text,review.case_status,review.created_at,
  case when issue.metadata->>'detection_origin'='LUNA_PASSAGE'
    then 'Parent confirmed the AI passage finding in the original writing.'
    else 'Parent confirmed this word choice in the original writing.' end,
  jsonb_build_array(jsonb_build_object('type','parent_context','id',c.id),
    jsonb_build_object('type','occurrence','id',c.occurrence_id),
    jsonb_build_object('type','writing_issue','id',c.writing_issue_id))
from public.writing_context_catalog_review_cases review
join public.writing_context_parent_added_cases c on c.id=review.parent_added_case_id
join public.writing_occurrences o on o.id=c.occurrence_id
join public.writing_issues issue on issue.id=c.writing_issue_id
where review.case_status='open';
revoke all on public.spelling_no_matching_skill_queue from public,anon,authenticated;
grant select on public.spelling_no_matching_skill_queue to service_role;

create function public.resolve_no_matching_skill_admin(
  p_queue_id text,p_admin_user_id uuid,p_admin_email text,p_payload jsonb
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_kind text; v_id uuid; v_observed text; v_intended text; v_class text;
  v_skill text; v_family text; v_cluster text; v_mode text; v_route text;
  v_item uuid; v_mapping uuid; v_case public.writing_context_catalog_review_cases%rowtype;
  v_member text; v_member_display text; v_members text[]:=array[]::text[];
  v_source record;
begin
  if p_admin_user_id is null or p_payload is null or p_queue_id !~ '^(resolution|catalog|context):[0-9a-f-]{36}$'
  then raise exception 'no_matching_skill_request_invalid'; end if;
  v_kind:=split_part(p_queue_id,':',1); v_id:=split_part(p_queue_id,':',2)::uuid;
  v_class:=p_payload->>'classification'; v_mode:=p_payload->>'mode';
  if v_class not in ('context','spelling') or v_mode not in ('existing','new')
  then raise exception 'no_matching_skill_selection_invalid'; end if;
  if v_kind='context' then
    if v_class<>'context' then raise exception 'context_case_cannot_be_spelling_mapping'; end if;
    select * into v_case from public.writing_context_catalog_review_cases
      where id=v_id and case_status='open' for update;
    if v_case.id is null then raise exception 'no_matching_skill_case_not_open'; end if;
    select o.observed_text,c.intended_member into v_observed,v_intended
      from public.writing_context_parent_added_cases c
      join public.writing_occurrences o on o.id=c.occurrence_id
      where c.id=v_case.parent_added_case_id;
  elsif v_kind='resolution' then
    select misspelling,correction into v_observed,v_intended
      from public.spelling_resolution_items where id=v_id and review_status='no_matching_skill' for update;
    if v_observed is null then raise exception 'no_matching_skill_case_not_open'; end if;
    v_item:=v_id;
  else
    select misspelling_normalized,correct_spelling_normalized into v_observed,v_intended
      from public.spelling_catalog_review_cases where id=v_id
      and case_status in ('open','needs_new_micro_skill','word_level_only') for update;
    if v_observed is null then raise exception 'no_matching_skill_case_not_open'; end if;
    select item.id into v_item from public.spelling_resolution_item_sources source
      join public.spelling_resolution_items item on item.id=source.item_id
      where source.source_type='catalog' and source.source_id=v_id
        and item.mapping_id is null order by item.created_at limit 1;
  end if;
  v_observed:=lower(replace(replace(v_observed,'’',chr(39)),'ʼ',chr(39)));
  v_intended:=lower(replace(replace(v_intended,'’',chr(39)),'ʼ',chr(39)));
  if v_observed=v_intended or v_observed !~ '^[[:alpha:]][[:alpha:]''-]*$'
    or v_intended !~ '^[[:alpha:]][[:alpha:]''-]*$' then
    raise exception 'no_matching_skill_pair_invalid'; end if;

  if v_mode='new' then
    v_family:=p_payload->>'family_key'; v_cluster:=p_payload->>'cluster_key';
    v_skill:=p_payload->>'micro_skill_key';
    v_route:=coalesce(p_payload->>'practice_route','word_practice');
    if v_family !~ '^D4_[A-Z0-9_]+$' or v_cluster !~ '^D4_[A-Z0-9_]+$'
      or v_skill !~ '^D4_[A-Z0-9_]+$'
      or length(btrim(coalesce(p_payload->>'display_name',''))) not between 3 and 120
      or v_route not in ('word_practice','grouped_set_practice')
    then raise exception 'micro_skill_catalog_fields_invalid'; end if;
    if p_payload->>'new_family_name' is not null then
      if length(btrim(p_payload->>'new_family_name')) not between 3 and 120 then
        raise exception 'family_public_name_invalid'; end if;
      insert into public.micro_skill_families(mastery_domain_key,skill_family_key,display_name,is_active,is_assignable)
        values('D4',v_family,btrim(p_payload->>'new_family_name'),true,true);
    elsif not exists(select 1 from public.micro_skill_families where skill_family_key=v_family
      and mastery_domain_key='D4' and is_active) then raise exception 'skill_family_not_available'; end if;
    if p_payload->>'new_cluster_name' is not null then
      if length(btrim(p_payload->>'new_cluster_name')) not between 3 and 120 then
        raise exception 'cluster_public_name_invalid'; end if;
      insert into public.micro_skill_clusters(mastery_domain_key,skill_family_key,skill_cluster_key,
        display_name,is_active,is_assignable)
        values('D4',v_family,v_cluster,btrim(p_payload->>'new_cluster_name'),true,true);
    elsif not exists(select 1 from public.micro_skill_clusters where skill_cluster_key=v_cluster
      and skill_family_key=v_family and mastery_domain_key='D4' and is_active)
    then raise exception 'skill_cluster_not_available'; end if;
    insert into public.micro_skill_catalog(mastery_domain_key,skill_family_key,skill_cluster_key,
      micro_skill_key,display_name,practice_route,is_active,is_assignable,allowed_template_keys,metadata)
      values('D4',v_family,v_cluster,v_skill,btrim(p_payload->>'display_name'),v_route,true,true,
        coalesce((select allowed_template_keys from public.micro_skill_catalog
          where skill_cluster_key=v_cluster and cardinality(allowed_template_keys)>0
          order by created_at limit 1),
          (select allowed_template_keys from public.micro_skill_catalog
          where skill_family_key=v_family and cardinality(allowed_template_keys)>0
          order by created_at limit 1),
          case when v_family like 'D4_HOM%' then array['T02','T01','T07','T03','T08','T09','T10','T11']
            else array[]::text[] end),
        jsonb_build_object('catalog_origin','no_matching_skill_admin','example_words',jsonb_build_array(v_intended)));
  else
    v_skill:=p_payload->>'micro_skill_key';
    if not exists(select 1 from public.micro_skill_catalog where micro_skill_key=v_skill
      and mastery_domain_key='D4' and is_active and is_assignable) then
      raise exception 'micro_skill_not_active_assignable_d4'; end if;
  end if;

  if v_class='context' then
    if jsonb_typeof(p_payload->'members')<>'array' then raise exception 'context_members_required'; end if;
    for v_member in select jsonb_array_elements_text(p_payload->'members') loop
      v_member_display:=btrim(v_member);
      v_member:=lower(replace(replace(v_member_display,'’',chr(39)),'ʼ',chr(39)));
      if v_member !~ '^[[:alpha:]][[:alpha:]''-]*$' or length(v_member)>60
      then raise exception 'context_member_invalid'; end if;
      if not v_member=any(v_members) then
        v_members:=array_append(v_members,v_member);
        insert into public.contextual_micro_skill_members(micro_skill_key,member_normalized,
          member_display,approved_by_admin_user_id)
        values(v_skill,v_member,v_member_display,p_admin_user_id) on conflict do nothing;
      end if;
    end loop;
    if cardinality(v_members)<2 or cardinality(v_members)>12
      or not v_observed=any(v_members) or not v_intended=any(v_members)
    then raise exception 'context_member_set_incomplete'; end if;
    if v_mode='new' then
      update public.micro_skill_catalog set metadata=metadata||jsonb_build_object(
        'example_words',to_jsonb(v_members),'contrast_word_bank',to_jsonb(v_members))
      where micro_skill_key=v_skill;
    end if;
    for v_source in select least(a.member,b.member) a,greatest(a.member,b.member) b
      from unnest(v_members) a(member) cross join unnest(v_members) b(member)
      where a.member<b.member loop
      if exists(select 1 from public.contextual_micro_skill_pairs p
        where p.dialect_code='en-GB' and p.member_a=v_source.a and p.member_b=v_source.b
          and p.micro_skill_key<>v_skill) then raise exception 'context_pair_already_linked_to_another_skill'; end if;
      insert into public.contextual_micro_skill_pairs(member_a,member_b,micro_skill_key,approved_by_admin_user_id)
        values(v_source.a,v_source.b,v_skill,p_admin_user_id) on conflict do nothing;
    end loop;
    -- A previously visible spelling mapping for any approved member pair must
    -- lose token-only resolver authority, with the normal mapping audit event.
    for v_source in select mapping.id from public.spelling_canonical_mappings mapping
      join public.contextual_micro_skill_pairs pair on pair.micro_skill_key=v_skill
        and pair.dialect_code=mapping.dialect_code
        and pair.member_a=least(mapping.misspelling_normalized,mapping.correct_spelling_normalized)
        and pair.member_b=greatest(mapping.misspelling_normalized,mapping.correct_spelling_normalized)
      where mapping.mapping_status='active' and mapping.resolver_visibility_status='visible' loop
      perform public.set_spelling_canonical_mapping_resolver_visibility_admin(
        v_source.id,'disabled',p_admin_user_id,p_admin_email,
        'Approved contextual pair linked to a micro skill',
        jsonb_build_object('action_source','no_matching_skill_context_link'));
    end loop;
    -- Resolve matching earlier parent-confirmed cases and count them as evidence.
    for v_source in select review.id case_id,c.child_id
      from public.writing_context_catalog_review_cases review
      join public.writing_context_parent_added_cases c on c.id=review.parent_added_case_id
      join public.writing_occurrences o on o.id=c.occurrence_id
      join public.contextual_micro_skill_pairs p on p.micro_skill_key=v_skill
        and p.member_a=least(lower(replace(replace(o.observed_text,'’',chr(39)),'ʼ',chr(39))),
          lower(replace(replace(c.intended_member,'’',chr(39)),'ʼ',chr(39))))
        and p.member_b=greatest(lower(replace(replace(o.observed_text,'’',chr(39)),'ʼ',chr(39))),
          lower(replace(replace(c.intended_member,'’',chr(39)),'ʼ',chr(39))))
      where review.case_status='open' loop
      insert into public.contextual_micro_skill_case_links(catalog_case_id,micro_skill_key,approved_by_admin_user_id)
        values(v_source.case_id,v_skill,p_admin_user_id) on conflict do nothing;
      update public.writing_context_catalog_review_cases set case_status='reviewed',reviewed_at=clock_timestamp()
        where id=v_source.case_id and case_status='open';
      perform public.reconcile_contextual_micro_skill_demand(v_source.child_id,v_skill);
    end loop;
    for v_source in select review.id case_id,review.child_id
      from public.spelling_catalog_review_cases review
      join public.contextual_micro_skill_pairs p on p.micro_skill_key=v_skill
        and p.member_a=least(review.misspelling_normalized,review.correct_spelling_normalized)
        and p.member_b=greatest(review.misspelling_normalized,review.correct_spelling_normalized)
      where review.case_status in ('open','needs_new_micro_skill','word_level_only') loop
      insert into public.contextual_spelling_catalog_case_links(
        catalog_case_id,micro_skill_key,approved_by_admin_user_id)
      values(v_source.case_id,v_skill,p_admin_user_id) on conflict do nothing;
      update public.spelling_catalog_review_cases set case_status='linked_existing_skill',
        metadata=metadata||jsonb_build_object('selected_micro_skill_key',v_skill),
        updated_at=clock_timestamp() where id=v_source.case_id;
      delete from public.spelling_resolution_items where id in (
        select item_id from public.spelling_resolution_item_sources
        where source_type='catalog' and source_id=v_source.case_id
      ) and mapping_id is null;
      perform public.reconcile_contextual_micro_skill_demand(v_source.child_id,v_skill);
    end loop;
    for v_source in select child_id from public.contextual_micro_skill_demands
      where micro_skill_key=v_skill loop
      perform public.reconcile_contextual_micro_skill_demand(v_source.child_id,v_skill);
    end loop;
    if v_kind<>'context' then
      if v_kind='catalog' then
        update public.spelling_catalog_review_cases set case_status='linked_existing_skill',
          metadata=metadata||jsonb_build_object('selected_micro_skill_key',v_skill),
          updated_at=clock_timestamp() where id=v_id;
      end if;
      if v_item is not null then
        for v_source in select source_id from public.spelling_resolution_item_sources
          where item_id=v_item and source_type='catalog' loop
          update public.spelling_catalog_review_cases set case_status='linked_existing_skill',
            metadata=metadata||jsonb_build_object('selected_micro_skill_key',v_skill),
            updated_at=clock_timestamp() where id=v_source.source_id;
        end loop;
        delete from public.spelling_resolution_items where id=v_item and mapping_id is null;
      end if;
    end if;
  else
    if exists(select 1 from public.canonical_teaching_dictionary_words
      where normalised_word=v_observed and row_status='active')
      or exists(select 1 from public.contextual_micro_skill_members where member_normalized=v_observed)
    then raise exception 'valid_word_cannot_enter_spelling_resolver'; end if;
    if v_item is null then raise exception 'spelling_resolution_source_missing'; end if;
    if exists(select 1 from public.spelling_resolution_items
      where id=v_item and review_status='no_matching_skill') then
      perform public.return_no_matching_skill_to_resolution_admin(v_item,p_admin_user_id);
    end if;
    update public.spelling_resolution_items set micro_skill_key=v_skill,updated_at=clock_timestamp()
      where id=v_item and review_status='pending';
    if not found then raise exception 'spelling_resolution_not_pending'; end if;
    v_mapping:=public.confirm_spelling_resolution_admin(v_item,p_admin_user_id,p_admin_email,
      'Approved from No Matching Skill');
    perform public.set_spelling_canonical_mapping_resolver_visibility_admin(
      v_mapping,'visible',p_admin_user_id,p_admin_email,'Approved spelling error from No Matching Skill','{}'::jsonb);
  end if;
  return v_skill;
end $$;
revoke all on function public.resolve_no_matching_skill_admin(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.resolve_no_matching_skill_admin(text,uuid,text,jsonb) to service_role;

create function public.delete_no_matching_skill_admin(p_queue_id text,p_admin_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_kind text; v_id uuid; v_item uuid; v_source record;
begin
  if p_admin_user_id is null or p_queue_id !~ '^(resolution|catalog|context):[0-9a-f-]{36}$'
  then raise exception 'no_matching_skill_delete_invalid'; end if;
  v_kind:=split_part(p_queue_id,':',1); v_id:=split_part(p_queue_id,':',2)::uuid;
  if v_kind='context' then
    delete from public.writing_context_catalog_review_cases where id=v_id and case_status='open';
    if not found then raise exception 'no_matching_skill_case_not_open'; end if;
  elsif v_kind='catalog' then
    update public.spelling_catalog_review_cases set case_status='not_a_learning_issue',
      updated_at=clock_timestamp() where id=v_id
      and case_status in ('open','needs_new_micro_skill','word_level_only');
    if not found then raise exception 'no_matching_skill_case_not_open'; end if;
    select item.id into v_item from public.spelling_resolution_item_sources source
      join public.spelling_resolution_items item on item.id=source.item_id
      where source.source_type='catalog' and source.source_id=v_id and item.mapping_id is null;
    if v_item is not null then delete from public.spelling_resolution_items where id=v_item; end if;
  else
    select id into v_item from public.spelling_resolution_items where id=v_id
      and review_status='no_matching_skill' and mapping_id is null for update;
    if v_item is null then raise exception 'no_matching_skill_case_not_open'; end if;
    for v_source in select source_id from public.spelling_resolution_item_sources
      where item_id=v_item and source_type='catalog' loop
      update public.spelling_catalog_review_cases set case_status='not_a_learning_issue',
        updated_at=clock_timestamp() where id=v_source.source_id
        and case_status in ('open','needs_new_micro_skill','word_level_only');
    end loop;
    delete from public.spelling_resolution_items where id=v_item;
  end if;
end $$;
revoke all on function public.delete_no_matching_skill_admin(text,uuid) from public,anon,authenticated;
grant execute on function public.delete_no_matching_skill_admin(text,uuid) to service_role;

-- Later parent-added confirmations of an already approved pair route without
-- requiring the admin to approve the same pair again.
create function public.route_approved_contextual_case() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_skill text; v_child uuid; v_observed text; v_intended text;
begin
  select c.child_id,lower(replace(replace(o.observed_text,'’',chr(39)),'ʼ',chr(39))),
    lower(replace(replace(c.intended_member,'’',chr(39)),'ʼ',chr(39)))
    into v_child,v_observed,v_intended
  from public.writing_context_parent_added_cases c
  join public.writing_occurrences o on o.id=c.occurrence_id where c.id=new.parent_added_case_id;
  select micro_skill_key into v_skill from public.contextual_micro_skill_pairs
    where member_a=least(v_observed,v_intended) and member_b=greatest(v_observed,v_intended);
  if v_skill is not null then
    insert into public.contextual_micro_skill_case_links(catalog_case_id,micro_skill_key)
      values(new.id,v_skill);
    update public.writing_context_catalog_review_cases set case_status='reviewed',
      reviewed_at=clock_timestamp() where id=new.id;
    perform public.reconcile_contextual_micro_skill_demand(v_child,v_skill);
  end if;
  return new;
end $$;
create trigger contextual_case_auto_route after insert on public.writing_context_catalog_review_cases
  for each row execute function public.route_approved_contextual_case();

do $$ declare v record; begin
  for v in select distinct d.child_id,p.micro_skill_key
    from public.writing_context_current_parent_decisions d
    join public.writing_occurrences o on o.id=d.occurrence_id
    join public.contextual_micro_skill_pairs p
      on p.member_a=least(lower(replace(replace(o.observed_text,'’',chr(39)),'ʼ',chr(39))),
        lower(replace(replace(d.intended_member,'’',chr(39)),'ʼ',chr(39))))
      and p.member_b=greatest(lower(replace(replace(o.observed_text,'’',chr(39)),'ʼ',chr(39))),
        lower(replace(replace(d.intended_member,'’',chr(39)),'ʼ',chr(39))))
    where d.classification='INVALID' loop
    perform public.reconcile_contextual_micro_skill_demand(v.child_id,v.micro_skill_key);
  end loop;
  for v in select distinct review.child_id,link.micro_skill_key
    from public.spelling_catalog_review_cases review
    join public.contextual_spelling_catalog_case_links link on link.catalog_case_id=review.id loop
    perform public.reconcile_contextual_micro_skill_demand(v.child_id,v.micro_skill_key);
  end loop;
end $$;

-- The existing per-issue handoff is retained, but it cannot admit an ADLE
-- item before the reviewed skill has three original-writing confirmations.
alter function public.reconcile_contextual_adle_learning_need(uuid,uuid,uuid)
  rename to reconcile_contextual_adle_learning_need_pre_skill_threshold;
create function public.reconcile_contextual_adle_learning_need(
  p_writing_issue_id uuid,p_parent_user_id uuid,p_child_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.writing_issues%rowtype; v_count integer;
begin
  select * into v_issue from public.writing_issues where id=p_writing_issue_id
    and parent_user_id=p_parent_user_id and child_id=p_child_id;
  if v_issue.id is null or v_issue.metadata->>'source_kind'<>'contextual_advisory_v4'
  then raise exception 'contextual_handoff_source_invalid'; end if;
  select confirmed_count into v_count from public.contextual_micro_skill_demands
    where child_id=p_child_id and micro_skill_key=v_issue.micro_skill_key;
  if coalesce(v_count,0)<3 then
    return jsonb_build_object('handoff_state','PENDING_THRESHOLD','blocker_code','THREE_CONFIRMATIONS_REQUIRED',
      'confirmed_count',coalesce(v_count,0),'adle_learning_item_id',null);
  end if;
  return public.reconcile_contextual_adle_learning_need_pre_skill_threshold(
    p_writing_issue_id,p_parent_user_id,p_child_id);
end $$;
revoke all on function public.reconcile_contextual_adle_learning_need(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.reconcile_contextual_adle_learning_need(uuid,uuid,uuid) to service_role;

create or replace function public.reject_parent_added_contextual_handoff() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.writing_context_parent_added_cases c
    where c.writing_issue_id=new.writing_issue_id and c.governed_family_key is null
      and not exists(select 1 from public.writing_context_catalog_review_cases review
        join public.contextual_micro_skill_case_links link on link.catalog_case_id=review.id
        where review.parent_added_case_id=c.id and link.micro_skill_key=new.micro_skill_key))
  then raise exception 'parent_added_unknown_family_has_no_learning_authority'; end if;
  return new;
end $$;

create or replace function public.finalise_parent_confirmed_contextual_learning_need(
  p_writing_issue_id uuid,p_parent_user_id uuid,p_child_id uuid,
  p_final_classification text,p_micro_skill_key text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.writing_issues%rowtype; v_observed text; v_intended text;
  v_result jsonb; v_adle jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('context-finalise:'||p_writing_issue_id::text,0));
  select * into v_issue from public.writing_issues where id=p_writing_issue_id
    and parent_user_id=p_parent_user_id and child_id=p_child_id for update;
  if v_issue.id is null or v_issue.metadata->>'source_kind'<>'contextual_advisory_v4'
    or v_issue.issue_status<>'child_responded' or v_issue.final_classification is not null
    or v_issue.source_writing_occurrence_id is null
  then raise exception 'contextual_learning_issue_not_reviewable'; end if;
  if p_final_classification not in ('concept_gap','fragile_knowledge','transfer_failure')
  then raise exception 'contextual_learning_outcome_invalid'; end if;
  v_observed:=lower(replace(replace(v_issue.observed_text,'’',chr(39)),'ʼ',chr(39)));
  v_intended:=lower(replace(replace(v_issue.approved_replacement,'’',chr(39)),'ʼ',chr(39)));
  if not exists(select 1 from public.contextual_micro_skill_pairs p
    where p.micro_skill_key=p_micro_skill_key
      and p.member_a=least(v_observed,v_intended) and p.member_b=greatest(v_observed,v_intended))
    or not exists(select 1 from public.micro_skill_catalog s where s.micro_skill_key=p_micro_skill_key
      and s.mastery_domain_key='D4' and s.is_active and s.is_assignable)
    or not (
      exists(select 1 from public.writing_context_current_parent_decisions d
        where d.occurrence_id=v_issue.source_writing_occurrence_id and d.parent_user_id=p_parent_user_id
          and d.classification='INVALID' and d.intended_member=v_intended)
      or exists(select 1 from public.writing_context_parent_added_cases c
        join public.writing_context_catalog_review_cases review on review.parent_added_case_id=c.id
        join public.contextual_micro_skill_case_links link on link.catalog_case_id=review.id
        where c.writing_issue_id=v_issue.id and c.parent_user_id=p_parent_user_id
          and link.micro_skill_key=p_micro_skill_key and c.intended_member=v_intended)
    )
  then raise exception 'contextual_micro_skill_not_governed'; end if;
  update public.writing_issues set micro_skill_key=p_micro_skill_key,
    metadata=metadata||jsonb_build_object('contextual_learning_source','PARENT_CONFIRMED_ORIGINAL_WRITING',
      'retry_evidence_kind','REPAIR_ONLY'),updated_at=clock_timestamp()
  where id=v_issue.id;
  v_result:=public.finalise_contextual_learning_item(
    p_writing_issue_id,p_parent_user_id,p_child_id,p_final_classification);
  if v_result->>'learning_item_id' is null then raise exception 'contextual_learning_item_not_created'; end if;
  v_adle:=public.reconcile_contextual_adle_learning_need(
    p_writing_issue_id,p_parent_user_id,p_child_id);
  return v_result||v_adle||jsonb_build_object('evidence_kind','PARENT_CONFIRMED_CONTEXTUAL_NEED',
    'retry_evidence_kind','REPAIR_ONLY');
end $$;

-- Resume pending threshold demands when reviewed curriculum support arrives.
create function public.refresh_contextual_micro_skill_demands() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_skill text; v record;
begin
  v_skill:=new.micro_skill_key;
  for v in select child_id from public.contextual_micro_skill_demands
    where micro_skill_key=v_skill loop
    perform public.reconcile_contextual_micro_skill_demand(v.child_id,v_skill);
  end loop;
  return new;
end $$;
create trigger contextual_skill_support_refresh after insert or update of row_status,review_status
  on public.canonical_teaching_dictionary_word_support
  for each row execute function public.refresh_contextual_micro_skill_demands();
create trigger contextual_skill_content_refresh after insert or update of is_active,version_status,final_readiness_review_status
  on public.canonical_teaching_dictionary_content_versions
  for each row execute function public.refresh_contextual_micro_skill_demands();

create function public.refresh_contextual_micro_skill_demands_for_family() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v record;
begin
  for v in select demand.child_id,demand.micro_skill_key
    from public.contextual_micro_skill_demands demand
    join public.micro_skill_catalog skill on skill.micro_skill_key=demand.micro_skill_key
    where skill.skill_family_key=new.family_key loop
    perform public.reconcile_contextual_micro_skill_demand(v.child_id,v.micro_skill_key);
  end loop;
  return new;
end $$;
create trigger contextual_skill_family_method_refresh after insert or update of row_status
  on public.adle_family_methods
  for each row execute function public.refresh_contextual_micro_skill_demands_for_family();

create function public.refresh_contextual_micro_skill_demands_for_word() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v record;
begin
  for v in select demand.child_id,demand.micro_skill_key
    from public.contextual_micro_skill_members member
    join public.contextual_micro_skill_demands demand on demand.micro_skill_key=member.micro_skill_key
    where member.member_normalized=new.normalised_word loop
    perform public.reconcile_contextual_micro_skill_demand(v.child_id,v.micro_skill_key);
  end loop;
  return new;
end $$;
create trigger contextual_skill_word_refresh after insert or update of row_status,review_status
  on public.canonical_teaching_dictionary_words
  for each row execute function public.refresh_contextual_micro_skill_demands_for_word();

commit;
