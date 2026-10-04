-- Keep -ing assignment fingerprints stable regardless of the database's
-- default text collation. Existing release authority fingerprints remain
-- immutable and continue to use their original database canonicalizer.
begin;

create or replace function public.adle_ing_snapshot_canonical_json_text_v1(p_value jsonb)
returns text language plpgsql immutable strict set search_path=public as $$
declare v_type text:=jsonb_typeof(p_value); v_result text;
begin
  if v_type='object' then
    select '{'||coalesce(string_agg(to_jsonb(e.key)::text||':'||public.adle_ing_snapshot_canonical_json_text_v1(e.value),',' order by e.key collate "C"),'')||'}'
      into v_result from jsonb_each(p_value) e;
    return v_result;
  elsif v_type='array' then
    select '['||coalesce(string_agg(public.adle_ing_snapshot_canonical_json_text_v1(e.value),',' order by e.ordinality),'')||']'
      into v_result from jsonb_array_elements(p_value) with ordinality e(value,ordinality);
    return v_result;
  end if;
  return p_value::text;
end $$;

create or replace function public.adle_ing_snapshot_json_sha256_v1(p_value jsonb)
returns text language sql immutable strict set search_path=public,extensions as $$
  select encode(extensions.digest(convert_to(public.adle_ing_snapshot_canonical_json_text_v1(p_value),'utf8'),'sha256'),'hex')
$$;

create or replace function public.adle_ing_snapshot_valid_v3(p jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare l jsonb:=p#>'{payload,resolvedLesson}'; n integer; a jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(l) is distinct from 'object' or jsonb_typeof(l->'words') is distinct from 'array'
    or jsonb_typeof(l->'queuedTargets') is distinct from 'array' or jsonb_typeof(p->'activities') is distinct from 'array' then return false; end if;
  n:=jsonb_array_length(l->'queuedTargets');
  if p->>'snapshotSchemaVersion'<>'3' or p#>>'{route,routeId}'<>'ing_endings_word_lab' or p#>>'{route,routeVersion}'<>'v1'
    or p#>>'{payload,kind}'<>'ing_endings_lesson_v1' or p#>>'{payload,version}'<>'1' or p#>>'{runtime,adapterKey}'<>'ing_endings_v1'
    or p#>>'{runtime,rendererKey}'<>'ing_endings_guided' or l->>'authority'<>'reviewed_content' or l->>'routeKey'<>'ing_endings_word_lab:v1'
    or p#>>'{taxonomy,microSkillKey}'<>l->>'microSkillKey' or n not between 1 and 6 or (p#>>'{assignment,itemCount}')::integer<>19+n
    or jsonb_array_length(l->'words')<>6 or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(l->'words'))<>6
    or (select count(distinct value->>'word') from jsonb_array_elements(l->'words'))<>6
    or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(l->'queuedTargets'))<>n
    or exists(select 1 from jsonb_array_elements(l->'words') w where not public.adle_ing_word_valid_v1(w.value) or w.value->>'microSkillKey'<>l->>'microSkillKey')
    or exists(select 1 from jsonb_array_elements(l->'queuedTargets') t where not exists(select 1 from jsonb_array_elements(l->'words') w where w.value->>'canonicalWordId'=t.value->>'canonicalWordId' and w.value->>'learningItemId'=t.value->>'learningItemId'))
    or exists(select 1 from jsonb_array_elements(l->'words') w where (w.value->>'learningItemId' is not null) <> exists(select 1 from jsonb_array_elements(l->'queuedTargets') t where t.value->>'canonicalWordId'=w.value->>'canonicalWordId' and t.value->>'learningItemId'=w.value->>'learningItemId'))
    or jsonb_array_length(p->'contentVersions')<>7
    or public.adle_ing_snapshot_json_sha256_v1(p#-'{provenance,sourceFingerprint}')<>p#>>'{provenance,sourceFingerprint}' then return false; end if;
  for a in select value from jsonb_array_elements(p->'activities') loop
    if concat(a#>>'{canonical,concept}','.',a#>>'{canonical,mode}','@',a#>>'{canonical,contractVersion}') not in
      ('INTRODUCTION.teaching_page@1','MEANING_MATCH.word_to_definition@1','SCRABBLE.ing_tiles@1','CLEAVER.ing_transform_target@1','COVER_CHECK.whole_word@1','DICTATION.single_word_gap@1','LESSON_REFLECTION.standard_lesson_reflection@1') then return false; end if;
  end loop;
  return (select count(*)=19+n and count(*)=count(distinct b.value->>'sourceEntityId') from jsonb_array_elements(p->'activities') a,jsonb_array_elements(a.value->'itemBindings') b);
exception when others then return false;
end $$;

revoke all on function public.adle_ing_snapshot_canonical_json_text_v1(jsonb),public.adle_ing_snapshot_json_sha256_v1(jsonb) from public,anon,authenticated;
grant execute on function public.adle_ing_snapshot_canonical_json_text_v1(jsonb),public.adle_ing_snapshot_json_sha256_v1(jsonb) to service_role;

commit;
