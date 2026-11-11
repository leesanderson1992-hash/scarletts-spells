begin;

create table public.teaching_dictionary_ing_review_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  filename text not null,
  version integer not null default 0,
  entries jsonb not null check (jsonb_typeof(entries)='array' and jsonb_array_length(entries) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.teaching_dictionary_ing_review_batches(created_by,updated_at desc);
alter table public.teaching_dictionary_ing_review_batches enable row level security;
revoke all on public.teaching_dictionary_ing_review_batches from public,anon,authenticated;
grant select,insert,update on public.teaching_dictionary_ing_review_batches to service_role;

-- Commit the dictionary write and its queue receipt together. The caller can
-- resume the lesson check if the request stops after this transaction.
create function public.apply_teaching_dictionary_ing_review_word(
  p_batch uuid,p_actor uuid,p_version integer,p_index integer,p_bundle jsonb
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_batch public.teaching_dictionary_ing_review_batches%rowtype;
  v_entry jsonb;
  v_word uuid;
  v_source uuid;
begin
  select * into v_batch from public.teaching_dictionary_ing_review_batches
    where id=p_batch and created_by=p_actor for update;
  v_entry := v_batch.entries->p_index;
  if v_batch.version is distinct from p_version or p_index<0 or v_entry is null or v_entry ? 'outcome' then
    raise exception 'ING_REVIEW_BATCH_CHANGED';
  end if;
  v_source := nullif(p_bundle->>'wordId','')::uuid;
  if v_source is not null then
    if exists (
      select id from public.teaching_dictionary_current_sense_morphology where canonical_word_id=v_source
      except select (a->>'id')::uuid from jsonb_array_elements(v_entry#>'{existing,analyses}') a
    ) or exists (
      select (a->>'id')::uuid from jsonb_array_elements(v_entry#>'{existing,analyses}') a
      except select id from public.teaching_dictionary_current_sense_morphology where canonical_word_id=v_source
    ) or exists (
      select id from public.teaching_dictionary_current_sense_family_memberships where canonical_word_id=v_source
      except select (a->>'id')::uuid from jsonb_array_elements(v_entry#>'{existing,links}') a
    ) or exists (
      select (a->>'id')::uuid from jsonb_array_elements(v_entry#>'{existing,links}') a
      except select id from public.teaching_dictionary_current_sense_family_memberships where canonical_word_id=v_source
    ) then raise exception 'MULTI_SENSE_CSV_SOURCE_CHANGED'; end if;
  end if;
  v_word := public.import_reviewed_teaching_dictionary_word(
    (v_entry->>'requestId')::uuid,v_source,p_bundle->>'displayWord',p_bundle->>'sourceSenseReviewedAt',
    p_bundle->'senseSet',p_bundle->'analyses',p_actor,'Regular -ing bulk review: '||p_batch::text);
  update public.teaching_dictionary_ing_review_batches set entries=jsonb_set(entries,array[p_index::text,'outcome'],
    jsonb_build_object('status','saved','wordId',v_word)),version=version+1,updated_at=now()
    where id=p_batch;
  return v_word;
end $$;
revoke all on function public.apply_teaching_dictionary_ing_review_word(uuid,uuid,integer,integer,jsonb)
  from public,anon,authenticated;
grant execute on function public.apply_teaching_dictionary_ing_review_word(uuid,uuid,integer,integer,jsonb)
  to service_role;
notify pgrst,'reload schema';

commit;
