-- Context issues use the immutable learner source, not browser-supplied text.
-- UTF-16 offsets are converted explicitly because JavaScript spans can follow emoji.
create or replace function public.context_char_offset_from_utf16(p_text text, p_utf16 integer)
returns integer language plpgsql immutable set search_path=public,pg_temp as $$
declare v_index integer := 0; v_units integer := 0; v_codepoint integer;
begin
  if p_utf16 < 0 then raise exception 'CONTEXT_SENTENCE_SPAN_INVALID'; end if;
  while v_index < char_length(p_text) and v_units < p_utf16 loop
    v_codepoint := ascii(substr(p_text,v_index+1,1));
    v_units := v_units + case when v_codepoint > 65535 then 2 else 1 end;
    v_index := v_index + 1;
  end loop;
  if v_units <> p_utf16 then raise exception 'CONTEXT_SENTENCE_SPAN_INVALID'; end if;
  return v_index;
end $$;
revoke all on function public.context_char_offset_from_utf16(text,integer) from public,anon,authenticated;

create or replace function public.context_last_sentence_boundary(p_text text)
returns integer language plpgsql immutable set search_path=public,pg_temp as $$
declare v_index integer; v_last integer := 0;
begin
  for v_index in 1..char_length(p_text) loop
    if substr(p_text,v_index,1) in ('.','!','?',E'\n') then v_last := v_index; end if;
  end loop;
  return v_last;
end $$;
revoke all on function public.context_last_sentence_boundary(text) from public,anon,authenticated;

create or replace function public.stamp_verified_context_issue_sentence() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_occurrence public.writing_occurrences%rowtype;
  v_snapshot public.writing_source_snapshots%rowtype;
  v_value jsonb; v_segment text; v_field text;
  v_start integer; v_end integer; v_sentence_start integer; v_sentence_end integer;
  v_next integer; v_sentence text;
begin
  if new.metadata->>'source_kind' <> 'contextual_advisory_v4' then return new; end if;
  select * into v_occurrence from public.writing_occurrences
    where id=new.source_writing_occurrence_id;
  select * into v_snapshot from public.writing_source_snapshots
    where id=v_occurrence.snapshot_id;
  if v_occurrence.id is null or v_snapshot.id is null or
    v_occurrence.provenance <> 'learner_response' or
    v_snapshot.child_id <> new.child_id or
    v_snapshot.parent_user_id <> new.parent_user_id or
    v_snapshot.submission_id <> new.task_submission_id or
    v_occurrence.field_path is null or left(v_occurrence.field_path,1) <> '/'
  then raise exception 'CONTEXT_SENTENCE_SOURCE_INVALID'; end if;

  v_value := v_snapshot.envelope;
  foreach v_segment in array string_to_array(substr(v_occurrence.field_path,2),'/') loop
    v_segment := replace(replace(v_segment,'~1','/'),'~0','~');
    if jsonb_typeof(v_value) = 'array' then
      if v_segment !~ '^[0-9]+$' then raise exception 'CONTEXT_SENTENCE_FIELD_INVALID'; end if;
      v_value := v_value -> (v_segment::integer);
    else
      v_value := v_value -> v_segment;
    end if;
  end loop;
  if jsonb_typeof(v_value) <> 'string' or
    encode(extensions.digest(convert_to(v_value::text,'UTF8'),'sha256'),'hex') <> v_occurrence.field_hash
  then raise exception 'CONTEXT_SENTENCE_FIELD_INVALID'; end if;
  v_field := v_value #>> '{}';
  v_start := public.context_char_offset_from_utf16(v_field,v_occurrence.start_utf16);
  v_end := public.context_char_offset_from_utf16(v_field,v_occurrence.end_utf16);
  if v_start >= v_end or substr(v_field,v_start+1,v_end-v_start) <> v_occurrence.observed_text or
    new.observed_text <> v_occurrence.observed_text
  then raise exception 'CONTEXT_SENTENCE_SPAN_INVALID'; end if;

  v_sentence_start := public.context_last_sentence_boundary(left(v_field,v_start));
  v_next := least(nullif(strpos(substr(v_field,v_end+1),'.'),0),
    nullif(strpos(substr(v_field,v_end+1),'!'),0),
    nullif(strpos(substr(v_field,v_end+1),'?'),0),
    nullif(strpos(substr(v_field,v_end+1),E'\n'),0));
  v_sentence_end := case when v_next is null then char_length(v_field) else v_end+v_next end;
  v_sentence := btrim(substr(v_field,v_sentence_start+1,v_sentence_end-v_sentence_start),E' \t\n\r\f');
  if v_sentence = '' then raise exception 'CONTEXT_SENTENCE_SPAN_INVALID'; end if;
  new.context_text := v_sentence;
  return new;
end $$;
revoke all on function public.stamp_verified_context_issue_sentence() from public,anon,authenticated;
drop trigger if exists zzz_context_issue_sentence on public.writing_issues;
create trigger zzz_context_issue_sentence before insert on public.writing_issues
  for each row execute function public.stamp_verified_context_issue_sentence();
