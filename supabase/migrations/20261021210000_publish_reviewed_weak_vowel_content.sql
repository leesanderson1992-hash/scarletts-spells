-- Publish weak-vowel route facts without activating the lesson or changing
-- shared dictionary facts. Every version is staged and reviewed through the
-- existing Teaching Dictionary route-content workflow first.
begin;

create table public.adle_weak_vowel_content_publications (
  content_version_id uuid primary key references public.teaching_dictionary_route_content_versions(id),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  dictionary_fingerprint text not null check (dictionary_fingerprint ~ '^[a-f0-9]{64}$'),
  word_audio_sha256 text not null check (word_audio_sha256 ~ '^[a-f0-9]{64}$'),
  sentence_audio_sha256 text not null check (sentence_audio_sha256 ~ '^[a-f0-9]{64}$'),
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  unique (content_version_id, canonical_word_id, micro_skill_key)
);

create index adle_weak_vowel_content_publications_pair_idx
  on public.adle_weak_vowel_content_publications(canonical_word_id,micro_skill_key,published_at desc);
create trigger adle_weak_vowel_content_publications_immutable before update or delete
  on public.adle_weak_vowel_content_publications for each row
  execute function public.reject_writing_fact_update();
alter table public.adle_weak_vowel_content_publications enable row level security;
revoke all on public.adle_weak_vowel_content_publications from anon,authenticated;
grant select,insert on public.adle_weak_vowel_content_publications to service_role;

create function public.publish_adle_weak_vowel_content_v1(
  p_content_version uuid,
  p_actor uuid,
  p_expected_source_fingerprint text,
  p_expected_word_audio_sha256 text,
  p_expected_sentence_audio_sha256 text
) returns uuid language plpgsql security definer
  set search_path=public,extensions,pg_temp as $$
declare
  c public.teaching_dictionary_route_content_versions%rowtype;
  v_facts jsonb;
  v_content_sha text;
  v_dictionary_sha text;
  v_word public.canonical_teaching_dictionary_words%rowtype;
begin
  if p_actor is null or p_expected_source_fingerprint !~ '^[a-f0-9]{64}$'
    or p_expected_word_audio_sha256 !~ '^[a-f0-9]{64}$'
    or p_expected_sentence_audio_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'WEAK_VOWEL_PUBLICATION_INPUT_INVALID';
  end if;
  select * into c from public.teaching_dictionary_route_content_versions
    where id=p_content_version for update;
  if c.id is null or c.route_id<>'weak_vowel_word_lab' or c.route_version<>'v1'
    or c.micro_skill_key not in (
      'D4_SCHWA_FINAL_A_FINAL','D4_SCHWA_FINAL_AR_FINAL','D4_SCHWA_FINAL_ER_FINAL',
      'D4_SCHWA_FINAL_OR_FINAL','D4_SCHWA_INITIAL_E_INITIAL','D4_SCHWA_INITIAL_O_INITIAL',
      'D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS','D4_SCHWA_MEDIAL_NATURAL_ACTUAL') then
    raise exception 'WEAK_VOWEL_CONTENT_VERSION_INVALID';
  end if;
  if exists(select 1 from public.teaching_dictionary_route_content_versions newer
    where newer.canonical_word_id=c.canonical_word_id and newer.route_id=c.route_id
      and newer.route_version=c.route_version and newer.micro_skill_key=c.micro_skill_key
      and (newer.published_at,newer.id)>(c.published_at,c.id)) then
    raise exception 'WEAK_VOWEL_CONTENT_STALE';
  end if;
  select * into v_word from public.canonical_teaching_dictionary_words
    where id=c.canonical_word_id for share;
  if v_word.id is null or v_word.row_status<>'active'
    or v_word.review_status<>'approved_for_first_exposure'
    or v_word.dialect_code<>'en-GB' then
    raise exception 'WEAK_VOWEL_WORD_NOT_APPROVED';
  end if;
  if exists(select 1 from public.teaching_dictionary_pair_latest_decisions decision
    where decision.canonical_word_id=c.canonical_word_id and decision.micro_skill_key=c.micro_skill_key
      and decision.environment_key='production' and decision.action='deassign') then
    raise exception 'WEAK_VOWEL_PAIR_DEASSIGNED';
  end if;
  v_facts:=c.content#>'{content,weakVowel}';
  if jsonb_typeof(v_facts)<>'object'
    or v_facts->>'schemaVersion'<>'weak_vowel_route_facts_v1'
    or v_facts->>'sourceFingerprint' is distinct from p_expected_source_fingerprint
    or v_facts#>>'{wordRecording,sha256}' is distinct from p_expected_word_audio_sha256
    or v_facts#>>'{sentenceRecording,sha256}' is distinct from p_expected_sentence_audio_sha256
    or v_facts#>>'{activityEligibility,dinner,status}'<>'ready'
    or v_facts#>>'{activityEligibility,detective,status}'<>'ready'
    or v_facts#>>'{activityEligibility,memoryLock,status}'<>'ready'
    or v_facts#>>'{activityEligibility,dictation,status}'<>'ready'
    or nullif(btrim(c.content->>'wordMeaning'),'') is null
    or nullif(btrim(v_facts->>'pronunciationId'),'') is null
    or coalesce(v_facts#>>'{wordRecording,src}','') not like '/audio/%'
    or coalesce(v_facts#>>'{sentenceRecording,src}','') not like '/audio/%' then
    raise exception 'WEAK_VOWEL_CONTENT_INCOMPLETE';
  end if;
  if c.content->>'routeId'<>'weak_vowel_word_lab'
    or c.content->>'routeVersion'<>'v1'
    or c.content->>'microSkillKey'<>c.micro_skill_key then
    raise exception 'WEAK_VOWEL_CONTENT_IDENTITY_MISMATCH';
  end if;
  if (select definition.definition from public.teaching_dictionary_definition_versions definition
      where definition.canonical_word_id=c.canonical_word_id and definition.route_id is null
      order by definition.published_at desc,definition.id desc limit 1)
      is distinct from c.content->>'wordMeaning' then
    raise exception 'WEAK_VOWEL_SHARED_DEFINITION_CHANGED';
  end if;
  v_dictionary_sha:=public.teaching_dictionary_route_dictionary_fingerprint(c.canonical_word_id);
  v_content_sha:=encode(extensions.digest(convert_to(c.content::text,'UTF8'),'sha256'),'hex');
  if not exists(select 1 from public.teaching_dictionary_route_content_reviews review
    where review.content_version_id=c.id and review.content_sha256=v_content_sha
      and review.dictionary_fingerprint=v_dictionary_sha) then
    raise exception 'WEAK_VOWEL_REVIEW_STALE';
  end if;
  insert into public.adle_weak_vowel_content_publications
    (content_version_id,canonical_word_id,micro_skill_key,source_fingerprint,
     content_sha256,dictionary_fingerprint,word_audio_sha256,sentence_audio_sha256,published_by)
  values (c.id,c.canonical_word_id,c.micro_skill_key,p_expected_source_fingerprint,
          v_content_sha,v_dictionary_sha,p_expected_word_audio_sha256,
          p_expected_sentence_audio_sha256,p_actor)
  on conflict (content_version_id) do nothing;
  if not exists(select 1 from public.adle_weak_vowel_content_publications p
    where p.content_version_id=c.id and p.source_fingerprint=p_expected_source_fingerprint
      and p.content_sha256=v_content_sha and p.dictionary_fingerprint=v_dictionary_sha
      and p.word_audio_sha256=p_expected_word_audio_sha256
      and p.sentence_audio_sha256=p_expected_sentence_audio_sha256) then
    raise exception 'WEAK_VOWEL_PUBLICATION_CONFLICT';
  end if;
  return c.id;
end $$;

revoke all on function public.publish_adle_weak_vowel_content_v1(uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.publish_adle_weak_vowel_content_v1(uuid,uuid,text,text,text)
  to service_role;

commit;
