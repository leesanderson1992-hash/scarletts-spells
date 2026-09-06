create table public.writing_occurrences (
  id text primary key,
  snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  field_path text not null,
  start_utf16 integer not null check(start_utf16>=0),
  end_utf16 integer not null check(end_utf16>start_utf16),
  observed_text text not null,
  field_hash text not null,
  provenance text not null check(provenance in ('learner_response','unknown')),
  extractor_version text not null,
  unique(snapshot_id,field_path,start_utf16,end_utf16,field_hash)
);
create table public.writing_occurrence_interpretations (
  id uuid primary key default gen_random_uuid(),
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  run_id uuid not null references public.writing_shadow_runs(id) on delete cascade,
  canonical_word_id uuid references public.canonical_teaching_dictionary_words(id),
  normalized_form text not null,
  dialect text not null,
  resolution_status text not null check(resolution_status in ('resolved','ambiguous','inactive','unmapped','not_assessed')),
  interpretation jsonb not null,
  unique(occurrence_id,run_id)
);
create index writing_unresolved_form_idx on public.writing_occurrence_interpretations(normalized_form,dialect,resolution_status);
create index writing_interpretation_word_idx on public.writing_occurrence_interpretations(canonical_word_id);

create table public.writing_occurrence_assessments (
  id uuid primary key default gen_random_uuid(),
  interpretation_id uuid not null references public.writing_occurrence_interpretations(id) on delete cascade,
  parent_verification_id uuid references public.parent_verifications(id),
  outcome text not null default 'unknown' check(outcome in ('correct','incorrect','unknown')),
  independence text not null default 'unknown' check(independence in ('independent','scaffolded','answer_visible','unknown')),
  environment text check(environment in ('CONTROLLED_LESSON','ISOLATED_RETRIEVAL','CONTEXTUAL_TRANSFER','AUTHENTIC_WRITING','REPAIR','EXPOSURE_ONLY')),
  assessment jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check(outcome='unknown' or parent_verification_id is not null)
);
create index writing_assessment_interpretation_idx on public.writing_occurrence_assessments(interpretation_id,created_at,id);
create function public.assert_writing_assessment_verification_scope() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.parent_verification_id is not null and not exists(
    select 1 from public.parent_verifications v
      join public.writing_occurrence_interpretations i on i.id=new.interpretation_id
      join public.writing_occurrences o on o.id=i.occurrence_id
      join public.writing_source_snapshots s on s.id=o.snapshot_id
    where v.id=new.parent_verification_id and v.parent_user_id=s.parent_user_id and v.child_id=s.child_id
      and v.task_submission_id=s.submission_id and v.source_entity_id=o.id
  ) then raise exception 'writing_verification_scope_invalid'; end if;
  return new;
end $$;
create trigger writing_assessment_verification_scope before insert on public.writing_occurrence_assessments
  for each row execute function public.assert_writing_assessment_verification_scope();
revoke all on function public.assert_writing_assessment_verification_scope() from public,anon,authenticated;

create function public.reject_writing_fact_update() returns trigger language plpgsql as $$
begin raise exception 'writing_fact_immutable'; end $$;
create trigger writing_occurrence_immutable before update on public.writing_occurrences for each row execute function public.reject_writing_fact_update();
create trigger writing_interpretation_immutable before update on public.writing_occurrence_interpretations for each row execute function public.reject_writing_fact_update();
create trigger writing_assessment_immutable before update on public.writing_occurrence_assessments for each row execute function public.reject_writing_fact_update();

create function public.persist_writing_shadow_result(p_run_id uuid,p_lease_token uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.writing_shadow_runs%rowtype; item jsonb; interpreted_id uuid;
begin
  select * into r from public.writing_shadow_runs where id=p_run_id and status='processing' and lease_token=p_lease_token for update;
  if r.id is null then return false; end if;
  if jsonb_typeof(p_result) is distinct from 'object' then raise exception 'writing_result_invalid'; end if;
  for item in select value from jsonb_array_elements(coalesce(p_result->'occurrences','[]'::jsonb)) loop
    insert into public.writing_occurrences(id,snapshot_id,field_path,start_utf16,end_utf16,observed_text,field_hash,provenance,extractor_version)
    values(item->>'id',r.snapshot_id,item->>'fieldKey',(item->>'start')::integer,(item->>'end')::integer,item->>'observedText',item->>'textHash',item->>'provenance',p_result->>'extractionVersion')
    on conflict(id) do nothing;
    if not exists(select 1 from public.writing_occurrences o where o.id=item->>'id' and o.snapshot_id=r.snapshot_id
      and o.field_path=item->>'fieldKey' and o.start_utf16=(item->>'start')::integer and o.end_utf16=(item->>'end')::integer
      and o.observed_text=item->>'observedText' and o.field_hash=item->>'textHash') then raise exception 'writing_occurrence_collision'; end if;
    insert into public.writing_occurrence_interpretations(occurrence_id,run_id,canonical_word_id,normalized_form,dialect,resolution_status,interpretation)
    values(item->>'id',r.id,nullif(item->'interpretation'->>'canonicalWordId','')::uuid,item->'interpretation'->>'normalizedForm',item->'interpretation'->>'dialect',item->'interpretation'->>'status',item->'interpretation')
    returning id into interpreted_id;
    insert into public.writing_occurrence_assessments(id,interpretation_id,assessment)
    values(coalesce((item->>'assessmentId')::uuid,gen_random_uuid()),interpreted_id,jsonb_build_object('qualification','PENDING','contextStatus','NOT_ASSESSED','source','whole_writing_shadow'));
  end loop;
  return public.finish_writing_shadow_run(r.id,p_lease_token,p_result,null);
end $$;

create function public.enqueue_writing_shadow_replay(p_snapshot_ids uuid[],p_release_key text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if nullif(btrim(p_release_key),'') is null or cardinality(p_snapshot_ids)>1000 then raise exception 'writing_replay_invalid'; end if;
  insert into public.writing_shadow_runs(snapshot_id,replay_key)
    select s.id,p_release_key from public.writing_source_snapshots s
    join public.writing_shadow_controls c on c.child_id=s.child_id and c.parent_user_id=s.parent_user_id and c.processing_enabled
    where s.id=any(p_snapshot_ids) on conflict do nothing;
  get diagnostics n=row_count; return n;
end $$;

alter table public.writing_occurrences enable row level security;
alter table public.writing_occurrence_interpretations enable row level security;
alter table public.writing_occurrence_assessments enable row level security;
create policy writing_occurrence_owner_read on public.writing_occurrences for select to authenticated using (
 exists(select 1 from public.writing_source_snapshots s where s.id=snapshot_id and s.parent_user_id=auth.uid()));
create policy writing_interpretation_owner_read on public.writing_occurrence_interpretations for select to authenticated using (
 exists(select 1 from public.writing_occurrences o join public.writing_source_snapshots s on s.id=o.snapshot_id where o.id=occurrence_id and s.parent_user_id=auth.uid()));
create policy writing_assessment_owner_read on public.writing_occurrence_assessments for select to authenticated using (
 exists(select 1 from public.writing_occurrence_interpretations i join public.writing_occurrences o on o.id=i.occurrence_id join public.writing_source_snapshots s on s.id=o.snapshot_id where i.id=interpretation_id and s.parent_user_id=auth.uid()));
revoke all on public.writing_occurrences,public.writing_occurrence_interpretations,public.writing_occurrence_assessments from anon,authenticated;
grant select on public.writing_occurrences,public.writing_occurrence_interpretations,public.writing_occurrence_assessments to authenticated;
grant all on public.writing_occurrences,public.writing_occurrence_interpretations,public.writing_occurrence_assessments to service_role;
revoke all on function public.reject_writing_fact_update(),public.persist_writing_shadow_result(uuid,uuid,jsonb),public.enqueue_writing_shadow_replay(uuid[],text) from public,anon,authenticated;
grant execute on function public.persist_writing_shadow_result(uuid,uuid,jsonb),public.enqueue_writing_shadow_replay(uuid[],text) to service_role;
