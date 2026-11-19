begin;

-- A reviewed workbook has already established the canonical sense and parts.
-- Releasing one affix lesson may materialise those facts without requiring a
-- simultaneous release of every other lesson containing the spelling.
create function public.teaching_dictionary_affix_draft_matches_canonical(
  p_word uuid, p_skill text, p_payload jsonb
) returns boolean language sql stable security definer
set search_path=public,pg_temp as $$
  select exists (
    select 1 from public.canonical_teaching_dictionary_words w
    join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=w.id
    join public.teaching_dictionary_current_sense_morphology m on m.canonical_word_id=w.id
      and m.sense_id=p_payload#>>array['skillSenseIds',p_skill]
    cross join lateral jsonb_array_elements(s.sense_set->'senses') sense
    where w.id=p_word and w.row_status='active' and w.review_status='approved_for_first_exposure'
      and w.display_word=p_payload->>'displayWord'
      and s.sense_set=p_payload->'senseSet' and sense->>'id'=m.sense_id
      and sense->>'definition'=p_payload->>'definition'
      and sense->>'dictationSentence'=p_payload->>'dictationSentence'
      and sense->>'dictationTargetTokenIndex'=p_payload->>'dictationTargetTokenIndex'
      and m.word_sum=p_payload#>>'{canonicalMorphology,wordSum}'
      and m.morphology_joins=p_payload#>'{canonicalMorphology,joins}'
      and m.morphology_transformations=p_payload#>'{canonicalMorphology,transformations}'
      and jsonb_typeof(p_payload#>'{canonicalMorphology,parts}')='array'
      and jsonb_array_length(m.morphology_parts)=jsonb_array_length(p_payload#>'{canonicalMorphology,parts}')
      and not exists (
        select 1 from jsonb_array_elements(m.morphology_parts) with ordinality approved(part,position)
        left join lateral (
          select value part from jsonb_array_elements(p_payload#>'{canonicalMorphology,parts}') with ordinality proposed(value,position)
          where proposed.position=approved.position
        ) proposed on true
        where proposed.part is null or proposed.part-'gloss' is distinct from approved.part-'gloss'
          or (proposed.part->>'gloss' is distinct from approved.part->>'gloss' and not (
            proposed.part->>'kind' in ('base','root') and exists (
              select 1 from public.teaching_dictionary_current_sense_family_memberships f
              where f.canonical_word_id=w.id and f.sense_id=m.sense_id and f.sense_morphology_id=m.id
                and f.component_part_id=proposed.part->>'id' and f.base_meaning=proposed.part->>'gloss'
            )
          ))
      )
  );
$$;
revoke all on function public.teaching_dictionary_affix_draft_matches_canonical(uuid,text,jsonb) from public,anon,authenticated,service_role;

do $$
declare
  body text;
  old_value text := $old$if not exists(select 1 from public.teaching_dictionary_manager_publications where draft_id=d.id) then
        raise exception 'TEACHING_SHARED_FACTS_DEPENDENT_ROUTE_RELEASE_REQUIRED';
      end if;$old$;
  new_value text := $new$if not exists(select 1 from public.teaching_dictionary_manager_publications where draft_id=d.id) then
        if d.source_reference not like 'Reviewed % Bulk review'
          or not public.teaching_dictionary_affix_draft_matches_canonical(c.canonical_word_id,p_micro_skill_key,d.payload) then
          raise exception 'TEACHING_SHARED_FACTS_DEPENDENT_ROUTE_RELEASE_REQUIRED';
        end if;
        -- Other lesson snapshots stay unchanged. Their own Bulk review queues
        -- receive the shared-fact change; publication is still lesson-specific.
        insert into public.teaching_dictionary_lesson_review_requests
          (environment_key,micro_skill_key,canonical_word_id,sense_id,request_id,requested_by)
        select distinct current_decision.environment_key,dependent.micro_skill_key,c.canonical_word_id,
          binding.sense_id,c.id,p_actor
        from public.teaching_dictionary_current_candidate_decisions current_decision
        cross join lateral (
          select p.micro_skill_key from public.canonical_teaching_dictionary_prefix_members m
          join public.canonical_teaching_dictionary_prefix_profiles p on p.id=m.prefix_profile_id
          where m.canonical_word_id=c.canonical_word_id and m.row_status='active' and p.row_status='active'
            and p.micro_skill_key<>p_micro_skill_key
          union
          select p.micro_skill_key from public.canonical_teaching_dictionary_suffix_members m
          join public.canonical_teaching_dictionary_suffix_profiles p on p.id=m.suffix_profile_id
          where m.canonical_word_id=c.canonical_word_id and m.row_status='active' and p.row_status='active'
            and p.micro_skill_key<>p_micro_skill_key
        ) dependent
        left join public.teaching_dictionary_effective_lesson_sense_bindings binding
          on binding.environment_key=current_decision.environment_key and binding.micro_skill_key=dependent.micro_skill_key
          and binding.canonical_word_id=c.canonical_word_id
        where current_decision.canonical_word_id=c.canonical_word_id
          and current_decision.micro_skill_key=p_micro_skill_key and current_decision.action='approve'
          and current_decision.sense_id=d.payload#>>array['skillSenseIds',p_micro_skill_key]
        on conflict (environment_key,micro_skill_key,canonical_word_id,request_id) do nothing;
      end if;$new$;
begin
  select pg_get_functiondef('public.launch_teaching_dictionary_lesson_v2(text,text,uuid[],uuid,text,text,uuid,jsonb)'::regprocedure) into body;
  if position(new_value in body)>0 then return; end if;
  if (length(body)-length(replace(body,old_value,'')))/length(old_value)<>1 then
    raise exception 'TEACHING_AFFIX_LAUNCH_FUNCTION_CHANGED';
  end if;
  execute replace(body,old_value,new_value);
end $$;

notify pgrst,'reload schema';
commit;
