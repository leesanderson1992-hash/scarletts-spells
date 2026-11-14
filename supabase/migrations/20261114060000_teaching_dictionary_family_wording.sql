begin;

create table public.teaching_dictionary_sense_wording_fingerprints (
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  sense_id text not null,
  current_fingerprint text not null,
  prior_fingerprint text not null,
  primary key (canonical_word_id,sense_id,current_fingerprint,prior_fingerprint)
);
create table public.teaching_dictionary_family_meaning_changes (
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  sense_id text not null,
  changed_at timestamptz not null,
  changed_by uuid not null references auth.users(id),
  primary key (canonical_word_id,sense_id)
);
alter table public.teaching_dictionary_sense_wording_fingerprints enable row level security;
alter table public.teaching_dictionary_family_meaning_changes enable row level security;
revoke all on public.teaching_dictionary_sense_wording_fingerprints,
  public.teaching_dictionary_family_meaning_changes from public,anon,authenticated;

-- Edits through an import or other publisher default to meaning changes.
-- Only an explicit, definition-only wording review keeps prior fingerprints.
create function public.track_teaching_dictionary_family_meaning_changes()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_old_sense jsonb;
  v_new_sense jsonb;
  v_before text;
  v_after text;
  v_wording_id text := current_setting('app.teaching_sense_wording_id',true);
begin
  for v_old_sense in select value from jsonb_array_elements(coalesce(old.sense_set->'senses','[]'::jsonb)) loop
    select value into v_new_sense from jsonb_array_elements(new.sense_set->'senses')
      where value->>'id'=v_old_sense->>'id';
    if v_old_sense->>'definition' is distinct from v_new_sense->>'definition'
      or v_old_sense->>'partOfSpeech' is distinct from v_new_sense->>'partOfSpeech' then
      if v_old_sense->>'id'=v_wording_id
        and v_old_sense-'definition'=v_new_sense-'definition' then
        v_before:=public.adle_generic_snapshot_json_sha256_v1(v_old_sense);
        v_after:=public.adle_generic_snapshot_json_sha256_v1(v_new_sense);
        insert into public.teaching_dictionary_sense_wording_fingerprints
          (canonical_word_id,sense_id,current_fingerprint,prior_fingerprint)
        select new.canonical_word_id,v_wording_id,v_after,prior_fingerprint
        from public.teaching_dictionary_sense_wording_fingerprints
        where canonical_word_id=new.canonical_word_id and sense_id=v_wording_id
          and current_fingerprint=v_before
        union select new.canonical_word_id,v_wording_id,v_after,v_before
        on conflict do nothing;
      else
        insert into public.teaching_dictionary_family_meaning_changes
          (canonical_word_id,sense_id,changed_at,changed_by)
        values(new.canonical_word_id,v_old_sense->>'id',new.reviewed_at,new.reviewed_by)
        on conflict (canonical_word_id,sense_id) do update
          set changed_at=excluded.changed_at,changed_by=excluded.changed_by;
        delete from public.teaching_dictionary_sense_wording_fingerprints
          where canonical_word_id=new.canonical_word_id and sense_id=v_old_sense->>'id';
      end if;
    end if;
  end loop;

  return new;
end $$;
revoke all on function public.track_teaching_dictionary_family_meaning_changes() from public,anon,authenticated;
create trigger teaching_dictionary_track_family_meaning_changes
  after update of sense_set on public.teaching_dictionary_reviewed_sense_sets
  for each row when (old.sense_set is distinct from new.sense_set)
  execute function public.track_teaching_dictionary_family_meaning_changes();

create function public.review_teaching_dictionary_meaning_change(
  p_draft uuid,p_actor uuid,p_expected_reviewed_at timestamptz,p_selected_sense_id text,p_change_kind text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  v_set jsonb;
  v_sense jsonb;
  v_reviewed_at timestamptz;
begin
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft;
  if d.canonical_word_id is null or d.source_kind <> 'manual'
    or d.created_by is distinct from p_actor or p_actor is null then
    raise exception 'TEACHING_MEANING_DRAFT_REQUIRED';
  end if;
  perform 1 from public.canonical_teaching_dictionary_words
    where id=d.canonical_word_id and row_status='active' for update;
  if not found then raise exception 'TEACHING_MEANING_DRAFT_REQUIRED'; end if;

  if p_selected_sense_id is not null and coalesce(p_change_kind,'') not in ('wording','meaning') then
    raise exception 'TEACHING_MEANING_CHANGE_KIND_REQUIRED';
  end if;

  v_set:=d.payload->'senseSet';
  if jsonb_typeof(v_set->'senses') is distinct from 'array'
    or jsonb_typeof(v_set->'pronunciations') is distinct from 'array'
    or jsonb_array_length(v_set->'senses')=0 then
    raise exception 'TEACHING_SENSE_SET_INVALID';
  end if;

  -- Retries of the same facts are harmless. A stale form cannot overwrite a
  -- newer approved set, including one approved by an import.
  perform set_config('app.teaching_sense_wording_id',
    case when p_change_kind='wording' then coalesce(p_selected_sense_id,'') else '' end,true);
  insert into public.teaching_dictionary_reviewed_sense_sets
    (canonical_word_id,sense_set,reviewed_by,reviewed_at)
  select d.canonical_word_id,v_set,p_actor,clock_timestamp()
  where p_expected_reviewed_at is null or exists (
    select 1 from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=d.canonical_word_id
  )
  on conflict (canonical_word_id) do update
    set sense_set=excluded.sense_set, reviewed_by=excluded.reviewed_by,
        reviewed_at=excluded.reviewed_at
    where teaching_dictionary_reviewed_sense_sets.reviewed_at
      is not distinct from p_expected_reviewed_at
      and teaching_dictionary_reviewed_sense_sets.sense_set is distinct from excluded.sense_set
  returning reviewed_at into v_reviewed_at;
  perform set_config('app.teaching_sense_wording_id','',true);
  if v_reviewed_at is null then
    if exists (select 1 from public.teaching_dictionary_reviewed_sense_sets
      where canonical_word_id=d.canonical_word_id and sense_set=v_set) then return; end if;
    raise exception 'TEACHING_MEANING_REVIEW_STALE';
  end if;

  for v_sense in select value from jsonb_array_elements(v_set->'senses') loop
    if nullif(btrim(v_sense->>'dictationSentence'),'') is not null
      and jsonb_typeof(v_sense->'dictationTargetTokenIndex')='number' then
      insert into public.teaching_dictionary_reviewed_sense_sentences
        (canonical_word_id,sense_id,sentence,target_token_index,source_row_hash,reviewed_by,reviewed_at)
      values (d.canonical_word_id,v_sense->>'id',v_sense->>'dictationSentence',
        (v_sense->>'dictationTargetTokenIndex')::integer,
        public.adle_generic_snapshot_json_sha256_v1(jsonb_build_object(
          'senseId',v_sense->>'id','sentence',v_sense->>'dictationSentence',
          'targetTokenIndex',(v_sense->>'dictationTargetTokenIndex')::integer)),
        p_actor,v_reviewed_at)
      on conflict (canonical_word_id,sense_id,source_row_hash) do nothing;
    end if;
  end loop;
end $$;
revoke all on function public.review_teaching_dictionary_meaning_change(uuid,uuid,timestamptz,text,text)
  from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_meaning_change(uuid,uuid,timestamptz,text,text)
  to service_role;

create view public.teaching_dictionary_families_with_current_meaning as
select f.family_key,f.revision,f.base_lemma,f.base_part_of_speech,f.base_kind,
  f.canonical_base_word_id,f.canonical_base_sense_id,f.review_status,
  case when f.canonical_base_sense_id is null then f.base_meaning else coalesce(base.value->>'definition',f.base_meaning) end as base_meaning
from public.canonical_teaching_dictionary_lexical_base_families f
left join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=f.canonical_base_word_id
left join lateral (
  select value from jsonb_array_elements(s.sense_set->'senses') where value->>'id'=f.canonical_base_sense_id
) base on true;
revoke all on public.teaching_dictionary_families_with_current_meaning from public,anon,authenticated;
grant select on public.teaching_dictionary_families_with_current_meaning to service_role;

create or replace view public.teaching_dictionary_current_sense_morphology as
with latest as (
  select distinct on (canonical_word_id,sense_id) *
  from public.teaching_dictionary_sense_morphology_events
  order by canonical_word_id,sense_id,event_sequence desc
)
select e.id,e.canonical_word_id,e.sense_id,e.pronunciation_id,
  e.morphology_parts,e.morphology_joins,e.morphology_transformations,
  e.word_sum,e.reviewed_by,e.reviewed_at
from latest e
join public.canonical_teaching_dictionary_words w
  on w.id=e.canonical_word_id and w.row_status='active'
    and w.review_status='approved_for_first_exposure'
join public.teaching_dictionary_reviewed_sense_sets s
  on s.canonical_word_id=e.canonical_word_id
join lateral (
  select value from jsonb_array_elements(s.sense_set->'senses')
  where value->>'id'=e.sense_id
) selected on true
where e.action='approve'
  and (public.adle_generic_snapshot_json_sha256_v1(selected.value)=e.sense_fingerprint
    or exists(select 1 from public.teaching_dictionary_sense_wording_fingerprints wording
      where wording.canonical_word_id=e.canonical_word_id and wording.sense_id=e.sense_id
        and wording.current_fingerprint=public.adle_generic_snapshot_json_sha256_v1(selected.value)
        and wording.prior_fingerprint=e.sense_fingerprint));

create or replace view public.teaching_dictionary_current_sense_family_memberships as
with latest as (
  select distinct on (canonical_word_id,sense_id,family_key,component_part_id) *
  from public.teaching_dictionary_sense_family_membership_events
  order by canonical_word_id,sense_id,family_key,component_part_id,event_sequence desc
), current_families as (
  select distinct on (family_key) *
  from public.teaching_dictionary_families_with_current_meaning
  order by family_key,revision desc
)
select e.id,e.canonical_word_id,e.sense_id,e.sense_morphology_id,
  e.family_key,f.revision as current_family_revision,e.component_part_id,
  f.base_meaning,e.relationship_kind,e.reviewed_by,e.reviewed_at
from latest e
join public.teaching_dictionary_current_sense_morphology analysis
  on analysis.id=e.sense_morphology_id and analysis.canonical_word_id=e.canonical_word_id
    and analysis.sense_id=e.sense_id
join current_families f on f.family_key=e.family_key and f.review_status='approved'
left join public.teaching_dictionary_family_meaning_changes change
  on change.canonical_word_id=f.canonical_base_word_id and change.sense_id=f.canonical_base_sense_id
where e.action='approve' and (change.changed_at is null or change.changed_at < e.reviewed_at)
  and (f.canonical_base_sense_id is not null or f.base_meaning=e.base_meaning);

create view public.teaching_dictionary_family_links_needing_meaning_review as
with latest as (
  select distinct on (canonical_word_id,sense_id,family_key,component_part_id) *
  from public.teaching_dictionary_sense_family_membership_events
  order by canonical_word_id,sense_id,family_key,component_part_id,event_sequence desc
), current_families as (
  select distinct on (family_key) * from public.teaching_dictionary_families_with_current_meaning
  order by family_key,revision desc
)
select e.canonical_word_id,e.sense_id,e.family_key,e.component_part_id,f.base_lemma
from latest e
join current_families f on f.family_key=e.family_key and f.review_status='approved'
join public.teaching_dictionary_family_meaning_changes change
  on change.canonical_word_id=f.canonical_base_word_id and change.sense_id=f.canonical_base_sense_id
where e.action='approve' and change.changed_at >= e.reviewed_at;
revoke all on public.teaching_dictionary_family_links_needing_meaning_review from public,anon,authenticated;
grant select on public.teaching_dictionary_family_links_needing_meaning_review to service_role;

-- The editor confirms the family meaning by linking the exact base component.
-- The part's previous wording remains available if its family is removed.
do $$
declare body text;
begin
  select pg_get_functiondef('public.review_teaching_dictionary_sense_family_membership(uuid,uuid,text,uuid,text,text,text,text,uuid,text)'::regprocedure) into body;
  body:=replace(body, $match$ or v_part->>'gloss'<>v_family.base_meaning$match$, '');
  body:=replace(body, 'v_family.base_meaning,p_relationship_kind,p_action,p_actor,p_source_reference)',
    'coalesce((select f.base_meaning from public.teaching_dictionary_families_with_current_meaning f
      where f.family_key=v_family.family_key and f.revision=v_family.revision),v_family.base_meaning),
      p_relationship_kind,p_action,p_actor,p_source_reference)');
  if position($match$ or v_part->>'gloss'<>v_family.base_meaning$match$ in body)>0 then
    raise exception 'TEACHING_FAMILY_GLOSS_GUARD_CHANGED';
  end if;
  execute body;
  select pg_get_functiondef('public.create_reviewed_free_base_family_from_sense(uuid,uuid,text,uuid,text,text,text,uuid,text)'::regprocedure) into body;
  body:=replace(body, $match$ and value->>'gloss'=v_base_sense->>'definition'$match$, '');
  body:=replace(body, $match$
      and value->>'gloss'=v_base_sense->>'definition'$match$, '');
  execute body;
  select pg_get_functiondef('public.approve_teaching_dictionary_word_parts(uuid,uuid,text,jsonb,jsonb,jsonb,text,uuid)'::regprocedure) into body;
  body:=replace(body, 'select review_status,base_meaning from',
    'select review_status,base_meaning,canonical_base_word_id,canonical_base_sense_id from');
  body:=replace(body, 'current_family.base_meaning=e.base_meaning',
    '(current_family.canonical_base_sense_id is not null or current_family.base_meaning=e.base_meaning)');
  body:=replace(body, $match$where e.action='approve' and e.sense_morphology_id=v_previous and previous_part=next_part$match$, $match$where e.action='approve' and e.sense_morphology_id=v_previous and previous_part=next_part
      and not exists(select 1 from public.teaching_dictionary_family_meaning_changes change
        where change.canonical_word_id=current_family.canonical_base_word_id
          and change.sense_id=current_family.canonical_base_sense_id and change.changed_at>=e.reviewed_at)$match$);
  execute body;
end $$;

notify pgrst,'reload schema';
commit;
