begin;

create table public.teaching_dictionary_multi_sense_csv_batches (
  request_id uuid primary key,
  content_hash text not null,
  word_count integer not null check(word_count between 1 and 100),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now()
);
alter table public.teaching_dictionary_multi_sense_csv_batches enable row level security;
revoke all on public.teaching_dictionary_multi_sense_csv_batches from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_multi_sense_csv_batches to service_role;

create function public.review_teaching_dictionary_multi_sense_csv_batch(
  p_request_id uuid,p_bundles jsonb,p_actor uuid,p_source_reference text
) returns integer language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_existing public.teaching_dictionary_multi_sense_csv_batches%rowtype;
  v_hash text;
  v_bundle jsonb;
  v_count integer;
begin
  if p_request_id is null or p_actor is null
    or nullif(btrim(p_source_reference),'') is null
    or jsonb_typeof(p_bundles) is distinct from 'array'
    or jsonb_array_length(p_bundles) not between 1 and 100 then
    raise exception 'MULTI_SENSE_CSV_BATCH_INVALID';
  end if;
  v_count:=jsonb_array_length(p_bundles);
  if (select count(distinct value->>'wordId') from jsonb_array_elements(p_bundles))<>v_count
    or exists(select 1 from jsonb_array_elements(p_bundles) b
      where nullif(btrim(b->>'wordId'),'') is null) then
    raise exception 'MULTI_SENSE_CSV_BATCH_DUPLICATE_WORD';
  end if;
  v_hash:=public.adle_generic_snapshot_json_sha256_v1(p_bundles);
  select * into v_existing from public.teaching_dictionary_multi_sense_csv_batches
    where request_id=p_request_id;
  if v_existing.request_id is not null then
    if v_existing.content_hash<>v_hash or v_existing.reviewed_by<>p_actor then
      raise exception 'MULTI_SENSE_CSV_BATCH_REQUEST_CONFLICT'; end if;
    return v_existing.word_count;
  end if;
  for v_bundle in select value from jsonb_array_elements(p_bundles) order by value->>'wordId' loop
    perform public.review_teaching_dictionary_multi_sense_csv(
      gen_random_uuid(),(v_bundle->>'wordId')::uuid,v_bundle->>'sourceSenseReviewedAt',
      v_bundle->'senseSet',v_bundle->'analyses',p_actor,p_source_reference);
  end loop;
  insert into public.teaching_dictionary_multi_sense_csv_batches
    (request_id,content_hash,word_count,reviewed_by)
  values(p_request_id,v_hash,v_count,p_actor);
  return v_count;
end $$;
revoke all on function public.review_teaching_dictionary_multi_sense_csv_batch(
  uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_multi_sense_csv_batch(
  uuid,jsonb,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
