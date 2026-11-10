begin;

-- A published CSV word can outlive its server action. Record the supported
-- candidate work in the same transaction as its Overview and skill binding.
create table public.teaching_dictionary_import_candidate_handoffs (
  draft_id uuid not null references public.teaching_dictionary_manager_drafts(id),
  environment_key text not null check (environment_key in ('staging','production')),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  sense_id text not null check (btrim(sense_id) <> ''),
  queued_at timestamptz not null default now(),
  primary key (draft_id,micro_skill_key,sense_id)
);
create index teaching_import_candidate_handoffs_word_idx
  on public.teaching_dictionary_import_candidate_handoffs
  (environment_key,canonical_word_id,micro_skill_key,sense_id);
create trigger teaching_import_candidate_handoffs_immutable before update or delete
  on public.teaching_dictionary_import_candidate_handoffs for each row
  execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_import_candidate_handoffs enable row level security;
revoke all on public.teaching_dictionary_import_candidate_handoffs from public,anon,authenticated;
grant select on public.teaching_dictionary_import_candidate_handoffs to service_role;

create or replace function public.publish_teaching_dictionary_reviewed_csv_senses(
  p_draft uuid,p_actor uuid,p_environment text,p_mode text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.teaching_dictionary_manager_drafts%rowtype;
  v_word uuid; v_sense text; v_skill text;
begin
  if p_actor is null or p_environment not in ('staging','production')
    or p_mode not in ('reconciled','free_base','suffix_overview','bound_root') then
    raise exception 'TEACHING_CSV_SENSE_PUBLICATION_INVALID';
  end if;
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  if d.id is null or d.source_reference !~ '^CSV batch [a-f0-9-]{36},'
    or not exists (select 1 from public.teaching_dictionary_import_skill_reviews r
      where r.draft_id=d.id and r.reviewed_by=p_actor
        and r.source_reference=d.source_reference
        and r.skill_fingerprint=public.adle_generic_snapshot_json_sha256_v1(d.payload->'skillKeys')) then
    raise exception 'TEACHING_CSV_SKILL_REVIEW_REQUIRED';
  end if;
  if d.payload ? 'senseSet' then
    if jsonb_typeof(d.payload->'senseSet'->'senses') is distinct from 'array'
      or jsonb_array_length(d.payload->'senseSet'->'senses') <> 1 then
      raise exception 'TEACHING_CSV_SINGLE_SENSE_REQUIRED';
    end if;
    v_sense:=nullif(btrim(d.payload->'senseSet'->'senses'->0->>'id'),'');
    if v_sense is null then raise exception 'TEACHING_CSV_SINGLE_SENSE_REQUIRED'; end if;
  end if;
  if v_sense is null and exists(select 1 from jsonb_array_elements_text(d.payload->'skillKeys') skill
    where skill like 'D4_INF_ING_ENDINGS_%' or skill='D4_MOR_SUFFIXES_ABLE_IBLE') then
    raise exception 'TEACHING_CSV_CANDIDATE_SENSE_REQUIRED';
  end if;
  case p_mode
    when 'reconciled' then
      v_word:=public.publish_teaching_dictionary_reviewed_reconciled_draft(p_draft,p_actor,p_environment);
    when 'free_base' then
      v_word:=public.publish_teaching_dictionary_reviewed_free_base_draft(p_draft,p_actor,p_environment);
    when 'suffix_overview' then
      v_word:=public.publish_teaching_dictionary_reviewed_suffix_overview_draft(p_draft,p_actor,p_environment);
    when 'bound_root' then
      v_word:=public.publish_teaching_dictionary_reviewed_bound_root_draft(p_draft,p_actor,p_environment);
  end case;
  if v_sense is not null then
    for v_skill in select value from jsonb_array_elements_text(d.payload->'skillKeys') value loop
      perform public.review_teaching_dictionary_lesson_sense(
        p_environment,v_word,v_skill,v_sense,p_actor);
      if v_skill like 'D4_INF_ING_ENDINGS_%' or v_skill='D4_MOR_SUFFIXES_ABLE_IBLE' then
        insert into public.teaching_dictionary_import_candidate_handoffs
          (draft_id,environment_key,canonical_word_id,micro_skill_key,sense_id)
        values(d.id,p_environment,v_word,v_skill,v_sense);
      end if;
    end loop;
  end if;
  return v_word;
end $$;
revoke all on function public.publish_teaching_dictionary_reviewed_csv_senses(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_reviewed_csv_senses(uuid,uuid,text,text)
  to service_role;

notify pgrst,'reload schema';
commit;
