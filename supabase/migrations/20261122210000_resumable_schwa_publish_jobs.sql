begin;
create table public.teaching_dictionary_publish_jobs(
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 environment_key text not null check(environment_key in('staging','production')),
 micro_skill_key text not null, created_by uuid not null references auth.users(id),
 status text not null default 'active' check(status in('active','paused','completed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.teaching_dictionary_publish_job_items(
 job_id uuid not null references public.teaching_dictionary_publish_jobs(id),
 draft_id uuid not null references public.teaching_dictionary_manager_drafts(id),
 canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
 word text not null, ordinal integer not null,
 status text not null default 'pending' check(status in('pending','publishing','published','failed','blocked')),
 attempts integer not null default 0, error text, lease_until timestamptz, lease_token uuid,
 published_version_id uuid, updated_at timestamptz not null default now(),
 primary key(job_id,draft_id), unique(job_id,canonical_word_id)
);
create index dictionary_publish_job_owner on public.teaching_dictionary_publish_jobs(environment_key,created_by,micro_skill_key,created_at desc);
alter table public.teaching_dictionary_publish_jobs enable row level security;
alter table public.teaching_dictionary_publish_job_items enable row level security;
revoke all on public.teaching_dictionary_publish_jobs,public.teaching_dictionary_publish_job_items from public,anon,authenticated;
grant select,insert,update on public.teaching_dictionary_publish_jobs,public.teaching_dictionary_publish_job_items to service_role;
create function public.start_dictionary_schwa_publish_job(p_environment text,p_actor uuid,p_skill text,p_request uuid,p_drafts uuid[])
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.teaching_dictionary_publish_jobs%rowtype; total integer;
begin
 if p_environment not in('staging','production') or p_actor is null or p_request is null
   or coalesce(cardinality(p_drafts),0) not between 1 and 200 or p_skill not like 'D4_SCHWA_%' then raise exception 'PUBLISH_JOB_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('schwa-publish:'||p_environment||p_actor::text||p_skill,0));
 select * into j from public.teaching_dictionary_publish_jobs where request_id=p_request;
 if j.id is not null then
   if j.created_by<>p_actor or j.environment_key<>p_environment or j.micro_skill_key<>p_skill
     or (select array_agg(draft_id order by draft_id) from public.teaching_dictionary_publish_job_items where job_id=j.id)
       is distinct from (select array_agg(distinct x order by x) from unnest(p_drafts) x) then raise exception 'PUBLISH_JOB_REQUEST_CONFLICT'; end if;
   return j.id;
 end if;
 select * into j from public.teaching_dictionary_publish_jobs where environment_key=p_environment and created_by=p_actor
   and micro_skill_key=p_skill and status in('active','paused') order by created_at desc limit 1;
 if j.id is not null then return j.id; end if;
 select count(distinct canonical_word_id) into total from public.teaching_dictionary_manager_drafts
   where id=any(p_drafts) and source_reference='Schwa Bulk review workbook v1' and payload->'skillKeys' ? p_skill;
 if total<>(select count(distinct x) from unnest(p_drafts) x) then raise exception 'PUBLISH_JOB_DRAFTS_INVALID'; end if;
 insert into public.teaching_dictionary_publish_jobs(request_id,environment_key,micro_skill_key,created_by)
   values(p_request,p_environment,p_skill,p_actor) returning * into j;
 insert into public.teaching_dictionary_publish_job_items(job_id,draft_id,canonical_word_id,word,ordinal)
   select j.id,d.id,d.canonical_word_id,d.payload->>'displayWord',x.ordinality::integer
   from unnest(p_drafts) with ordinality x(id,ordinality) join public.teaching_dictionary_manager_drafts d on d.id=x.id;
 return j.id;
end $$;
create function public.claim_dictionary_schwa_publish_items(p_environment text,p_actor uuid,p_job uuid)
returns setof public.teaching_dictionary_publish_job_items language sql security definer set search_path=public,pg_temp as $$
 update public.teaching_dictionary_publish_job_items item set status='publishing',attempts=attempts+1,
   lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',error=null,updated_at=now()
 where (job_id,draft_id) in(select i.job_id,i.draft_id from public.teaching_dictionary_publish_job_items i
   join public.teaching_dictionary_publish_jobs j on j.id=i.job_id
   where j.id=p_job and j.environment_key=p_environment and j.created_by=p_actor and j.status='active'
     and (i.status='pending' or i.status='publishing' and i.lease_until<now())
   order by i.ordinal limit 2 for update of i skip locked)
 returning item.*;
$$;
revoke all on function public.start_dictionary_schwa_publish_job(text,uuid,text,uuid,uuid[]),public.claim_dictionary_schwa_publish_items(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_dictionary_schwa_publish_job(text,uuid,text,uuid,uuid[]),public.claim_dictionary_schwa_publish_items(text,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
