-- Parent-verified words awaiting a canonical Teaching Dictionary entry.
-- Keep this aggregate private: only the admin server uses the service role.
create view public.admin_recommend_dictionary_entries
with (security_invoker = true) as
with verified_words as (
  select
    credit.word_key,
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
select verified_words.*
from verified_words
where not exists (
  select 1
  from public.canonical_teaching_dictionary_words dictionary_word
  where dictionary_word.dialect_code = 'en-GB'
    and (
      dictionary_word.normalised_word = verified_words.word_key
      or lower(replace(replace(normalize(coalesce(nullif(dictionary_word.display_word, ''), dictionary_word.normalised_word), NFC), '’', ''''), 'ʼ', '''')) = verified_words.word_key
    )
);

revoke all on public.admin_recommend_dictionary_entries from public, anon, authenticated;
grant select on public.admin_recommend_dictionary_entries to service_role;
