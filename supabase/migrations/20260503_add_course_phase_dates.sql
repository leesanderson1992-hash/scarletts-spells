begin;

alter table public.course_phases
  add column if not exists start_date date,
  add column if not exists end_date date;

update public.course_phases as phase
set
  start_date = (
    course.start_date
    + ((phase.position * greatest(coalesce(course.cycle_length_weeks, 4), 1) * 7))
  ),
  end_date = least(
    course.start_date
    + ((((phase.position + 1) * greatest(coalesce(course.cycle_length_weeks, 4), 1) * 7)) - 1),
    course.start_date + ((course.duration_weeks * 7) - 1)
  )
from public.courses as course
where phase.course_id = course.id
  and course.structure_type = 'timed'
  and course.start_date is not null
  and course.duration_weeks is not null
  and course.duration_weeks > 0;

commit;
