begin;

create or replace function public.resolve_no_matching_skill_admin(
  p_queue_id text,p_admin_user_id uuid,p_admin_email text,p_payload jsonb
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_kind text; v_id uuid; v_observed text; v_intended text; v_class text;
  v_skill text; v_family text; v_cluster text; v_mode text; v_route text;
  v_item uuid; v_mapping uuid; v_case public.writing_context_catalog_review_cases%rowtype;
  v_member text; v_member_display text; v_members text[]:=array[]::text[];
  v_source record; v_existing_skill text; v_existing_visibility text; v_previous_status text;
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
    select misspelling_normalized,correct_spelling_normalized,case_status
      into v_observed,v_intended,v_previous_status
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
    -- Legacy catalog decisions can remain open after another reviewed case
    -- already confirmed this exact canonical mapping. Reuse that authority;
    -- creating a second resolver mapping for the same pair is forbidden.
    if v_kind='catalog' then
      select mapping.id,mapping.micro_skill_key,mapping.resolver_visibility_status
        into v_mapping,v_existing_skill,v_existing_visibility
      from public.spelling_canonical_mappings mapping
      where mapping.misspelling_normalized=v_observed
        and mapping.correct_spelling_normalized=v_intended
        and mapping.dialect_code='en-GB' and mapping.mapping_status='active'
      order by mapping.created_at desc,mapping.id limit 1;
      if v_mapping is not null then
        if v_existing_skill is distinct from v_skill then
          raise exception 'canonical_pair_already_linked_to_skill:%',v_existing_skill;
        end if;
        if v_existing_visibility<>'visible' then
          raise exception 'canonical_pair_resolver_visibility_requires_review';
        end if;
        insert into public.spelling_catalog_review_case_decisions(
          case_id,admin_user_id,admin_email,decision_type,previous_status,new_status,
          decision_note,linked_micro_skill_key,metadata)
        values(v_id,p_admin_user_id,p_admin_email,'linked_existing_skill',
          v_previous_status,'linked_existing_skill',
          'Linked to the existing approved canonical mapping',v_skill,
          jsonb_build_object('action_source','no_matching_skill_existing_mapping',
            'existing_canonical_mapping_id',v_mapping));
        update public.spelling_catalog_review_cases set case_status='linked_existing_skill',
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'selected_micro_skill_key',v_skill,'existing_canonical_mapping_id',v_mapping),
          updated_at=clock_timestamp() where id=v_id;
        return v_skill;
      end if;
    end if;
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

commit;
