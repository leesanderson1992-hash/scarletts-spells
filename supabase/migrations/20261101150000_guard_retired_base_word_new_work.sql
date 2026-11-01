begin;

-- Historical rows stay readable and issued assignments may finish. Once the
-- catalogue key is retired, only newly created work is rejected.
create or replace function public.guard_retired_base_word_new_work()
returns trigger language plpgsql set search_path = public as $$
declare
  v_key text;
begin
  v_key := case tg_table_name
    when 'assignment_items' then new.metadata->>'microSkillKey'
    else new.micro_skill_key
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
           and new.mapping_status = 'active' and old.mapping_status <> 'active')
       or (tg_table_name = 'adle_learning_items'
           and new.row_status = 'active' and old.row_status <> 'active')
    then raise exception 'retired base-word micro-skill cannot receive new work: %', v_key;
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_retired_base_word_mapping
before insert or update on public.spelling_canonical_mappings
for each row execute function public.guard_retired_base_word_new_work();
create trigger guard_retired_base_word_need
before insert or update on public.adle_learning_items
for each row execute function public.guard_retired_base_word_new_work();
create trigger guard_retired_base_word_assignment
before insert on public.assignment_items
for each row execute function public.guard_retired_base_word_new_work();

commit;
