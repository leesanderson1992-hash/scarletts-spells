begin;
-- A saved word review has one family task per approved base/root component.
-- Existing decisions and component histories remain intact.
create function public.sync_dictionary_family_components(p_environment text,p_word uuid default null,p_skill text default null)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  with seeds as (
    select distinct on(environment_key,micro_skill_key,canonical_word_id,sense_id) *
    from public.teaching_dictionary_family_dependencies
    where environment_key=p_environment and (p_word is null or canonical_word_id=p_word)
      and (p_skill is null or micro_skill_key=p_skill)
    order by environment_key,micro_skill_key,canonical_word_id,sense_id,updated_at desc
  )
  insert into public.teaching_dictionary_family_dependencies(environment_key,micro_skill_key,canonical_word_id,sense_id,
    component_part_id,base_form,base_kind,expected_meaning,expected_morphology_id,expected_reviewed_at,context,reviewed_by)
  select d.environment_key,d.micro_skill_key,d.canonical_word_id,d.sense_id,p->>'id',lower(p->>'sourceText'),
    case when p->>'kind'='root' then 'bound_root' else 'free_base' end,p->>'gloss',m.id,s.reviewed_at,d.context,d.reviewed_by
  from seeds d join public.teaching_dictionary_current_sense_morphology m
    on m.canonical_word_id=d.canonical_word_id and m.sense_id=d.sense_id
  join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=d.canonical_word_id
  cross join lateral jsonb_array_elements(m.morphology_parts) p
  where p->>'kind' in ('base','root')
  on conflict(environment_key,micro_skill_key,canonical_word_id,sense_id,component_part_id) do nothing;
  get diagnostics n=row_count;
  return n;
end $$;
revoke all on function public.sync_dictionary_family_components(text,uuid,text) from public,anon,authenticated;
grant execute on function public.sync_dictionary_family_components(text,uuid,text) to service_role;
select public.sync_dictionary_family_components('staging');
select public.sync_dictionary_family_components('production');
notify pgrst,'reload schema';
commit;
