begin;

create table public.teaching_dictionary_bulk_review_exclusions (
  environment_key text not null check (environment_key in ('local', 'staging', 'production')),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  primary key (environment_key, micro_skill_key, canonical_word_id)
);
alter table public.teaching_dictionary_bulk_review_exclusions enable row level security;
revoke all on public.teaching_dictionary_bulk_review_exclusions from public, anon, authenticated;
grant select, insert, update, delete on public.teaching_dictionary_bulk_review_exclusions to service_role;

-- A pair can have more than one manager release. Withdraw them together so
-- the cross never leaves a partially removed assignment.
create function public.withdraw_teaching_dictionary_manager_skill_pair(
  p_environment text, p_skill_key text, p_word_id uuid, p_actor uuid
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_release record; v_count integer := 0;
begin
  if p_environment not in ('local','staging','production') or p_skill_key is null
    or p_word_id is null or p_actor is null then raise exception 'TEACHING_BULK_PAIR_INVALID'; end if;
  if not exists(select 1 from public.adle_word_skill_review_controls
    where environment_key=p_environment and withdrawal_enabled)
    then raise exception 'TEACHING_BULK_WITHDRAWAL_DISABLED'; end if;
  -- The manager owns only its one-pair packages. Another explicit publication
  -- for this pair makes the whole operation ineligible.
  if exists (
    select 1 from public.adle_reviewed_word_skill_pairs pair
      join public.adle_reviewed_word_skill_releases release on release.id=pair.release_id
      left join public.adle_reviewed_word_skill_withdrawals withdrawn on withdrawn.release_id=release.id
      left join public.adle_word_skill_package_publications publication on publication.release_id=release.id
      left join public.adle_word_skill_candidate_packages package on package.id=publication.package_id
    where pair.canonical_word_id=p_word_id and pair.micro_skill_key=p_skill_key
      and release.environment_key=p_environment and withdrawn.release_id is null
      and (package.id is null or package.environment_key<>p_environment
        or (package.package_key not like 'tdm-bulk:%' and package.package_key not like 'tdm:%')
        or jsonb_array_length(package.candidates)<>1
        or package.candidates->0->>'canonicalWordId'<>p_word_id::text
        or package.candidates->0->>'microSkillKey'<>p_skill_key)
  ) then raise exception 'TEACHING_BULK_PAIR_OTHER_OWNER'; end if;
  for v_release in
    select distinct release.id from public.adle_reviewed_word_skill_pairs pair
      join public.adle_reviewed_word_skill_releases release on release.id=pair.release_id
      join public.adle_word_skill_package_publications publication on publication.release_id=release.id
      join public.adle_word_skill_candidate_packages package on package.id=publication.package_id
      left join public.adle_reviewed_word_skill_withdrawals withdrawn on withdrawn.release_id=release.id
    where pair.canonical_word_id=p_word_id and pair.micro_skill_key=p_skill_key
      and release.environment_key=p_environment and package.environment_key=p_environment
      and withdrawn.release_id is null and jsonb_array_length(package.candidates)=1
      and package.candidates->0->>'canonicalWordId'=p_word_id::text
      and package.candidates->0->>'microSkillKey'=p_skill_key
      and (package.package_key like 'tdm-bulk:%' or package.package_key like 'tdm:%')
  loop
    perform public.withdraw_word_skill_reviewed_release(v_release.id,p_environment,p_actor,
      'Removed in Teaching Dictionary Manager bulk assignment');
    v_count := v_count+1;
  end loop;
  if v_count=0 then raise exception 'TEACHING_BULK_PAIR_NOT_MANAGER_OWNED'; end if;
  delete from public.teaching_dictionary_bulk_review_exclusions
    where environment_key=p_environment and micro_skill_key=p_skill_key and canonical_word_id=p_word_id;
  return v_count;
end $$;
revoke all on function public.withdraw_teaching_dictionary_manager_skill_pair(text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.withdraw_teaching_dictionary_manager_skill_pair(text,text,uuid,uuid) to service_role;

commit;
