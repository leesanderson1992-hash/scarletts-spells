-- CW-3B-1: Compound structure manifests use the shared TypeScript snapshot
-- contract, whose object keys sort by Unicode code point. Pin the equivalent
-- PostgreSQL collation at this specialist publisher boundary. Do not alter the
-- established global Model C hash function or any previously published row.

begin;

create or replace function public.adle_snapshot_json_text_v1(p_value jsonb)
returns text
language plpgsql
immutable
strict
set search_path = public
as $function$
declare
  v_type text := jsonb_typeof(p_value);
  v_result text;
begin
  if v_type = 'object' then
    select '{' || coalesce(string_agg(
      to_jsonb(entry.key)::text || ':' || public.adle_snapshot_json_text_v1(entry.value),
      ',' order by entry.key collate "C"
    ), '') || '}'
      into v_result
      from jsonb_each(p_value) entry;
    return v_result;
  elsif v_type = 'array' then
    select '[' || coalesce(string_agg(
      public.adle_snapshot_json_text_v1(entry.value),
      ',' order by entry.ordinality
    ), '') || ']'
      into v_result
      from jsonb_array_elements(p_value) with ordinality entry(value, ordinality);
    return v_result;
  end if;
  return p_value::text;
end;
$function$;

create or replace function public.adle_snapshot_json_sha256_v1(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = public, extensions
as $function$
  select encode(
    extensions.digest(
      convert_to(public.adle_snapshot_json_text_v1(p_value), 'utf8'),
      'sha256'
    ),
    'hex'
  )
$function$;

revoke all on function public.adle_snapshot_json_text_v1(jsonb) from public, anon, authenticated;
revoke all on function public.adle_snapshot_json_sha256_v1(jsonb) from public, anon, authenticated;
grant execute on function public.adle_snapshot_json_sha256_v1(jsonb) to service_role;

do $migration$
declare
  v_signature constant text := 'public.publish_adle_compound_word_structure_authority_v1(jsonb,text,text)';
  v_definition text;
  v_old constant text := 'v_fingerprint:=public.adle_canonical_json_sha256_v1(v_projection);';
  v_new constant text := 'v_fingerprint:=public.adle_snapshot_json_sha256_v1(v_projection);';
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null or position(v_old in v_definition) = 0 then
    raise exception 'Compound structure publisher predecessor differs from reviewed CW-3B-1 contract';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  if position(v_old in v_definition) > 0 or position(v_new in v_definition) = 0 then
    raise exception 'Compound structure fingerprint replacement was not exact';
  end if;
  execute v_definition;
end;
$migration$;

comment on function public.adle_snapshot_json_sha256_v1(jsonb) is
  'Stable SHA-256 for shared TypeScript snapshot JSON: object keys use explicit C collation and arrays retain authored order.';

commit;
