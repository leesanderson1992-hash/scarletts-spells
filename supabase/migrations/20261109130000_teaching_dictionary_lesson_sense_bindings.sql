create table public.teaching_dictionary_lesson_sense_bindings (
  environment_key text not null check (environment_key in ('local','staging','production')),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  sense_id text not null check (btrim(sense_id) <> ''),
  sense_snapshot jsonb not null,
  pronunciation_snapshot jsonb,
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  primary key (environment_key,canonical_word_id,micro_skill_key)
);
alter table public.teaching_dictionary_lesson_sense_bindings enable row level security;
revoke all on public.teaching_dictionary_lesson_sense_bindings from public,anon,authenticated;
grant select on public.teaching_dictionary_lesson_sense_bindings to service_role;

create function public.review_teaching_dictionary_lesson_sense(
  p_environment text,p_word uuid,p_skill text,p_sense text,p_actor uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_set jsonb; v_sense jsonb; v_pronunciation jsonb;
begin
  if p_environment not in ('local','staging','production') or p_actor is null then
    raise exception 'TEACHING_LESSON_SENSE_INVALID';
  end if;
  select sense_set into v_set from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=p_word;
  if v_set is null then raise exception 'TEACHING_LESSON_REVIEWED_SENSE_REQUIRED'; end if;
  select value into v_sense from jsonb_array_elements(v_set->'senses')
    where value->>'id'=p_sense;
  if v_sense is null then raise exception 'TEACHING_LESSON_SENSE_INVALID'; end if;
  select value into v_pronunciation from jsonb_array_elements(v_set->'pronunciations')
    where value->>'id'=v_sense->>'pronunciationId';
  if v_sense->>'pronunciationId' is not null and v_pronunciation is null then
    raise exception 'TEACHING_LESSON_PRONUNCIATION_INVALID';
  end if;
  if not exists (
    select 1 from public.adle_reviewed_word_skill_pairs pair
    join public.adle_reviewed_word_skill_releases release on release.id=pair.release_id
    where pair.canonical_word_id=p_word and pair.micro_skill_key=p_skill
      and pair.relationship_role='demonstrates' and release.environment_key=p_environment
      and not exists (select 1 from public.adle_reviewed_word_skill_withdrawals withdrawal
        where withdrawal.release_id=release.id)
  ) then raise exception 'TEACHING_LESSON_SKILL_APPROVAL_REQUIRED'; end if;
  insert into public.teaching_dictionary_lesson_sense_bindings
    (environment_key,canonical_word_id,micro_skill_key,sense_id,sense_snapshot,pronunciation_snapshot,reviewed_by)
  values (p_environment,p_word,p_skill,p_sense,v_sense,v_pronunciation,p_actor)
  on conflict (environment_key,canonical_word_id,micro_skill_key) do update
    set sense_id=excluded.sense_id,sense_snapshot=excluded.sense_snapshot,
      pronunciation_snapshot=excluded.pronunciation_snapshot,reviewed_by=excluded.reviewed_by,
      reviewed_at=now();
end $$;
revoke all on function public.review_teaching_dictionary_lesson_sense(text,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_lesson_sense(text,uuid,text,text,uuid) to service_role;
