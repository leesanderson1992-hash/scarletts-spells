begin;

delete from public.word_families
where parent_user_id is null
  and slug in (
    'silent_e_words',
    'double_letters',
    'ck_pattern',
    'schwa_unstressed_vowel',
    'ie_ei_patterns',
    'tricky_common_words',
    'soft_c',
    'soft_g',
    'drop_final_e_ing',
    'drop_keep_final_e_suffixes',
    'change_y_to_i',
    'common_prefixes',
    'common_suffixes',
    'root_family_preservation',
    'tion_sion_suffixes',
    'double_consonant_suffix',
    'no_double_consonant',
    'final_le_patterns',
    'homophones_year_2',
    'homophones_year_3_4',
    'homophone_there_their_theyre',
    'homophone_to_too_two',
    'homophone_weather_whether',
    'homophone_whose_whos'
  );

insert into public.word_families (
  parent_user_id,
  slug,
  family_name,
  category,
  priority,
  description,
  teaching_note,
  examples
)
values
  (
    null,
    'silent_e_words',
    'Silent e words',
    'pattern_rule',
    1,
    'Words where a final e changes the vowel sound.',
    'Use these when the final e changes the vowel sound and must stay visible in memory.',
    array['make', 'take', 'home', 'hope', 'time', 'cute']
  ),
  (
    null,
    'double_letters',
    'Double letters',
    'pattern_rule',
    1,
    'Words that need a doubled consonant inside the word.',
    'Use these when the child misses or confuses a doubled consonant inside the word.',
    array['really', 'little', 'happy', 'rabbit', 'summer', 'dinner']
  ),
  (
    null,
    'ck_pattern',
    'ck pattern',
    'pattern_rule',
    2,
    'Short-vowel words that use ck after the vowel sound.',
    'Use these for short-vowel words that need ck after the vowel sound.',
    array['back', 'duck', 'kick', 'rock', 'stuck', 'pocket']
  ),
  (
    null,
    'schwa_unstressed_vowel',
    'Schwa unstressed vowel',
    'phonic',
    1,
    'Words where an unstressed vowel is hard to hear clearly.',
    'Use these when the unstressed vowel is hard to hear clearly and needs memory support.',
    array['about', 'animal', 'family', 'support', 'pencil', 'chicken']
  ),
  (
    null,
    'ie_ei_patterns',
    'ie / ei patterns',
    'pattern_rule',
    2,
    'Words where ie and ei patterns are easily confused.',
    'Use these when the child is unsure whether the pattern is ie or ei.',
    array['field', 'piece', 'belief', 'friend', 'ceiling', 'receipt']
  ),
  (
    null,
    'tricky_common_words',
    'Tricky common words',
    'irregular_tricky',
    1,
    'High-frequency memory words that do not follow a simple pattern.',
    'Use these for high-frequency words that are better taught as memory words.',
    array['because', 'people', 'friend', 'their', 'could', 'again']
  ),
  (
    null,
    'soft_c',
    'Soft c',
    'pattern_rule',
    3,
    'Words where c says s before e, i, or y.',
    'Use these when c says s before e, i, or y.',
    array['city', 'cent', 'circle', 'fancy', 'pencil', 'ice']
  ),
  (
    null,
    'soft_g',
    'Soft g',
    'pattern_rule',
    3,
    'Words where g says j before e, i, or y.',
    'Use these when g says j before e, i, or y.',
    array['giant', 'giraffe', 'page', 'magic', 'energy', 'ginger']
  ),
  (
    null,
    'drop_final_e_ing',
    'Drop final e before -ing',
    'morphology',
    2,
    'Words that drop a final e before adding ing.',
    'Use these when the child needs to remember to drop the final e before adding ing.',
    array['making', 'hiding', 'baking', 'riding', 'hoping', 'shining']
  ),
  (
    null,
    'drop_keep_final_e_suffixes',
    'Drop or keep final e before suffixes',
    'pattern_rule',
    2,
    'Words that need the child to decide whether the final e stays or drops before a suffix.',
    'Use these when the child is unsure whether the final e stays or drops before adding the ending.',
    array['making', 'hoped', 'hoping', 'useful', 'changeable', 'shining']
  ),
  (
    null,
    'change_y_to_i',
    'Change y to i',
    'morphology',
    2,
    'Words that change y to i before certain endings.',
    'Use these when the child needs to change y to i before certain endings.',
    array['tries', 'tried', 'happier', 'happiest', 'carried', 'families']
  ),
  (
    null,
    'common_prefixes',
    'Common prefixes',
    'morphology',
    2,
    'Words that keep a recognisable spelling when common prefixes are added.',
    'Use these when a prefix such as un-, re-, dis-, mis-, or pre- has been spelt weakly.',
    array['unhappy', 'rewrite', 'disagree', 'misbehave', 'preview', 'prepare']
  ),
  (
    null,
    'common_suffixes',
    'Common suffixes',
    'morphology',
    2,
    'Words built with common endings such as -ed, -ing, -ly, -ness, and -ment.',
    'Use these when the child knows the root but needs help with a common ending.',
    array['helped', 'helping', 'slowly', 'darkness', 'movement', 'careless']
  ),
  (
    null,
    'root_family_preservation',
    'Root family preservation',
    'morphology',
    2,
    'Words that keep the root spelling visible as they grow into related words.',
    'Use these when the child changes the root spelling too much and loses the word family pattern.',
    array['sign', 'signal', 'signature', 'heal', 'health', 'musician']
  ),
  (
    null,
    'tion_sion_suffixes',
    '-tion / -sion endings',
    'morphology',
    2,
    'Words that use common noun-building endings such as -tion and -sion.',
    'Use these when the child can hear the ending but is unsure whether it is written as -tion or -sion.',
    array['station', 'fiction', 'action', 'decision', 'division', 'expression']
  ),
  (
    null,
    'double_consonant_suffix',
    'Double consonant before suffix',
    'morphology',
    2,
    'Short-vowel words that double the consonant before adding a suffix.',
    'Use these when a short-vowel word doubles the final consonant before adding a suffix.',
    array['running', 'hopping', 'bigger', 'biggest', 'dropped', 'planned']
  ),
  (
    null,
    'no_double_consonant',
    'No double consonant',
    'morphology',
    3,
    'Words that keep a single consonant before the suffix.',
    'Use these when a word keeps a single consonant before the suffix.',
    array['visiting', 'opening', 'boating', 'painted', 'waiting', 'helping']
  ),
  (
    null,
    'final_le_patterns',
    'Final -le / -el / -al patterns',
    'pattern_rule',
    3,
    'Words where the final consonant + vowel ending pattern must be remembered carefully.',
    'Use these when the child knows most of the word but confuses the final -le, -el, or -al pattern.',
    array['circle', 'table', 'little', 'camel', 'metal', 'total']
  ),
  (
    null,
    'homophones_year_2',
    'Homophones Year 2',
    'homophone',
    1,
    'Common Year 2 homophones taught through sentence meaning.',
    'These words can sound the same, so choose the word that makes sense in the sentence.',
    array['there', 'their', 'they''re', 'to', 'too', 'two']
  ),
  (
    null,
    'homophones_year_3_4',
    'Homophones Year 3/4',
    'homophone',
    2,
    'Common Year 3 and 4 homophones taught through sentence meaning.',
    'These words sound alike, so use the sentence meaning to choose the right word.',
    array['weather', 'whether', 'whose', 'who''s']
  ),
  (
    null,
    'homophone_there_their_theyre',
    'there / their / they''re',
    'homophone',
    1,
    'A meaning-choice homophone set for there, their and they''re.',
    'Choose the word that means place, belonging, or they are.',
    array['there', 'their', 'they''re']
  ),
  (
    null,
    'homophone_to_too_two',
    'to / too / two',
    'homophone',
    1,
    'A meaning-choice homophone set for to, too and two.',
    'Choose the word that means going somewhere, also, or the number 2.',
    array['to', 'too', 'two']
  ),
  (
    null,
    'homophone_weather_whether',
    'weather / whether',
    'homophone',
    2,
    'A meaning-choice homophone set for weather and whether.',
    'Choose the word that means the sky and temperature, or the word that means if.',
    array['weather', 'whether']
  ),
  (
    null,
    'homophone_whose_whos',
    'whose / who''s',
    'homophone',
    2,
    'A meaning-choice homophone set for whose and who''s.',
    'Choose the word that asks who something belongs to, or the one that means who is.',
    array['whose', 'who''s']
  );

commit;
