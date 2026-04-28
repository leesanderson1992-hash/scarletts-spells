begin;

alter table public.misspelling_instances
  add column if not exists error_type text,
  add column if not exists secondary_error_type text,
  add column if not exists confidence_score numeric(4,2),
  add column if not exists suggested_word text,
  add column if not exists is_parent_overridden boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'misspelling_instances_error_type_check'
  ) then
    alter table public.misspelling_instances
      add constraint misspelling_instances_error_type_check
      check (
        error_type is null or error_type in (
          'Phonic',
          'Pattern/rule',
          'Morphology',
          'Irregular/tricky memory word',
          'Careless performance error'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'misspelling_instances_secondary_error_type_check'
  ) then
    alter table public.misspelling_instances
      add constraint misspelling_instances_secondary_error_type_check
      check (
        secondary_error_type is null or secondary_error_type in (
          'Phonic',
          'Pattern/rule',
          'Morphology',
          'Irregular/tricky memory word',
          'Careless performance error'
        )
      );
  end if;
end $$;

create or replace function public.try_parse_jsonb(input text)
returns jsonb
language plpgsql
as $$
begin
  return input::jsonb;
exception
  when others then
    return null;
end;
$$;

with parsed as (
  select
    id,
    public.try_parse_jsonb(notes) as metadata
  from public.misspelling_instances
  where notes is not null
)
update public.misspelling_instances as mi
set
  suggested_word = coalesce(
    mi.suggested_word,
    parsed.metadata ->> 'suggestedWord'
  ),
  error_type = coalesce(
    mi.error_type,
    case
      when coalesce((parsed.metadata ->> 'markedCareless')::boolean, false) then 'Careless performance error'
      when parsed.metadata ->> 'parentOverrideCategory' is not null then parsed.metadata ->> 'parentOverrideCategory'
      when parsed.metadata ->> 'detectedPrimaryCategory' is not null then parsed.metadata ->> 'detectedPrimaryCategory'
      else parsed.metadata ->> 'primaryCategory'
    end
  ),
  secondary_error_type = coalesce(
    mi.secondary_error_type,
    parsed.metadata ->> 'secondaryCategory'
  ),
  confidence_score = coalesce(
    mi.confidence_score,
    case
      when jsonb_typeof(parsed.metadata -> 'confidence') = 'number'
        then (parsed.metadata ->> 'confidence')::numeric
      else null
    end
  ),
  is_parent_overridden = coalesce(
    mi.is_parent_overridden,
    false
  ) or (
    coalesce((parsed.metadata ->> 'markedCareless')::boolean, false)
    or parsed.metadata ->> 'parentOverrideCategory' is not null
  )
from parsed
where mi.id = parsed.id
  and parsed.metadata is not null;

drop function if exists public.try_parse_jsonb(text);

commit;
