-- Keep the recommendation live while letting Postgres use separate anti-joins.
-- The former OR join compared every candidate with nearly every dictionary row.
create or replace view public.admin_recommend_dictionary_entries
with (security_invoker = true) as
with verified_words as (
  select credit.word_key,
    count(*)::integer as verified_uses,
    count(distinct credit.child_id)::integer as children_count,
    count(*) filter (where credit.adle_review_id is not null)::integer as adle_uses,
    count(*) filter (where credit.review_id is not null)::integer as other_writing_uses,
    min(credit.occurred_at) as first_seen_at,
    max(credit.occurred_at) as last_seen_at
  from public.authentic_use_credits credit
  where credit.canonical_word_id is null
  group by credit.word_key
)
select verified_words.* from verified_words
where not exists (
  select 1 from public.canonical_teaching_dictionary_words dictionary_word
  where dictionary_word.dialect_code = 'en-GB'
    and dictionary_word.normalised_word = verified_words.word_key
)
and not exists (
  select 1 from public.canonical_teaching_dictionary_words dictionary_word
  where dictionary_word.dialect_code = 'en-GB'
    and lower(replace(replace(normalize(coalesce(nullif(dictionary_word.display_word, ''), dictionary_word.normalised_word), NFC), '’', ''''), 'ʼ', '''')) = verified_words.word_key
);

revoke all on public.admin_recommend_dictionary_entries from public, anon, authenticated;
grant select on public.admin_recommend_dictionary_entries to service_role;

-- Aggregate the complete queues in SQL. The old dashboard read only the
-- newest 250 rows of each queue, making larger queue totals incorrect.
create view public.admin_spelling_queue_summary
with (security_invoker = true) as
select 'catalog_review'::text as source, case_status::text as status,
  count(*)::bigint as row_count, max(updated_at) as latest_updated_at
from public.spelling_catalog_review_cases group by case_status
union all
select 'no_matching_skill', case_status::text,
  count(*)::bigint, max(updated_at)
from public.spelling_no_matching_skill_queue group by case_status
union all
select 'canonical_recommendation', recommendation_status::text,
  count(*)::bigint, max(updated_at)
from public.spelling_canonical_mapping_recommendations group by recommendation_status
union all
select 'seed_import', row_status::text,
  count(*)::bigint, max(updated_at)
from public.spelling_seed_import_rows group by row_status;

revoke all on public.admin_spelling_queue_summary from public, anon, authenticated;
grant select on public.admin_spelling_queue_summary to service_role;
