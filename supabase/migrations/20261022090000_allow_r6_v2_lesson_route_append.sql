-- R6 appends a specialist lesson to a Review-first assignment. The table's
-- versioned CHECK accepts v1 and v2 metadata, but the R6 update trigger only
-- accepted v1. Keep the one-time append and stage guards while accepting the
-- same two versions as the table constraint.
begin;

create or replace function public.prevent_adle_lesson_route_metadata_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.lesson_route_metadata is distinct from new.lesson_route_metadata then
    if old.lesson_route_metadata is not null
      or new.lesson_route_metadata is null
      or not (
        public.adle_lesson_route_metadata_is_valid_v1(new.lesson_route_metadata)
        or public.adle_lesson_route_metadata_is_valid_v2(new.lesson_route_metadata)
      )
      or coalesce(current_setting('adle.r6_specialist_append', true), '') <> 'on'
      or not exists (
        select 1 from public.adle_today_session_orchestrations orchestration
        where orchestration.daily_assignment_id = old.id
          and orchestration.major_stage = 'specialist_generation'
      )
    then
      raise exception 'ADLE lesson route metadata is immutable';
    end if;
  end if;
  return new;
end;
$$;

commit;
