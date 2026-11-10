begin;

-- The family publisher creates a spelling-level member. A candidate needs the
-- same reviewed family explicitly linked to the imported sense before the
-- batch action evaluates that sense. Keep both writes in one transaction.
do $$
declare body text;
  marker text := $old$  select skill_keys into v_after from public.teaching_dictionary_import_live_skill_keys($old$;
  replacement text := $new$
  if p_mode in ('free_base','bound_root') then
    declare
      family_ref text;
      expected_kind text;
      family_row public.canonical_teaching_dictionary_lexical_base_families%rowtype;
      member_row public.canonical_teaching_dictionary_lexical_base_family_members%rowtype;
      part_id text;
      match_count integer;
    begin
      family_ref:=nullif(btrim(case when p_mode='bound_root'
        then d.payload#>>'{rootFamilyReview,familyKey}'
        else d.payload#>>'{freeBaseFamilyReview,familyKey}' end),'');
      expected_kind:=case when p_mode='bound_root' then 'root' else 'base' end;
      select count(*) into match_count
        from public.canonical_teaching_dictionary_lexical_base_families f
        join public.canonical_teaching_dictionary_lexical_base_family_members m
          on m.family_key=f.family_key and m.revision=f.revision
        where m.canonical_word_id=v_word and f.review_status='approved'
          and f.base_kind=case when p_mode='bound_root' then 'bound_root' else 'free_base' end
          and (family_ref is null or f.family_key=family_ref)
          and not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
            where newer.family_key=f.family_key and newer.revision>f.revision);
      if match_count<>1 then raise exception 'TEACHING_CSV_SENSE_FAMILY_AMBIGUOUS'; end if;
      select f.* into family_row
        from public.canonical_teaching_dictionary_lexical_base_families f
        join public.canonical_teaching_dictionary_lexical_base_family_members m
          on m.family_key=f.family_key and m.revision=f.revision
        where m.canonical_word_id=v_word and f.review_status='approved'
          and f.base_kind=case when p_mode='bound_root' then 'bound_root' else 'free_base' end
          and (family_ref is null or f.family_key=family_ref)
          and not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
            where newer.family_key=f.family_key and newer.revision>f.revision);
      select * into member_row from public.canonical_teaching_dictionary_lexical_base_family_members m
        where m.family_key=family_row.family_key and m.revision=family_row.revision
          and m.canonical_word_id=v_word;
      select count(*),min(part.value->>'id') into match_count,part_id
        from jsonb_array_elements(member_row.morphology_parts) part(value)
        where part.value->>'kind'=expected_kind
          and lower(part.value->>'sourceText')=family_row.base_lemma
          and part.value->>'gloss'=family_row.base_meaning;
      if match_count<>1 or nullif(btrim(part_id),'') is null then
        raise exception 'TEACHING_CSV_SENSE_FAMILY_COMPONENT_INVALID';
      end if;
      if not exists(select 1 from public.teaching_dictionary_current_sense_family_links l
        where l.canonical_word_id=v_word and l.sense_id=v_sense
          and l.family_key=family_row.family_key and l.component_part_id=part_id) then
        perform public.review_teaching_dictionary_sense_family_link(
          gen_random_uuid(),v_word,v_sense,family_row.family_key,part_id,
          'approve',p_actor,'Reviewed Teaching Dictionary CSV: '||d.source_reference);
      end if;
      if not exists(select 1 from public.teaching_dictionary_current_sense_family_links l
        where l.canonical_word_id=v_word and l.sense_id=v_sense
          and l.family_key=family_row.family_key and l.component_part_id=part_id) then
        raise exception 'TEACHING_CSV_SENSE_FAMILY_LINK_STALE';
      end if;
    end;
  end if;
  select skill_keys into v_after from public.teaching_dictionary_import_live_skill_keys($new$;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_reviewed_csv_facts_first(
    uuid,uuid,text,text)'::regprocedure) into body;
  if position('TEACHING_CSV_SENSE_FAMILY_LINK_STALE' in body)>0 then return; end if;
  if (length(body)-length(replace(body,marker,'')))/length(marker)<>1 then
    raise exception 'TEACHING_CSV_FACTS_FIRST_FUNCTION_CHANGED';
  end if;
  execute replace(body,marker,replacement);
end $$;

notify pgrst,'reload schema';
commit;
