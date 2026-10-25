begin;

-- The approved pairs come from the existing governed relationship interpreter.
-- Route-content rows preserve the manager's current candidate semantics. Keep
-- the membership check in Postgres so this filter does not transfer every
-- prefix, suffix, base-family and route-content row to the application.
create function public.teaching_dictionary_admin_route_blocked_ids(
  p_approved_pairs jsonb default '[]'::jsonb
) returns uuid[] language sql stable security definer
set search_path = public, pg_temp as $$
  with candidates as (
    select distinct (pair->>'wordId')::uuid as word_id,
      pair->>'microSkillKey' as micro_skill_key,
      pair->>'routeId' as route_id
    from jsonb_array_elements(p_approved_pairs) pair
    where pair->>'routeId' in ('dynamic_prefix_word_lab','dynamic_affix_word_lab','base_word_lab')
    union
    select distinct c.canonical_word_id,c.micro_skill_key,c.route_id
    from public.teaching_dictionary_route_content_versions c
    where c.route_id in ('dynamic_prefix_word_lab','dynamic_affix_word_lab','base_word_lab')
  )
  select coalesce(array_agg(distinct c.word_id), '{}'::uuid[])
  from candidates c
  where (c.route_id = 'dynamic_prefix_word_lab' and not exists (
      select 1 from public.canonical_teaching_dictionary_prefix_members m
      join public.canonical_teaching_dictionary_prefix_profiles p on p.id = m.prefix_profile_id
      where m.canonical_word_id = c.word_id and m.row_status = 'active'
        and p.row_status = 'active' and p.production_enabled
        and p.micro_skill_key = c.micro_skill_key
    ))
    or (c.route_id = 'dynamic_affix_word_lab' and not exists (
      select 1 from public.canonical_teaching_dictionary_suffix_members m
      join public.canonical_teaching_dictionary_suffix_profiles p on p.id = m.suffix_profile_id
      where m.canonical_word_id = c.word_id and m.row_status = 'active'
        and p.row_status = 'active' and p.production_enabled
        and p.micro_skill_key = c.micro_skill_key
    ))
    or (c.route_id = 'base_word_lab' and not exists (
      select 1 from public.canonical_teaching_dictionary_base_word_family_members m
      where m.canonical_word_id = c.word_id and m.row_status = 'active'
    ));
$$;

revoke all on function public.teaching_dictionary_admin_route_blocked_ids(jsonb)
  from public, anon, authenticated;
grant execute on function public.teaching_dictionary_admin_route_blocked_ids(jsonb)
  to service_role;

commit;
