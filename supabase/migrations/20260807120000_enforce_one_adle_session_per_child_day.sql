-- One learner-facing ADLE session per child and local practice day, shared by
-- the current specialist persistence families and the future scheduler.
do $$
begin
  if exists (
    select 1
    from public.daily_assignments
    where (
      title = 'ADLE Daily Plan'
      and assignment_generation_source = 'adle_composer_v1'
    ) or (
      title = 'ADLE Base-word Family Pilot'
      and assignment_generation_source = 'adle_base_word_family_pilot_v1'
    )
    group by child_id, assignment_date
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot enforce one ADLE session per child/day: recognized duplicates exist.';
  end if;
end
$$;

create unique index if not exists daily_assignments_one_recognized_adle_session_per_child_day_idx
  on public.daily_assignments (child_id, assignment_date)
  where (
    title = 'ADLE Daily Plan'
    and assignment_generation_source = 'adle_composer_v1'
  ) or (
    title = 'ADLE Base-word Family Pilot'
    and assignment_generation_source = 'adle_base_word_family_pilot_v1'
  );

comment on index public.daily_assignments_one_recognized_adle_session_per_child_day_idx is
  'Canonical manual/scheduled ADLE day identity. Prevents parallel standard and Base Word session namespaces.';
