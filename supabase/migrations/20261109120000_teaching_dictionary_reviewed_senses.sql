-- Sense identities are independent of lessons. Existing words continue to use
-- their legacy definition/pronunciation until an Overview sense set is reviewed.
create table if not exists public.teaching_dictionary_reviewed_sense_sets (
  canonical_word_id uuid primary key references public.canonical_teaching_dictionary_words(id) on delete restrict,
  sense_set jsonb not null,
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default timezone('utc', now()),
  constraint reviewed_sense_set_shape check (
    jsonb_typeof(sense_set) = 'object'
    and jsonb_typeof(sense_set->'senses') = 'array'
    and jsonb_array_length(sense_set->'senses') > 0
    and jsonb_typeof(sense_set->'pronunciations') = 'array'
  )
);

alter table public.teaching_dictionary_reviewed_sense_sets enable row level security;
revoke all on public.teaching_dictionary_reviewed_sense_sets from public, anon, authenticated;
grant select, insert, update on public.teaching_dictionary_reviewed_sense_sets to service_role;

create table public.teaching_dictionary_reviewed_sense_sentences (
  id uuid primary key default gen_random_uuid(),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  sense_id text not null,
  sentence text not null check (btrim(sentence) <> ''),
  target_token_index integer not null check (target_token_index >= 0),
  source_row_hash text not null check (source_row_hash ~ '^[a-f0-9]{64}$'),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  unique (canonical_word_id,sense_id,source_row_hash)
);
create trigger reviewed_sense_sentences_immutable before update or delete
on public.teaching_dictionary_reviewed_sense_sentences for each row
execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_reviewed_sense_sentences enable row level security;
revoke all on public.teaching_dictionary_reviewed_sense_sentences from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_reviewed_sense_sentences to service_role;

-- Publication and sense approval commit together, including new words whose
-- canonical ID is first known inside the publication transaction.
create function public.publish_teaching_dictionary_senses_from_draft()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_set jsonb; v_sense jsonb;
begin
  select payload->'senseSet' into v_set
  from public.teaching_dictionary_manager_drafts where id=new.draft_id;
  if v_set is null then return new; end if;
  if jsonb_typeof(v_set) <> 'object'
     or jsonb_typeof(v_set->'senses') <> 'array'
     or jsonb_typeof(v_set->'pronunciations') <> 'array'
     or jsonb_array_length(v_set->'senses') = 0 then
    raise exception 'TEACHING_SENSE_SET_INVALID';
  end if;
  insert into public.teaching_dictionary_reviewed_sense_sets
    (canonical_word_id,sense_set,reviewed_by,reviewed_at)
  values (new.canonical_word_id,v_set,new.published_by,new.published_at)
  on conflict (canonical_word_id) do update
    set sense_set=excluded.sense_set,reviewed_by=excluded.reviewed_by,
        reviewed_at=excluded.reviewed_at;
  for v_sense in select value from jsonb_array_elements(v_set->'senses') loop
    if nullif(btrim(v_sense->>'dictationSentence'),'') is not null
       and jsonb_typeof(v_sense->'dictationTargetTokenIndex')='number' then
      insert into public.teaching_dictionary_reviewed_sense_sentences
        (canonical_word_id,sense_id,sentence,target_token_index,source_row_hash,reviewed_by,reviewed_at)
      values (new.canonical_word_id,v_sense->>'id',v_sense->>'dictationSentence',
        (v_sense->>'dictationTargetTokenIndex')::integer,
        public.adle_generic_snapshot_json_sha256_v1(jsonb_build_object(
          'senseId',v_sense->>'id','sentence',v_sense->>'dictationSentence',
          'targetTokenIndex',(v_sense->>'dictationTargetTokenIndex')::integer)),
        new.published_by,new.published_at)
      on conflict (canonical_word_id,sense_id,source_row_hash) do nothing;
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.publish_teaching_dictionary_senses_from_draft() from public, anon, authenticated;

create trigger teaching_dictionary_publish_senses
after insert on public.teaching_dictionary_manager_publications
for each row execute function public.publish_teaching_dictionary_senses_from_draft();
