-- Durable route progress and answer locks. No activation or learner writes.
begin;

create function public.adle_latin_root_trees_valid_v1(content jsonb,state jsonb,require_complete boolean)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare family jsonb; snapshot jsonb; word jsonb; placements jsonb; part jsonb; actual_part jsonb;
 piece text; source_word jsonb; slot integer; part_position integer; used text[];
begin
 if jsonb_typeof(state->'familyProgress') is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(state->'familyProgress') k where not exists(
  select 1 from jsonb_array_elements(content->'families') f where f.value->>'id'=k)) then return false; end if;
 for family in select value from jsonb_array_elements(content->'families') loop
  snapshot:=state->'familyProgress'->(family->>'id'); used:=array[]::text[];
  if snapshot is null then if require_complete then return false; else continue; end if; end if;
  if jsonb_typeof(snapshot->'placements') is distinct from 'object'
    or jsonb_typeof(snapshot->'completedTargetIds') is distinct from 'array'
    or (select count(*) from jsonb_array_elements(snapshot->'completedTargetIds'))<>
       (select count(distinct value) from jsonb_array_elements_text(snapshot->'completedTargetIds'))
    or exists(select 1 from jsonb_array_elements_text(snapshot->'completedTargetIds') id where not exists(
      select 1 from jsonb_array_elements(family->'words') w where w.value->>'id'=id)) then return false; end if;
  if require_complete and jsonb_array_length(snapshot->'completedTargetIds')<>jsonb_array_length(family->'words') then return false; end if;
  for word in select value from jsonb_array_elements(family->'words') loop
   placements:=snapshot->'placements'->(word->>'id');
   if placements is null then
    if snapshot->'completedTargetIds' ? (word->>'id') then return false; else continue; end if;
   end if;
   if jsonb_typeof(placements) is distinct from 'array' or jsonb_array_length(placements)<>
      (select count(*) from jsonb_array_elements(word->'parts') p where p.value->>'role'<>'root') then return false; end if;
   slot:=0;
   for part in select value from jsonb_array_elements(word->'parts') where value->>'role'<>'root' loop
    piece:=placements->>slot; slot:=slot+1;
    if piece is null then
     if snapshot->'completedTargetIds' ? (word->>'id') then return false; else continue; end if;
    end if;
    if piece=any(used) then return false; end if;
    used:=array_append(used,piece);
    select value into source_word from jsonb_array_elements(family->'words') where value->>'id'=split_part(piece,':',1);
    part_position:=split_part(piece,':',2)::integer;
    actual_part:=source_word->'parts'->part_position;
    if source_word is null or actual_part is null or actual_part->>'role'='root' then return false; end if;
    if snapshot->'completedTargetIds' ? (word->>'id') and actual_part is distinct from part then return false; end if;
   end loop;
  end loop;
 end loop;
 return true;
exception when others then return false;
end $$;

create function public.adle_latin_root_progress_valid_v1(content jsonb,state jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare stage integer; n integer; entry record; key text; word_id text;
begin
 if jsonb_typeof(state) is distinct from 'object' or state->>'schemaVersion' is distinct from '1'
   or state->>'contentId' is distinct from content->>'id'
   or coalesce(state->>'stage','') not in('learn','tree','spell','cover','dictation','reflect')
   or jsonb_typeof(state->'introSlide') is distinct from 'number'
   or jsonb_typeof(state->'familyIndex') is distinct from 'number'
   or jsonb_typeof(state->'index') is distinct from 'number'
   or (state->>'introSlide')::integer not between 0 and 5
   or (state->>'familyIndex')::integer not between 0 and jsonb_array_length(content->'families')-1
   or jsonb_typeof(state->'finished') is distinct from 'boolean' or jsonb_typeof(state->'spellComplete') is distinct from 'boolean'
   or jsonb_typeof(state->'reflection') is distinct from 'string' or char_length(state->>'reflection')>1000
   or not public.adle_latin_root_trees_valid_v1(content,state,false) then return false; end if;
 select count(*) into n from jsonb_array_elements(content->'families') f,jsonb_array_elements(f.value->'words') w;
 if (state->>'index')::integer not between 0 and n-1 then return false; end if;
 foreach key in array array['coverStates','coverAttempts','sentenceValues','sentenceAttempts'] loop
  if jsonb_typeof(state->key) is distinct from 'object' then return false; end if;
  for entry in select * from jsonb_each(state->key) loop
   if not exists(select 1 from jsonb_array_elements(content->'families') f,jsonb_array_elements(f.value->'words') w
     where w.value->>'id'=entry.key) then return false; end if;
   if key='coverStates' then
    if coalesce(entry.value->>'state','') not in('look','cover','write','check') or jsonb_typeof(entry.value->'attempt') is distinct from 'string'
      or char_length(entry.value->>'attempt')>200 then return false; end if;
   elsif jsonb_typeof(entry.value) is distinct from 'string' or char_length(entry.value#>>'{}')>
     (case when key='coverAttempts' then 200 else 1000 end) then return false; end if;
  end loop;
 end loop;
 stage:=array_position(array['learn','tree','spell','cover','dictation','reflect'],state->>'stage');
 if stage>=3 and not public.adle_latin_root_trees_valid_v1(content,state,true) then return false; end if;
 if stage>=4 and state->'spellComplete' is distinct from 'true'::jsonb then return false; end if;
 for word_id in select w.value->>'id' from jsonb_array_elements(content->'families') f,jsonb_array_elements(f.value->'words') w loop
  if stage>=5 and not state->'coverAttempts' ? word_id then return false; end if;
  if stage>=6 and not state->'sentenceAttempts' ? word_id then return false; end if;
 end loop;
 return state->'finished'='false'::jsonb or (stage=6 and nullif(btrim(state->>'reflection'),'') is not null);
exception when others then return false;
end $$;

create function public.guard_latin_root_checkpoint_v1() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare snapshot jsonb; next_state jsonb:=new.checkpoint_payload->'state'; old_state jsonb; key text; entry record; family record; word_id text;
begin
 select compiled_lesson_snapshot into snapshot from public.daily_assignments where id=new.daily_assignment_id;
 if snapshot#>>'{route,routeId}' is distinct from 'latin_root_word_lab' then return new; end if;
 if new.adapter_key is distinct from 'latin_root_v1' or new.checkpoint_schema_version is distinct from 'latin_root_progress_v1'
   or new.lesson_snapshot_fingerprint is distinct from snapshot#>>'{provenance,sourceFingerprint}'
   or not public.adle_latin_root_progress_valid_v1(snapshot#>'{payload,resolvedLesson,content}',next_state)
   then raise exception 'LATIN_ROOT_CHECKPOINT_INVALID'; end if;
 if tg_op='INSERT' then
  if next_state->'finished' is distinct from 'false'::jsonb then raise exception 'LATIN_ROOT_CHECKPOINT_FINISH_FORBIDDEN'; end if;
 else
  old_state:=old.checkpoint_payload->'state';
  if old.completed_at is not null and old.checkpoint_payload is distinct from new.checkpoint_payload then raise exception 'LATIN_ROOT_COMPLETED_PROGRESS_LOCKED'; end if;
  if next_state->'finished'='true'::jsonb and old_state->'finished'='false'::jsonb and
    (new.checkpoint_payload is distinct from jsonb_set(old.checkpoint_payload,'{state,finished}','true'::jsonb) or new.completed_at is null)
    then raise exception 'LATIN_ROOT_CHECKPOINT_FINISH_FORBIDDEN'; end if;
  foreach key in array array['coverAttempts','sentenceAttempts'] loop
   for entry in select * from jsonb_each(old_state->key) loop
    if next_state->key->entry.key is distinct from entry.value then raise exception 'LATIN_ROOT_FIRST_ATTEMPT_LOCKED'; end if;
   end loop;
  end loop;
  if old_state->'spellComplete'='true'::jsonb and next_state->'spellComplete' is distinct from 'true'::jsonb then raise exception 'LATIN_ROOT_GUIDED_PROGRESS_LOCKED'; end if;
  for family in select * from jsonb_each(old_state->'familyProgress') loop
   for word_id in select jsonb_array_elements_text(family.value->'completedTargetIds') loop
    if not next_state->'familyProgress'->family.key->'completedTargetIds' ? word_id
      or next_state->'familyProgress'->family.key->'placements'->word_id is distinct from family.value->'placements'->word_id
      then raise exception 'LATIN_ROOT_BRANCH_PROGRESS_LOCKED'; end if;
   end loop;
  end loop;
 end if;
 return new;
end $$;
create trigger latin_root_checkpoint_answer_lock before insert or update on public.adle_specialist_stage_checkpoints
 for each row execute function public.guard_latin_root_checkpoint_v1();

revoke all on function public.adle_latin_root_trees_valid_v1(jsonb,jsonb,boolean),public.adle_latin_root_progress_valid_v1(jsonb,jsonb)
 from public,anon,authenticated;
grant execute on function public.adle_latin_root_trees_valid_v1(jsonb,jsonb,boolean),public.adle_latin_root_progress_valid_v1(jsonb,jsonb) to service_role;
commit;
