-- JavaScript's canonical object-key sort uses byte order for these ASCII
-- contract keys. The existing database helper uses the database collation;
-- mixed-case siblings such as memberWordIds/members differ under en-GB.
-- Scope the correction to this new route so historical fingerprints stay put.
begin;
create function public.adle_homophone_contextual_canonical_json_text_v1(p_value jsonb)
returns text language plpgsql immutable strict set search_path=public,pg_temp as $$
declare kind text:=jsonb_typeof(p_value); result text;
begin
  if kind='object' then
    select '{'||coalesce(string_agg(to_jsonb(entry.key)::text||':'||
      public.adle_homophone_contextual_canonical_json_text_v1(entry.value),
      ',' order by entry.key collate "C"),'')||'}'
      into result from jsonb_each(p_value) entry;
    return result;
  elsif kind='array' then
    select '['||coalesce(string_agg(
      public.adle_homophone_contextual_canonical_json_text_v1(entry.value),
      ',' order by entry.ordinality),'')||']'
      into result from jsonb_array_elements(p_value) with ordinality entry(value,ordinality);
    return result;
  end if;
  return p_value::text;
end $$;
create function public.adle_homophone_contextual_json_sha256_v1(p_value jsonb)
returns text language sql immutable strict set search_path=public,extensions,pg_temp as $$
  select encode(extensions.digest(convert_to(
    public.adle_homophone_contextual_canonical_json_text_v1(p_value),'utf8'),
    'sha256'),'hex')
$$;
revoke all on function public.adle_homophone_contextual_canonical_json_text_v1(jsonb),
  public.adle_homophone_contextual_json_sha256_v1(jsonb) from public,anon,authenticated;
grant execute on function public.adle_homophone_contextual_canonical_json_text_v1(jsonb),
  public.adle_homophone_contextual_json_sha256_v1(jsonb) to service_role;

do $$
declare function_name text; definition text;
begin
  foreach function_name in array array[
    'public.publish_adle_homophone_contextual_package_v1(jsonb,text,text)',
    'public.adle_homophone_contextual_snapshot_valid_v3(jsonb)',
    'public.set_adle_homophone_contextual_activation_v1(text,text,text,text,jsonb,uuid,text,text)'
  ] loop
    definition:=pg_get_functiondef(to_regprocedure(function_name));
    if definition is null or position('public.adle_generic_snapshot_json_sha256_v1' in definition)=0
    then raise exception 'contextual homophone hash migration source missing: %',function_name; end if;
    execute replace(definition,
      'public.adle_generic_snapshot_json_sha256_v1',
      'public.adle_homophone_contextual_json_sha256_v1');
  end loop;
end $$;
commit;
