begin;

create index if not exists teaching_dictionary_prefix_members_word_scope_idx
  on public.canonical_teaching_dictionary_prefix_members
  (canonical_word_id, row_status, prefix_profile_id);
create index if not exists teaching_dictionary_suffix_members_word_scope_idx
  on public.canonical_teaching_dictionary_suffix_members
  (canonical_word_id, row_status, suffix_profile_id);

-- Discover only the route/skill pairs that can mention one word. This is a
-- candidate set: the existing preflight remains the final readiness authority.
create or replace function public.teaching_dictionary_word_preflight_scopes(
  p_word_id uuid, p_environment text
)
returns table(route_id text, micro_skill_key text)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct candidate.route_id, candidate.micro_skill_key
  from (
    select c.route_id, c.micro_skill_key
      from public.teaching_dictionary_route_content_versions c
      where c.canonical_word_id = p_word_id
    union all
    select 'dynamic_prefix_word_lab'::text, p.micro_skill_key
      from public.canonical_teaching_dictionary_prefix_members m
      join public.canonical_teaching_dictionary_prefix_profiles p on p.id = m.prefix_profile_id
      where m.canonical_word_id = p_word_id and m.row_status = 'active' and p.row_status = 'active'
    union all
    select 'dynamic_affix_word_lab'::text, p.micro_skill_key
      from public.canonical_teaching_dictionary_suffix_members m
      join public.canonical_teaching_dictionary_suffix_profiles p on p.id = m.suffix_profile_id
      where m.canonical_word_id = p_word_id and m.row_status = 'active' and p.row_status = 'active'
    union all
    select 'weak_vowel_word_lab'::text, w.micro_skill_key
      from public.adle_weak_vowel_content_publications w
      where w.canonical_word_id = p_word_id
    union all
    select h.route_id, h.micro_skill_key
      from public.adle_route_activation_heads h
      join public.adle_route_activation_revisions r on r.id = h.current_revision_id
      join public.adle_curriculum_release_dependencies d
        on d.release_manifest_id = r.release_manifest_id and d.micro_skill_key = h.micro_skill_key
      join public.adle_curriculum_dependency_authorities a on a.id = d.authority_id
      where p_environment is not null and h.environment_key = p_environment
        and a.semantic_projection::text like '%' || p_word_id::text || '%'
  ) candidate
  order by candidate.route_id, candidate.micro_skill_key;
$$;

revoke all on function public.teaching_dictionary_word_preflight_scopes(uuid, text)
  from public, anon, authenticated;
grant execute on function public.teaching_dictionary_word_preflight_scopes(uuid, text)
  to service_role;

commit;
