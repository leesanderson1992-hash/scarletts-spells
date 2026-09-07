-- E1/S5 integration: stable event baselines and current evidence per occurrence.
-- This remains a read-model concern and has no learning-authority side effects.

alter table public.writing_enrichment_replay_targets
  add column before_interpretation_id uuid references public.writing_occurrence_interpretations(id);

alter table public.writing_enrichment_authority_events
  alter column recorded_at set default clock_timestamp();

-- Pin the newest completed interpretation that existed when the authority event
-- was recorded. Later ordinary shadow replays must not rewrite event metrics.
update public.writing_enrichment_replay_targets t
set before_interpretation_id=(
  select i.id
  from public.writing_occurrence_interpretations i
  join public.writing_shadow_runs r on r.id=i.run_id and r.status='completed'
  left join public.writing_shadow_run_enrichment_scopes s on s.run_id=r.id
  join public.writing_enrichment_authority_events e on e.id=t.event_id
  where i.occurrence_id=t.occurrence_id
    and coalesce(s.event_sequence,0)<e.event_sequence
    and r.completed_at<=e.recorded_at
  order by coalesce(s.event_sequence,0) desc,r.completed_at desc,r.id desc,i.id desc
  limit 1
);

create function public.capture_writing_enrichment_before_interpretation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  select i.id into new.before_interpretation_id
  from public.writing_occurrence_interpretations i
  join public.writing_shadow_runs r on r.id=i.run_id and r.status='completed'
  left join public.writing_shadow_run_enrichment_scopes s on s.run_id=r.id
  join public.writing_enrichment_authority_events e on e.id=new.event_id
  where i.occurrence_id=new.occurrence_id
    and coalesce(s.event_sequence,0)<e.event_sequence
    and r.completed_at<=e.recorded_at
  order by coalesce(s.event_sequence,0) desc,r.completed_at desc,r.id desc,i.id desc
  limit 1;
  return new;
end $$;

create trigger writing_enrichment_capture_before_interpretation
  before insert on public.writing_enrichment_replay_targets
  for each row execute function public.capture_writing_enrichment_before_interpretation();

create function public.protect_writing_enrichment_before_interpretation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.before_interpretation_id is distinct from old.before_interpretation_id then
    raise exception 'writing_enrichment_before_interpretation_immutable';
  end if;
  return new;
end $$;

create trigger writing_enrichment_protect_before_interpretation
  before update on public.writing_enrichment_replay_targets
  for each row execute function public.protect_writing_enrichment_before_interpretation();

create or replace view public.writing_enrichment_event_resolution_metrics as
select e.id event_id,e.event_kind,e.environment_key,count(t.occurrence_id)::bigint affected_occurrences,
  count(*) filter(where before_i.resolution_status<>'resolved' and after_i.resolution_status='resolved')::bigint identity_resolutions,
  count(*) filter(where (case when jsonb_typeof(before_i.interpretation->'relationships')='array' then jsonb_array_length(before_i.interpretation->'relationships') else 0 end)=0
    and (case when jsonb_typeof(after_i.interpretation->'relationships')='array' then jsonb_array_length(after_i.interpretation->'relationships') else 0 end)>0)::bigint relationship_resolutions,
  count(*) filter(where (case when jsonb_typeof(before_i.interpretation->'relationships')='array' then jsonb_array_length(before_i.interpretation->'relationships') else 0 end)>0
    and (case when jsonb_typeof(after_i.interpretation->'relationships')='array' then jsonb_array_length(after_i.interpretation->'relationships') else 0 end)=0)::bigint relationship_withdrawals
from public.writing_enrichment_authority_events e
left join public.writing_enrichment_replay_targets t on t.event_id=e.id
left join public.writing_occurrence_interpretations before_i on before_i.id=t.before_interpretation_id
left join lateral (
  select i.* from public.writing_occurrence_interpretations i
  join public.writing_shadow_runs r on r.id=i.run_id and r.status='completed'
  join public.writing_shadow_run_enrichment_scopes s on s.run_id=r.id and s.event_sequence=e.event_sequence
  where i.occurrence_id=t.occurrence_id
  order by r.completed_at desc,r.id desc,i.id desc limit 1
) after_i on true
group by e.id,e.event_kind,e.environment_key;

-- S5's report consumes this joined view in current mode. The underlying E1
-- view selects per occurrence, so a partial replay retains unaffected receipts.
create view public.writing_shadow_current_occurrence_report
with (security_invoker=true) as
select e.*,b.run_id,b.snapshot_id,b.parent_user_id,b.child_id,b.created_at batch_created_at
from public.writing_shadow_current_occurrence_evidence e
join public.writing_shadow_projection_batches b on b.id=e.batch_id;

revoke all on public.writing_shadow_current_occurrence_report from public,anon,authenticated;
grant select on public.writing_shadow_current_occurrence_report to service_role;

revoke all on function public.capture_writing_enrichment_before_interpretation(),
  public.protect_writing_enrichment_before_interpretation() from public,anon,authenticated;
