-- Stage 1 is shadow only. Applying infrastructure never activates dispatch.
begin;
update public.writing_context_advisory_control set enabled=false,ai_mode='disabled';
alter table public.writing_context_advisory_control add constraint context_stage1_shadow_only
  check (enabled=false and ai_mode in ('disabled','shadow'));
alter table public.writing_context_diagnostic_promotions
  drop constraint writing_context_diagnostic_promotions_decision_id_fkey,
  drop constraint writing_context_diagnostic_promotions_occurrence_id_fkey,
  drop constraint writing_context_diagnostic_promotions_parent_user_id_fkey,
  drop constraint writing_context_diagnostic_promotions_child_id_fkey,
  add foreign key (decision_id) references public.writing_context_parent_decisions(id) on delete cascade,
  add foreign key (occurrence_id) references public.writing_occurrences(id) on delete cascade,
  add foreign key (parent_user_id) references auth.users(id) on delete cascade,
  add foreign key (child_id) references public.children(id) on delete cascade;
-- Existing learning handoff RESTRICT boundaries deliberately remain intact.
commit;
