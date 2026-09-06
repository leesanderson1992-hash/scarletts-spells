-- Whole-writing S5: append-only Phase C shadow receipts and indexed skill views.
-- These tables are read models only. They have no triggers into learning,
-- rewards, proficiency, Authentic Use, Review, or retirement authorities.
create table public.writing_shadow_projection_batches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.writing_shadow_runs(id) on delete cascade,
  snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  evidence_interpretation_version text not null,
  relationship_authority_fingerprint text,
  source_fingerprint text not null,
  event_fingerprint text not null,
  projection_fingerprint text not null,
  candidate_count integer not null check(candidate_count >= 0),
  admitted_count integer not null check(admitted_count >= 0),
  excluded_count integer not null check(excluded_count >= 0),
  blocked_count integer not null check(blocked_count >= 0),
  ambiguous_count integer not null check(ambiguous_count >= 0),
  projection_count integer not null check(projection_count >= 0),
  created_at timestamptz not null default now()
);
create index writing_shadow_projection_batches_child_idx
  on public.writing_shadow_projection_batches(child_id,created_at desc,id desc);
create index writing_shadow_projection_batches_snapshot_idx
  on public.writing_shadow_projection_batches(snapshot_id,created_at desc,id desc);

create table public.writing_shadow_occurrence_evidence_receipts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.writing_shadow_projection_batches(id) on delete cascade,
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  interpretation_id uuid not null references public.writing_occurrence_interpretations(id) on delete cascade,
  assessment_id uuid not null references public.writing_occurrence_assessments(id) on delete cascade,
  canonical_word_id uuid references public.canonical_teaching_dictionary_words(id),
  candidate_id text not null,
  performance_lineage_key text not null,
  event_id text,
  disposition text not null check(disposition in ('ADMITTED','EXCLUDED','BLOCKED','AMBIGUOUS')),
  reason text not null,
  prior_receipt_id uuid references public.writing_shadow_occurrence_evidence_receipts(id),
  lineage_reconciliation text not null check(lineage_reconciliation in ('ORIGINAL','EXACT_HISTORICAL_MATCH')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(batch_id,candidate_id),
  unique(batch_id,occurrence_id),
  check((prior_receipt_id is null) = (lineage_reconciliation = 'ORIGINAL'))
);
create index writing_shadow_receipts_occurrence_idx
  on public.writing_shadow_occurrence_evidence_receipts(occurrence_id,created_at desc,id desc);
create index writing_shadow_receipts_lineage_idx
  on public.writing_shadow_occurrence_evidence_receipts(performance_lineage_key,created_at desc,id desc);
create index writing_shadow_receipts_word_idx
  on public.writing_shadow_occurrence_evidence_receipts(canonical_word_id,occurred_at desc)
  where canonical_word_id is not null;
create index writing_shadow_receipts_decision_idx
  on public.writing_shadow_occurrence_evidence_receipts(disposition,reason,occurred_at desc);

-- Governed relationships remain visible even while an occurrence is blocked.
-- These rows are candidates for a skill history, not admitted evidence.
create table public.writing_shadow_occurrence_skill_candidates (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.writing_shadow_occurrence_evidence_receipts(id) on delete cascade,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  relationship_authority_fingerprint text not null,
  relationship_role text not null check(relationship_role = 'demonstrates'),
  created_at timestamptz not null default now(),
  unique(receipt_id,micro_skill_key,relationship_authority_fingerprint)
);
create index writing_shadow_skill_candidates_skill_idx
  on public.writing_shadow_occurrence_skill_candidates(micro_skill_key,created_at desc,receipt_id);

-- Only projections admitted by the existing Phase C classifier are stored here.
create table public.writing_shadow_skill_evidence_projections (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.writing_shadow_projection_batches(id) on delete cascade,
  receipt_id uuid not null references public.writing_shadow_occurrence_evidence_receipts(id) on delete cascade,
  projection_id text not null,
  event_id text not null,
  learner_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  polarity text not null check(polarity in ('positive','negative')),
  occurred_at timestamptz not null,
  environment text not null check(environment in ('CONTROLLED_LESSON','ISOLATED_RETRIEVAL','CONTEXTUAL_TRANSFER','AUTHENTIC_WRITING','REPAIR','EXPOSURE_ONLY')),
  relationship_authority_fingerprint text,
  created_at timestamptz not null default now(),
  unique(batch_id,projection_id)
);
create index writing_shadow_skill_projection_history_idx
  on public.writing_shadow_skill_evidence_projections(learner_id,micro_skill_key,occurred_at desc,id);
create index writing_shadow_skill_projection_event_idx
  on public.writing_shadow_skill_evidence_projections(event_id,projection_id);

create trigger writing_shadow_projection_batch_immutable before update on public.writing_shadow_projection_batches
  for each row execute function public.reject_writing_fact_update();
create trigger writing_shadow_evidence_receipt_immutable before update on public.writing_shadow_occurrence_evidence_receipts
  for each row execute function public.reject_writing_fact_update();
create trigger writing_shadow_skill_candidate_immutable before update on public.writing_shadow_occurrence_skill_candidates
  for each row execute function public.reject_writing_fact_update();
create trigger writing_shadow_skill_projection_immutable before update on public.writing_shadow_skill_evidence_projections
  for each row execute function public.reject_writing_fact_update();

-- Current means the newest completed projection batch for an immutable source
-- snapshot. Historical batches remain directly addressable and unchanged.
create view public.writing_shadow_current_projection_batches
with (security_invoker = true) as
select distinct on (b.snapshot_id) b.*
from public.writing_shadow_projection_batches b
join public.writing_shadow_runs r on r.id=b.run_id and r.status='completed'
order by b.snapshot_id,r.completed_at desc,r.id desc,b.id desc;

create view public.writing_shadow_current_occurrence_evidence
with (security_invoker = true) as
select e.* from public.writing_shadow_occurrence_evidence_receipts e
join public.writing_shadow_current_projection_batches b on b.id=e.batch_id;

-- Replace the S2 writer so occurrence, interpretation, assessment, Phase C
-- decision, governed skill candidate, and admitted projection receipts commit
-- atomically with the completed run.
create or replace function public.persist_writing_shadow_result(p_run_id uuid,p_lease_token uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare
  r public.writing_shadow_runs%rowtype;
  source public.writing_source_snapshots%rowtype;
  item jsonb;
  decision jsonb;
  relation jsonb;
  projected jsonb;
  interpreted_id uuid;
  assessed_id uuid;
  v_batch_id uuid;
  v_receipt_id uuid;
  v_prior_id uuid;
  evidence jsonb;
  reconciliation jsonb;
  occurrence_count integer;
  decision_count integer;
begin
  select * into r from public.writing_shadow_runs where id=p_run_id and status='processing' and lease_token=p_lease_token for update;
  if r.id is null then return false; end if;
  if jsonb_typeof(p_result) is distinct from 'object' then raise exception 'writing_result_invalid'; end if;
  select * into source from public.writing_source_snapshots where id=r.snapshot_id;
  for item in select value from jsonb_array_elements(coalesce(p_result->'occurrences','[]'::jsonb)) loop
    insert into public.writing_occurrences(id,snapshot_id,field_path,start_utf16,end_utf16,observed_text,field_hash,provenance,extractor_version)
    values(item->>'id',r.snapshot_id,item->>'fieldKey',(item->>'start')::integer,(item->>'end')::integer,item->>'observedText',item->>'textHash',item->>'provenance',p_result->>'extractionVersion')
    on conflict(id) do nothing;
    if not exists(select 1 from public.writing_occurrences o where o.id=item->>'id' and o.snapshot_id=r.snapshot_id
      and o.field_path=item->>'fieldKey' and o.start_utf16=(item->>'start')::integer and o.end_utf16=(item->>'end')::integer
      and o.observed_text=item->>'observedText' and o.field_hash=item->>'textHash') then raise exception 'writing_occurrence_collision'; end if;
    insert into public.writing_occurrence_interpretations(occurrence_id,run_id,canonical_word_id,normalized_form,dialect,resolution_status,interpretation)
    values(item->>'id',r.id,nullif(item->'interpretation'->>'canonicalWordId','')::uuid,item->'interpretation'->>'normalizedForm',item->'interpretation'->>'dialect',item->'interpretation'->>'status',item->'interpretation')
    returning id into interpreted_id;
    assessed_id := coalesce((item->>'assessmentId')::uuid,gen_random_uuid());
    insert into public.writing_occurrence_assessments(id,interpretation_id,assessment)
    values(assessed_id,interpreted_id,jsonb_build_object('qualification','PENDING','contextStatus','NOT_ASSESSED','source','whole_writing_shadow'));
  end loop;

  evidence := p_result->'shadowEvidence';
  if jsonb_typeof(evidence) = 'object' then
    reconciliation := evidence->'reconciliation';
    if jsonb_typeof(reconciliation) is distinct from 'object' then raise exception 'writing_evidence_reconciliation_invalid'; end if;
    select count(*) into occurrence_count from public.writing_occurrence_interpretations where run_id=r.id;
    select jsonb_array_length(coalesce(evidence->'decisions','[]'::jsonb)) into decision_count;
    if occurrence_count <> decision_count then raise exception 'writing_evidence_coverage_incomplete'; end if;
    insert into public.writing_shadow_projection_batches(
      run_id,snapshot_id,parent_user_id,child_id,evidence_interpretation_version,relationship_authority_fingerprint,
      source_fingerprint,event_fingerprint,projection_fingerprint,candidate_count,admitted_count,excluded_count,blocked_count,ambiguous_count,projection_count)
    values(
      r.id,r.snapshot_id,source.parent_user_id,source.child_id,reconciliation->>'interpretationVersion',p_result->>'relationshipAuthorityFingerprint',
      reconciliation->>'sourceFingerprint',reconciliation->>'eventFingerprint',reconciliation->>'projectionFingerprint',
      (reconciliation->>'rawCandidateSourceRowCount')::integer,(reconciliation->>'admittedSourceEventCount')::integer,
      (reconciliation->>'excludedCount')::integer,(reconciliation->>'blockedCount')::integer,
      (reconciliation->>'ambiguousCount')::integer,jsonb_array_length(coalesce(evidence->'projections','[]'::jsonb)))
    returning id into v_batch_id;

    for decision in select value from jsonb_array_elements(coalesce(evidence->'decisions','[]'::jsonb)) loop
      if decision->>'sourceKind' is distinct from 'whole_writing_occurrence' then raise exception 'writing_evidence_source_invalid'; end if;
      select i.id,a.id into interpreted_id,assessed_id
      from public.writing_occurrence_interpretations i
      join public.writing_occurrence_assessments a on a.interpretation_id=i.id
      where i.run_id=r.id and i.occurrence_id=decision->>'sourceEntityId'
        and decision->>'candidateId'='whole-writing-assessment:'||a.id::text;
      if interpreted_id is null or nullif(decision->>'performanceLineageKey','') is null then
        raise exception 'writing_evidence_decision_unmatched';
      end if;
      select e.id into v_prior_id from public.writing_shadow_occurrence_evidence_receipts e
      join public.writing_shadow_projection_batches b on b.id=e.batch_id
      where b.snapshot_id=r.snapshot_id and e.performance_lineage_key=decision->>'performanceLineageKey'
      order by b.created_at desc,b.id desc,e.id desc limit 1;
      insert into public.writing_shadow_occurrence_evidence_receipts(
        batch_id,occurrence_id,interpretation_id,assessment_id,canonical_word_id,candidate_id,performance_lineage_key,event_id,
        disposition,reason,prior_receipt_id,lineage_reconciliation,occurred_at)
      select v_batch_id,i.occurrence_id,i.id,assessed_id,i.canonical_word_id,decision->>'candidateId',decision->>'performanceLineageKey',
        nullif(decision->>'eventId',''),decision->>'disposition',decision->>'reason',v_prior_id,
        case when v_prior_id is null then 'ORIGINAL' else 'EXACT_HISTORICAL_MATCH' end,source.occurred_at
      from public.writing_occurrence_interpretations i where i.id=interpreted_id
      returning id into v_receipt_id;
      for relation in select value from jsonb_array_elements(coalesce((select interpretation->'relationships' from public.writing_occurrence_interpretations where id=interpreted_id),'[]'::jsonb)) loop
        if relation->>'relationshipRole'='demonstrates' and relation->>'positiveEvidenceEligible'='true' then
          insert into public.writing_shadow_occurrence_skill_candidates(receipt_id,micro_skill_key,relationship_authority_fingerprint,relationship_role)
          values(v_receipt_id,relation->>'microSkillKey',relation->>'authorityFingerprint','demonstrates');
        end if;
      end loop;
    end loop;

    for projected in select value from jsonb_array_elements(coalesce(evidence->'projections','[]'::jsonb)) loop
      select e.id into v_receipt_id from public.writing_shadow_occurrence_evidence_receipts e
      where e.batch_id=v_batch_id and e.event_id=projected->>'eventId' and e.disposition='ADMITTED'
      order by e.id limit 1;
      if v_receipt_id is null then raise exception 'writing_skill_projection_unmatched'; end if;
      insert into public.writing_shadow_skill_evidence_projections(
        batch_id,receipt_id,projection_id,event_id,learner_id,canonical_word_id,micro_skill_key,polarity,occurred_at,environment,relationship_authority_fingerprint)
      values(v_batch_id,v_receipt_id,projected->>'projectionId',projected->>'eventId',(projected->>'learnerId')::uuid,
        (projected->>'canonicalWordId')::uuid,projected->>'microSkillKey',projected->>'polarity',(projected->>'occurredAt')::timestamptz,
        projected->>'environment',nullif(projected->>'relationshipAuthorityFingerprint',''));
    end loop;
  end if;
  return public.finish_writing_shadow_run(r.id,p_lease_token,p_result,null);
end $$;

alter table public.writing_shadow_projection_batches enable row level security;
alter table public.writing_shadow_occurrence_evidence_receipts enable row level security;
alter table public.writing_shadow_occurrence_skill_candidates enable row level security;
alter table public.writing_shadow_skill_evidence_projections enable row level security;

revoke all on public.writing_shadow_projection_batches,public.writing_shadow_occurrence_evidence_receipts,
  public.writing_shadow_occurrence_skill_candidates,public.writing_shadow_skill_evidence_projections,
  public.writing_shadow_current_projection_batches,public.writing_shadow_current_occurrence_evidence
  from public,anon,authenticated;
grant all on public.writing_shadow_projection_batches,public.writing_shadow_occurrence_evidence_receipts,
  public.writing_shadow_occurrence_skill_candidates,public.writing_shadow_skill_evidence_projections to service_role;
grant select on public.writing_shadow_current_projection_batches,public.writing_shadow_current_occurrence_evidence to service_role;
revoke all on function public.persist_writing_shadow_result(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.persist_writing_shadow_result(uuid,uuid,jsonb) to service_role;
