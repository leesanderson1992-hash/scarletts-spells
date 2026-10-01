-- Contextual learning needs use a source writing occurrence. They must not be
-- materialised as spelling-instance sources when their parent-confirmed
-- outcome finalises.
create or replace function public.materialize_spelling_occurrence_source_on_finalisation()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.metadata->>'source_kind'='contextual_advisory_v4' then
    return new;
  end if;
  if new.issue_status='finalised' and new.final_classification is not null then
    if tg_op='INSERT' or old.issue_status is distinct from new.issue_status
       or old.final_classification is distinct from new.final_classification then
      perform public.ensure_parent_approved_spelling_occurrence_source(
        new.id,new.parent_user_id,new.child_id,new.final_classification
      );
    end if;
  end if;
  return new;
end $$;
