begin;
-- Draft redirects are audit data only. They cannot route intake until reviewed
-- and activated after destination lessons are live. Evidence migration is separate.
insert into public.homophone_skill_redirects
  (source_skill_key,destination_skill_key,redirect_status,decision_reference)
select v.source_skill_key,v.destination_skill_key,'draft',
  'Owner phased homophone convergence plan, 2026-10-23'
from (values
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_COMMON_VERB_NOUN_PAIRS', 'D4_HOM_CONTENT_WORD_HOMOPHONES_ALLOWED_ALOUD'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_COMMON_VERB_NOUN_PAIRS', 'D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T'),
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR_OF_OFF', 'D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR'),
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR_OF_OFF', 'D4_HOM_CONFUSABLE_WORDS_OF_OFF'),
  ('D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS', 'D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS'),
  ('D4_HOM_CONTRACTION_POSSESSIVE_WERE_WERE', 'D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS'),
  ('D4_HOM_CONTRACTION_POSSESSIVE_WHOS_WHOSE', 'D4_HOM_FUNCTION_WORD_HOMOPHONES_WHO_S_WHOSE'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_PIECE_PEACE', 'D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE')
) as v(source_skill_key,destination_skill_key)
on conflict (source_skill_key,destination_skill_key) do nothing;
commit;
