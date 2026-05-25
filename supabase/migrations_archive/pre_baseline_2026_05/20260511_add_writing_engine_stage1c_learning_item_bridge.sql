begin;

-- Stage 1C allows parent-verified diagnostic outcomes to create canonical
-- learning-item streams without fabricating authentic-writing issues.
alter table public.learning_items
  alter column source_writing_issue_id drop not null;

commit;
