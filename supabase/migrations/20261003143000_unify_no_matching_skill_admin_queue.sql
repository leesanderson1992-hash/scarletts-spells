begin;

-- Parent catalog cases require a child submission, while imported seed and
-- recommendation pairs do not. Keep their evidence in the original tables
-- and expose one admin queue for both kinds of no-skill work.
create view public.spelling_no_matching_skill_queue
with (security_invoker = true) as
select
  'resolution:' || item.id::text as queue_id,
  item.id as resolution_item_id,
  null::uuid as catalog_case_id,
  item.misspelling,
  item.correction,
  item.dialect_code,
  'resolver_intake'::text as source_type,
  'open'::text as case_status,
  item.updated_at,
  null::text as parent_note,
  coalesce((
    select jsonb_agg(jsonb_build_object('type', link.source_type, 'id', link.source_id)
      order by link.source_type, link.source_id)
    from public.spelling_resolution_item_sources link where link.item_id = item.id
  ), '[]'::jsonb) as source_evidence
from public.spelling_resolution_items item
join public.spelling_no_matching_skill_cases disposition
  on disposition.resolution_item_id = item.id and disposition.case_status = 'open'
where item.review_status = 'no_matching_skill'
union all
select
  'catalog:' || review_case.id::text,
  null::uuid,
  review_case.id,
  review_case.misspelling_normalized,
  review_case.correct_spelling_normalized,
  'en-GB'::text,
  'parent_catalog'::text,
  review_case.case_status,
  review_case.updated_at,
  review_case.parent_note,
  jsonb_build_array(jsonb_build_object('type', 'catalog', 'id', review_case.id))
from public.spelling_catalog_review_cases review_case
where review_case.case_status in ('open', 'needs_new_micro_skill', 'word_level_only')
  and not exists (
    select 1 from public.spelling_resolution_item_sources link
    join public.spelling_resolution_items item on item.id = link.item_id
    where link.source_type = 'catalog' and link.source_id = review_case.id
      and item.review_status = 'no_matching_skill'
  );

revoke all on public.spelling_no_matching_skill_queue from public, anon, authenticated;
grant select on public.spelling_no_matching_skill_queue to service_role;

commit;
