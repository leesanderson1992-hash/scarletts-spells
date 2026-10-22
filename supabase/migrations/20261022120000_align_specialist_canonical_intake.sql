-- Admit exact, current specialist release members to the existing canonical
-- intake state machine. Historical candidate provenance remains immutable.
begin;

create function public.adle_release_specialist_intake_ready_v1(
  p_child_id uuid, p_word_id uuid, p_skill text, p_word text,
  p_route_id text, p_route_version text, p_activation_id uuid,
  p_release_id uuid, p_release_sha text, p_dependency_sha text
) returns boolean language plpgsql security definer
set search_path=public,extensions,pg_temp as $$
declare
  r public.adle_route_activation_revisions%rowtype;
  m public.adle_curriculum_release_manifests%rowtype;
  w public.canonical_teaching_dictionary_words%rowtype;
  required_types text[];
  member_type text;
  member_projection jsonb;
  c public.teaching_dictionary_route_content_versions%rowtype;
  publication public.adle_weak_vowel_content_publications%rowtype;
begin
  if p_route_id not in ('weak_vowel_word_lab','homophone_word_lab',
      'ing_endings_word_lab','comparative_superlative_word_lab')
    or p_route_version <> (case when p_route_id='homophone_word_lab' then 'v2' else 'v1' end)
    or p_activation_id is null or p_release_id is null
    or coalesce(p_release_sha,'') !~ '^[a-f0-9]{64}$'
    or coalesce(p_dependency_sha,'') !~ '^[a-f0-9]{64}$' then return false; end if;
  select * into r from public.adle_route_activation_revisions where id=p_activation_id;
  select * into m from public.adle_curriculum_release_manifests where id=p_release_id;
  if r.id is null or m.id is null or r.release_manifest_id<>m.id
    or r.route_id<>p_route_id or r.route_version<>p_route_version or r.micro_skill_key<>p_skill
    or r.activation_route_key<>p_route_id||':'||p_route_version
    or r.activation_status<>'enabled' or m.route_id<>p_route_id or m.route_version<>p_route_version
    or m.activation_route_key<>r.activation_route_key
    or m.payload_version<>(case when p_route_id='homophone_word_lab' then 2 else 1 end)
    or m.release_manifest_sha256<>p_release_sha or m.dependency_fingerprint<>p_dependency_sha
    or r.release_manifest_sha256<>p_release_sha or r.dependency_fingerprint<>p_dependency_sha
    or not public.adle_route_activation_revision_is_current_v2(
      p_activation_id,p_release_id,p_release_sha,p_dependency_sha)
    or not public.adle_release_activation_allows_child_v2(p_activation_id,p_child_id)
    then return false; end if;
  select * into w from public.canonical_teaching_dictionary_words where id=p_word_id;
  if w.id is null or w.normalised_word<>p_word or w.row_status<>'active'
    or w.review_status<>'approved_for_first_exposure' or w.dialect_code<>'en-GB'
    or exists(select 1 from public.teaching_dictionary_pair_latest_decisions d
      where d.environment_key=r.environment_key and d.micro_skill_key=p_skill
        and d.canonical_word_id=p_word_id and d.action='deassign') then return false; end if;

  required_types:=case p_route_id
    when 'weak_vowel_word_lab' then array['weak_vowel_lesson_content']
    when 'homophone_word_lab' then array['homophone_lesson_content']
    when 'ing_endings_word_lab' then array['ing_word_members','teaching_content','teaching_dictionary_closure']
    else array['adjective_degree_families','teaching_content','teaching_dictionary_closure'] end;
  if (select count(*) from public.adle_curriculum_release_dependencies d
      where d.release_manifest_id=p_release_id and d.micro_skill_key=p_skill)<>array_length(required_types,1)
    or exists(select 1 from unnest(required_types) expected(kind)
      where (select count(*) from public.adle_curriculum_release_dependencies d
        join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
        where d.release_manifest_id=p_release_id and d.micro_skill_key=p_skill
          and d.authority_type=expected.kind and a.authority_type=d.authority_type
          and a.authority_key=d.authority_key and a.schema_version=d.authority_schema_version
          and a.semantic_fingerprint=d.semantic_fingerprint
          and public.adle_generic_snapshot_json_sha256_v1(a.semantic_projection)=d.semantic_fingerprint
          and a.semantic_projection->>'microSkillKey'=p_skill)<>1)
    then return false; end if;

  if p_route_id='weak_vowel_word_lab' then
    select * into publication from public.adle_weak_vowel_content_publications p
      where p.canonical_word_id=p_word_id and p.micro_skill_key=p_skill
      order by p.published_at desc,p.content_version_id desc limit 1;
    if publication.content_version_id is null then return false; end if;
    select * into c from public.teaching_dictionary_route_content_versions
      where id=publication.content_version_id;
    return c.id is not null and c.canonical_word_id=p_word_id
      and c.micro_skill_key=p_skill and c.route_id=p_route_id and c.route_version=p_route_version
      and publication.content_sha256=encode(extensions.digest(convert_to(c.content::text,'UTF8'),'sha256'),'hex')
      and c.content->>'wordMeaning'= (select definition from public.teaching_dictionary_definition_versions
        where canonical_word_id=p_word_id and route_id is null order by published_at desc,id desc limit 1)
      and publication.dictionary_fingerprint=public.teaching_dictionary_route_dictionary_fingerprint(p_word_id)
      and publication.source_fingerprint=c.content#>>'{content,weakVowel,sourceFingerprint}'
      and publication.word_audio_sha256=c.content#>>'{content,weakVowel,wordRecording,sha256}'
      and publication.sentence_audio_sha256=c.content#>>'{content,weakVowel,sentenceRecording,sha256}'
      and c.content#>>'{content,weakVowel,activityEligibility,dinner,status}'='ready'
      and c.content#>>'{content,weakVowel,activityEligibility,detective,status}'='ready'
      and c.content#>>'{content,weakVowel,activityEligibility,memoryLock,status}'='ready'
      and c.content#>>'{content,weakVowel,activityEligibility,dictation,status}'='ready';
  end if;

  member_type:=case p_route_id when 'homophone_word_lab' then 'homophone_lesson_content'
    when 'ing_endings_word_lab' then 'ing_word_members' else 'adjective_degree_families' end;
  select a.semantic_projection into member_projection
    from public.adle_curriculum_release_dependencies d
    join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
    where d.release_manifest_id=p_release_id and d.micro_skill_key=p_skill and d.authority_type=member_type;
  if p_route_id='homophone_word_lab' then
    return exists(select 1 from jsonb_array_elements(member_projection->'canonicalWords') v
      where v->>'canonicalWordId'=p_word_id::text and v->>'word'=w.display_word);
  elsif p_route_id='ing_endings_word_lab' then
    return exists(select 1 from jsonb_array_elements(member_projection->'words') v
      where v->>'canonicalWordId'=p_word_id::text and v->>'word'=w.display_word
        and v->>'microSkillKey'=p_skill);
  end if;
  return exists(select 1 from jsonb_array_elements(member_projection->'families') family,
    jsonb_array_elements(family->'words') v
    where family->>'microSkillKey'=p_skill and v->>'canonicalWordId'=p_word_id::text
      and v->>'word'=w.display_word);
exception when others then return false;
end $$;
revoke all on function public.adle_release_specialist_intake_ready_v1(uuid,uuid,text,text,text,text,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.adle_release_specialist_intake_ready_v1(uuid,uuid,text,text,text,text,uuid,uuid,text,text)
  to service_role;

alter table public.adle_canonical_intake_candidates
  drop constraint adle_canonical_intake_candidates_release_authority_check,
  add constraint adle_canonical_intake_candidates_release_authority_check check (
    (route_activation_revision_id is null and curriculum_release_manifest_id is null
      and curriculum_release_manifest_sha256 is null and curriculum_dependency_fingerprint is null)
    or (route_id='base_word_lab' and route_version='v2'
      and route_activation_revision_id is not null and curriculum_release_manifest_id is not null
      and curriculum_release_manifest_sha256 ~ '^[a-f0-9]{64}$' and curriculum_dependency_fingerprint ~ '^[a-f0-9]{64}$')
    or (route_id='compound_word_lab' and route_version='v2'
      and route_activation_revision_id is null and curriculum_release_manifest_id is not null
      and curriculum_release_manifest_sha256 ~ '^[a-f0-9]{64}$' and curriculum_dependency_fingerprint ~ '^[a-f0-9]{64}$')
    or (route_id in ('weak_vowel_word_lab','homophone_word_lab','ing_endings_word_lab','comparative_superlative_word_lab')
      and route_activation_revision_id is not null and curriculum_release_manifest_id is not null
      and curriculum_release_manifest_sha256 ~ '^[a-f0-9]{64}$' and curriculum_dependency_fingerprint ~ '^[a-f0-9]{64}$')
  );

do $migration$
declare
  signature constant text:='public.adle_persist_canonical_intake_r8b_delegate(uuid,uuid,text,uuid,uuid,text,text,text,date,text,text,uuid,uuid,text,text)';
  definition text;
  branch text;
begin
  select pg_get_functiondef(to_regprocedure(signature)) into definition;
  if definition is null or definition not like '%v_is_compound_word boolean := public.adle_micro_skill_owns_compound_word_lab_v2(p_micro_skill_key);%'
    or position(E'\n  if v_is_compound_word then\n' in definition)=0
    or definition not like '%case when v_is_base_word or v_is_compound_word then p_release_manifest_id else null end%'
    then raise exception 'canonical intake delegate differs from reviewed predecessor'; end if;
  definition:=replace(definition,
    'v_is_compound_word boolean := public.adle_micro_skill_owns_compound_word_lab_v2(p_micro_skill_key);',
    'v_is_compound_word boolean := public.adle_micro_skill_owns_compound_word_lab_v2(p_micro_skill_key);'||E'\n  '||
    'v_is_release_specialist boolean := p_route_id in (''weak_vowel_word_lab'',''homophone_word_lab'',''ing_endings_word_lab'',''comparative_superlative_word_lab'');');
  branch:=$branch$if v_is_release_specialist then
    if not public.adle_release_specialist_intake_ready_v1(
      p_child_id,p_canonical_word_id,p_micro_skill_key,p_correct_spelling_normalized,
      p_route_id,p_route_version,p_route_activation_id,p_release_manifest_id,
      p_release_manifest_sha256,p_dependency_fingerprint)
      then raise exception 'specialist canonical intake release or word is not current and eligible'; end if;
    select * into v_existing_candidate from public.adle_canonical_intake_candidates
      where source_candidate_mapping_id=p_candidate_mapping_id for update;
    if found and v_existing_candidate.curriculum_release_manifest_id is not null and (
      v_existing_candidate.route_activation_revision_id is distinct from p_route_activation_id
      or v_existing_candidate.curriculum_release_manifest_id<>p_release_manifest_id
      or v_existing_candidate.curriculum_release_manifest_sha256<>p_release_manifest_sha256
      or v_existing_candidate.curriculum_dependency_fingerprint<>p_dependency_fingerprint)
      then raise exception 'canonical intake candidate already retains different immutable release provenance'; end if;
    v_route_id:=p_route_id; v_route_version:=p_route_version;
  elsif v_is_compound_word then$branch$;
  definition:=replace(definition,E'\n  if v_is_compound_word then\n',E'\n  '||branch||E'\n');
  definition:=replace(definition,'case when v_is_base_word then p_route_activation_id else null end',
    'case when v_is_base_word or v_is_release_specialist then p_route_activation_id else null end');
  definition:=replace(definition,'case when v_is_base_word or v_is_compound_word then p_release_manifest_id else null end',
    'case when v_is_base_word or v_is_compound_word or v_is_release_specialist then p_release_manifest_id else null end');
  definition:=replace(definition,'case when v_is_base_word or v_is_compound_word then p_release_manifest_sha256 else null end',
    'case when v_is_base_word or v_is_compound_word or v_is_release_specialist then p_release_manifest_sha256 else null end');
  definition:=replace(definition,'case when v_is_base_word or v_is_compound_word then p_dependency_fingerprint else null end',
    'case when v_is_base_word or v_is_compound_word or v_is_release_specialist then p_dependency_fingerprint else null end');
  if definition not like '%v_is_release_specialist boolean :=%'
    or definition not like '%specialist canonical intake release or word is not current and eligible%'
    or definition not like '%case when v_is_base_word or v_is_release_specialist then p_route_activation_id else null end%'
    then raise exception 'specialist canonical intake patch was not exact'; end if;
  execute definition;
end $migration$;

create function public.enqueue_adle_candidates_on_specialist_word_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='adle_weak_vowel_content_publications' then
    perform public.adle_enqueue_existing_candidates_for_word_skill_release(
      new.canonical_word_id,new.micro_skill_key,'weak_vowel_content_publication',
      concat(tg_table_name,':',new.content_version_id::text));
  elsif tg_table_name='adle_reviewed_word_skill_pairs' then
    perform public.adle_enqueue_existing_candidates_for_word_skill_release(
      new.canonical_word_id,new.micro_skill_key,'word_skill_reviewed_release',
      concat(tg_table_name,':',new.id::text));
  else
    perform public.adle_enqueue_existing_candidates_for_word_skill_release(
      new.canonical_word_id,new.micro_skill_key,'word_skill_assignment_decision',
      concat(tg_table_name,':',new.id::text));
  end if;
  return new;
end $$;
revoke all on function public.enqueue_adle_candidates_on_specialist_word_change() from public,anon,authenticated;
create trigger adle_weak_vowel_content_enqueue_canonical_intake
  after insert on public.adle_weak_vowel_content_publications for each row
  execute function public.enqueue_adle_candidates_on_specialist_word_change();
create trigger adle_pair_decision_enqueue_canonical_intake
  after insert on public.teaching_dictionary_pair_decision_events for each row
  execute function public.enqueue_adle_candidates_on_specialist_word_change();
create trigger adle_reviewed_pair_enqueue_canonical_intake
  after insert on public.adle_reviewed_word_skill_pairs for each row
  execute function public.enqueue_adle_candidates_on_specialist_word_change();

create function public.enqueue_adle_candidates_on_reviewed_pair_withdrawal()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare pair record;
begin
  for pair in select canonical_word_id,micro_skill_key from public.adle_reviewed_word_skill_pairs
    where release_id=new.release_id loop
    perform public.adle_enqueue_existing_candidates_for_word_skill_release(
      pair.canonical_word_id,pair.micro_skill_key,'word_skill_reviewed_withdrawal',
      concat(tg_table_name,':',new.release_id::text));
  end loop;
  return new;
end $$;
revoke all on function public.enqueue_adle_candidates_on_reviewed_pair_withdrawal() from public,anon,authenticated;
create trigger adle_reviewed_pair_withdrawal_enqueue_canonical_intake
  after insert on public.adle_reviewed_word_skill_withdrawals for each row
  execute function public.enqueue_adle_candidates_on_reviewed_pair_withdrawal();

-- Existing generic-route candidates receive a bounded recheck; the worker
-- supersedes their old waiting demand only after current authority is read.
do $backlog$
declare row record;
begin
  for row in select c.id from public.adle_canonical_intake_candidates c
    join public.adle_route_activation_heads h on h.micro_skill_key=c.micro_skill_key
      and h.environment_key='production' and h.route_id in
        ('weak_vowel_word_lab','homophone_word_lab','ing_endings_word_lab','comparative_superlative_word_lab')
    where c.route_id='adle_word_level' and c.candidate_state in ('pending_content','pending_mapping','error_retryable')
  loop
    perform public.adle_enqueue_canonical_intake_candidate(row.id,'specialist_route_reconciliation','migration:20261022120000');
  end loop;
end $backlog$;
commit;
