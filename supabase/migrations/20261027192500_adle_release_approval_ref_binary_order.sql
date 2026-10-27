-- Release files use JavaScript's code-point order for approval references.
-- Compare in the same deterministic order regardless of database locale.
begin;
do $order$
declare
  function_name text;
  body text;
  old_check text := $old$prior_ref.value#>>'{}' >= current_ref.value#>>'{}'$old$;
  new_check text := $new$(prior_ref.value#>>'{}') collate "C" >= (current_ref.value#>>'{}') collate "C"$new$;
begin
  foreach function_name in array array[
    'public.publish_adle_teaching_dictionary_closure_v1(jsonb,text,jsonb,text,text)',
    'public.publish_adle_curriculum_release_v2(jsonb,text,text)'
  ] loop
    select pg_get_functiondef(function_name::regprocedure) into body;
    if body is null then raise exception 'Missing release publisher %', function_name; end if;
    if position(new_check in body) > 0 then continue; end if;
    if position(old_check in body) = 0 then
      if function_name = 'public.publish_adle_curriculum_release_v2(jsonb,text,text)' then continue; end if;
      raise exception 'Approval reference comparison not found in %', function_name;
    end if;
    body := replace(body, old_check, new_check);
    execute body;
  end loop;
end;
$order$;
commit;
