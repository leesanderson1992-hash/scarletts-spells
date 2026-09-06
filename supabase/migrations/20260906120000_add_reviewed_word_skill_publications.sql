-- An admitted Phase B source, not a copy of the effective relationship graph.
create table public.adle_reviewed_word_skill_releases (
  id uuid primary key default gen_random_uuid(),
  release_key text not null unique check(length(btrim(release_key))>0),
  environment_key text not null check(environment_key in ('local','staging','production')),
  candidate_manifest jsonb not null check(jsonb_typeof(candidate_manifest)='object'),
  reviewed_by uuid not null references auth.users(id),
  review_note text not null check(length(btrim(review_note))>0),
  published_at timestamptz not null default now()
);
create table public.adle_reviewed_word_skill_pairs (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.adle_reviewed_word_skill_releases(id),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  relationship_role text not null check(relationship_role in ('demonstrates','contrast_only','diagnostic_only','negative_only','non_positive')),
  source_reference text not null check(length(btrim(source_reference))>0),
  licence_reference text not null check(length(btrim(licence_reference))>0),
  unique(release_id,canonical_word_id,micro_skill_key)
);
create table public.adle_reviewed_word_skill_withdrawals (
  release_id uuid primary key references public.adle_reviewed_word_skill_releases(id),
  reviewed_by uuid not null references auth.users(id),
  reason text not null check(length(btrim(reason))>0),
  withdrawn_at timestamptz not null default now()
);
create table public.writing_enrichment_replay_work (
  snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  release_id uuid not null references public.adle_reviewed_word_skill_releases(id),
  scheduled_at timestamptz,
  primary key(snapshot_id,release_id)
);
create index writing_enrichment_pending_idx on public.writing_enrichment_replay_work(release_id,snapshot_id) where scheduled_at is null;
create trigger reviewed_word_skill_release_immutable before update on public.adle_reviewed_word_skill_releases for each row execute function public.reject_writing_fact_update();
create trigger reviewed_word_skill_pair_immutable before update on public.adle_reviewed_word_skill_pairs for each row execute function public.reject_writing_fact_update();
create trigger reviewed_word_skill_withdrawal_immutable before update on public.adle_reviewed_word_skill_withdrawals for each row execute function public.reject_writing_fact_update();

-- Service boundary follows existing canonical publication RPCs. The admin
-- caller must supply an explicitly reviewed, enumerated manifest; no inference.
create function public.publish_reviewed_word_skill_release(p_release_key text,p_environment_key text,p_manifest jsonb,p_reviewed_by uuid,p_review_note text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_release_id uuid; existing public.adle_reviewed_word_skill_releases%rowtype; pair jsonb;
begin
  if jsonb_typeof(p_manifest) is distinct from 'object' or jsonb_typeof(p_manifest->'approvedPairs') is distinct from 'array'
    or jsonb_array_length(p_manifest->'approvedPairs') not between 1 and 1000 then raise exception 'reviewed_manifest_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('reviewed-word-skill:'||p_release_key,0));
  select * into existing from public.adle_reviewed_word_skill_releases where release_key=p_release_key;
  if existing.id is not null then
    if existing.candidate_manifest<>p_manifest or existing.environment_key<>p_environment_key or existing.reviewed_by<>p_reviewed_by or existing.review_note<>p_review_note then raise exception 'reviewed_release_conflict'; end if;
    return existing.id;
  end if;
  insert into public.adle_reviewed_word_skill_releases(release_key,environment_key,candidate_manifest,reviewed_by,review_note)
  values(p_release_key,p_environment_key,p_manifest,p_reviewed_by,p_review_note) returning id into v_release_id;
  for pair in select value from jsonb_array_elements(p_manifest->'approvedPairs') loop
    if pair->>'decision' is distinct from 'approved' then raise exception 'reviewed_pair_not_approved'; end if;
    if not exists(select 1 from public.canonical_teaching_dictionary_words where id=(pair->>'canonicalWordId')::uuid and row_status='active')
      or not exists(select 1 from public.micro_skill_catalog where micro_skill_key=pair->>'microSkillKey' and is_active)
      then raise exception 'reviewed_pair_identity_invalid'; end if;
    insert into public.adle_reviewed_word_skill_pairs(release_id,canonical_word_id,micro_skill_key,relationship_role,source_reference,licence_reference)
    values(v_release_id,(pair->>'canonicalWordId')::uuid,pair->>'microSkillKey',pair->>'relationshipRole',pair->>'sourceReference',pair->>'licenceReference');
  end loop;
  -- Keep a durable work row for every affected snapshot, including previously
  -- unresolved forms. Scheduling is bounded separately and has no consequences.
  insert into public.writing_enrichment_replay_work(snapshot_id,release_id)
  select distinct o.snapshot_id,v_release_id from public.writing_occurrence_interpretations i
    join public.writing_occurrences o on o.id=i.occurrence_id
    join public.canonical_teaching_dictionary_words w on (w.id=i.canonical_word_id or (w.normalised_word=i.normalized_form and w.dialect_code=i.dialect))
    where w.id in (select p.canonical_word_id from public.adle_reviewed_word_skill_pairs p where p.release_id=v_release_id)
  on conflict do nothing;
  return v_release_id;
end $$;

create function public.schedule_writing_enrichment_replays(p_limit integer default 20)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare work record; n integer:=0;
begin
  for work in select w.* from public.writing_enrichment_replay_work w
    join public.writing_source_snapshots s on s.id=w.snapshot_id
    join public.writing_shadow_controls c on c.child_id=s.child_id and c.parent_user_id=s.parent_user_id and c.processing_enabled
    where w.scheduled_at is null order by w.release_id,w.snapshot_id
    limit greatest(1,least(coalesce(p_limit,20),100)) for update of w skip locked loop
    perform public.enqueue_writing_shadow_replay(array[work.snapshot_id],'reviewed-release:'||work.release_id::text);
    update public.writing_enrichment_replay_work set scheduled_at=now() where snapshot_id=work.snapshot_id and release_id=work.release_id;
    n:=n+1;
  end loop;
  return n;
end $$;
alter table public.adle_reviewed_word_skill_releases enable row level security;
alter table public.adle_reviewed_word_skill_pairs enable row level security;
alter table public.adle_reviewed_word_skill_withdrawals enable row level security;
alter table public.writing_enrichment_replay_work enable row level security;
revoke all on public.adle_reviewed_word_skill_releases,public.adle_reviewed_word_skill_pairs,public.adle_reviewed_word_skill_withdrawals,public.writing_enrichment_replay_work from anon,authenticated;
grant select,insert on public.adle_reviewed_word_skill_releases,public.adle_reviewed_word_skill_pairs,public.adle_reviewed_word_skill_withdrawals to service_role;
grant select on public.writing_enrichment_replay_work to service_role;
revoke all on function public.publish_reviewed_word_skill_release(text,text,jsonb,uuid,text),public.schedule_writing_enrichment_replays(integer) from public,anon,authenticated;
grant execute on function public.publish_reviewed_word_skill_release(text,text,jsonb,uuid,text),public.schedule_writing_enrichment_replays(integer) to service_role;
