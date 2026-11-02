begin;

-- The same trigger runs on assignment_items, which has metadata but no
-- micro_skill_key column. Read the table-specific field without resolving an
-- absent NEW/OLD record field during PL/pgSQL expression evaluation.
create or replace function public.guard_retired_base_word_new_work()
returns trigger language plpgsql set search_path = public as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_key text;
begin
  v_key := case tg_table_name
    when 'assignment_items' then v_new->'metadata'->>'microSkillKey'
    else v_new->>'micro_skill_key'
  end;
  if v_key in (
    'D4_MOR_BASE_WORDS_PRESERVE_BASE',
    'D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX',
    'D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX'
  ) and exists (
    select 1 from public.micro_skill_catalog c
    where c.micro_skill_key = v_key and (not c.is_active or not c.is_assignable)
  ) then
    if tg_op = 'INSERT'
       or (tg_table_name = 'spelling_canonical_mappings'
           and v_new->>'mapping_status' = 'active' and v_old->>'mapping_status' <> 'active')
       or (tg_table_name = 'adle_learning_items'
           and v_new->>'row_status' = 'active' and v_old->>'row_status' <> 'active')
    then raise exception 'retired base-word micro-skill cannot receive new work: %', v_key;
    end if;
  end if;
  return new;
end;
$$;

commit;
