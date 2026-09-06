-- Count only approved exact pairs from a published package. Rejected package
-- members remain review outcomes and never become published relationships.
create or replace view public.writing_enrichment_metrics as
select a.environment_key,a.generation_method,a.primary_source_kind,count(*)::bigint candidate_attempts,
  count(l.package_id)::bigint packaged_candidates,
  count(*) filter(where pr.release_id is not null and rev.decisions->>l.candidate_index='approved')::bigint published_candidates,
  count(*) filter(where rev.decisions->>l.candidate_index='approved')::bigint approved_candidates,
  count(*) filter(where rev.decisions->>l.candidate_index='rejected')::bigint rejected_candidates,
  coalesce(sum(m.curator_active_seconds) filter(where l.candidate_index=0),0)::bigint curator_active_seconds,
  0::bigint ai_calls,0::bigint ai_tokens,0::numeric ai_cost
from public.writing_enrichment_attempts a
left join public.writing_enrichment_attempt_packages l on l.attempt_id=a.id
left join public.adle_word_skill_package_reviews rev on rev.package_id=l.package_id
left join public.adle_word_skill_package_publications pr on pr.package_id=l.package_id
left join public.adle_word_skill_review_metrics m on m.package_id=l.package_id
group by a.environment_key,a.generation_method,a.primary_source_kind;

revoke all on public.writing_enrichment_metrics from public,anon,authenticated;
grant select on public.writing_enrichment_metrics to service_role;
