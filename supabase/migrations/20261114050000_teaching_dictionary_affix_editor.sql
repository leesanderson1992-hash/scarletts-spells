begin;

create function public.register_teaching_dictionary_affix_meaning(
  p_kind text, p_form text, p_gloss text, p_actor uuid
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_gloss text;
begin
  if p_kind is null or p_kind not in ('prefix','suffix') or p_actor is null
    or p_form is null or p_form !~ '^[[:alpha:]]{1,30}$' or p_form <> lower(p_form)
    or coalesce(length(btrim(p_gloss)),0) not between 1 and 300 then
    raise exception 'TEACHING_AFFIX_MEANING_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('teaching-affix:'||p_kind||':'||p_form,0));
  select gloss into v_gloss from public.canonical_teaching_dictionary_affix_meanings
    where part_kind=p_kind and source_text=p_form and lower(gloss)=lower(p_gloss)
      and review_status='approved' and row_status='active' limit 1;
  if found then return v_gloss; end if;
  insert into public.canonical_teaching_dictionary_affix_meanings
    (part_kind,source_text,gloss,source_reference,reviewed_by)
  values(p_kind,p_form,p_gloss,'Teaching Dictionary affix editor',p_actor::text);
  return p_gloss;
end $$;
revoke all on function public.register_teaching_dictionary_affix_meaning(text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.register_teaching_dictionary_affix_meaning(text,text,text,uuid)
  to service_role;

-- Preserve an approved family link when only another part (such as a suffix
-- gloss) changes. A changed family component still requires family review.
create function public.approve_teaching_dictionary_word_parts(
  p_request_id uuid, p_word_id uuid, p_sense_id text,
  p_parts jsonb, p_joins jsonb, p_transformations jsonb, p_word_sum text, p_actor uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_previous uuid; v_next uuid; v_link record;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'sense-morphology:'||p_word_id::text||':'||p_sense_id,0));
  select id into v_previous from public.teaching_dictionary_current_sense_morphology
    where canonical_word_id=p_word_id and sense_id=p_sense_id;
  v_next:=public.review_teaching_dictionary_sense_morphology(
    p_request_id,p_word_id,p_sense_id,'approve',p_parts,p_joins,p_transformations,
    p_word_sum,p_actor,'Teaching Dictionary Word parts');
  if v_previous is null or v_previous=v_next then return v_next; end if;
  for v_link in
    select e.family_key,e.component_part_id,e.relationship_kind
    from (
      select distinct on (family_key,component_part_id) *
      from public.teaching_dictionary_sense_family_membership_events
      where canonical_word_id=p_word_id and sense_id=p_sense_id
      order by family_key,component_part_id,event_sequence desc
    ) e
    join public.teaching_dictionary_sense_morphology_events old on old.id=v_previous
    join lateral jsonb_array_elements(old.morphology_parts) previous_part on previous_part->>'id'=e.component_part_id
    join lateral jsonb_array_elements(p_parts) next_part on next_part->>'id'=e.component_part_id
    join lateral (
      select review_status,base_meaning from public.canonical_teaching_dictionary_lexical_base_families f
      where f.family_key=e.family_key order by revision desc limit 1
    ) current_family on current_family.review_status='approved' and current_family.base_meaning=e.base_meaning
    where e.action='approve' and e.sense_morphology_id=v_previous and previous_part=next_part
  loop
    perform public.review_teaching_dictionary_sense_family_membership(gen_random_uuid(),
      p_word_id,p_sense_id,v_next,v_link.family_key,v_link.component_part_id,v_link.relationship_kind,
      'approve',p_actor,'Teaching Dictionary: unchanged family component on revised word parts');
  end loop;
  return v_next;
end $$;
revoke all on function public.approve_teaching_dictionary_word_parts(uuid,uuid,text,jsonb,jsonb,jsonb,text,uuid)
  from public,anon,authenticated;
grant execute on function public.approve_teaching_dictionary_word_parts(uuid,uuid,text,jsonb,jsonb,jsonb,text,uuid)
  to service_role;

insert into public.canonical_teaching_dictionary_affix_meanings
  (part_kind,source_text,gloss,source_reference,reviewed_by)
values ('suffix','ing','Shows the action of doing something.',
  'Teaching Dictionary: reusable action meaning for -ing reviewed for bullying',
  'Teaching Dictionary editorial review')
on conflict do nothing;

notify pgrst,'reload schema';
commit;
