begin;
-- Generated from data/adle/homophone/convergence-v1/manifest.json.
-- Draft catalog only: no route or new assignment is enabled by this migration.
insert into public.micro_skill_clusters
  (mastery_domain_key, skill_family_key, skill_cluster_key, display_name, is_assignable, is_active, metadata)
select 'D4', 'D4_HOM', v.cluster_key, v.display_name, false, false,
  '{"convergenceStatus":"draft_requires_editorial_review"}'::jsonb
from (values
  ('D4_HOM_CONFUSABLE_WORDS', 'Confusable words'),
  ('D4_HOM_CONTRACTION_REAL_WORD_CONFUSABLES', 'Contraction and real-word confusables')
) as v(cluster_key, display_name)
where not exists (select 1 from public.micro_skill_clusters c where c.skill_cluster_key = v.cluster_key);

insert into public.micro_skill_catalog
  (mastery_domain_key, skill_family_key, skill_cluster_key, micro_skill_key,
   display_name, practice_route, is_assignable, is_active, metadata)
select 'D4', 'D4_HOM', v.cluster_key, v.micro_skill_key, v.display_name,
  'word_practice', false, false,
  '{"convergenceStatus":"draft_requires_editorial_review"}'::jsonb
from (values
  ('D4_HOM_CONFUSABLE_WORDS_ACCEPT_EXCEPT', 'D4_HOM_CONFUSABLE_WORDS', 'Choose accept or except by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_AFFECT_EFFECT', 'D4_HOM_CONFUSABLE_WORDS', 'Choose affect or effect by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_BREATH_BREATHE', 'D4_HOM_CONFUSABLE_WORDS', 'Choose breath or breathe by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_LOOSE_LOSE', 'D4_HOM_CONFUSABLE_WORDS', 'Choose loose or lose by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_DESERT_DESSERT', 'D4_HOM_CONFUSABLE_WORDS', 'Choose desert or dessert by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_OF_OFF', 'D4_HOM_CONFUSABLE_WORDS', 'Choose of or off by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_QUITE_QUIET', 'D4_HOM_CONFUSABLE_WORDS', 'Choose quite or quiet by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_BERRY_BURY', 'D4_HOM_CONFUSABLE_WORDS', 'Choose berry or bury by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_COMPLIMENT_COMPLEMENT', 'D4_HOM_CONFUSABLE_WORDS', 'Choose compliment or complement by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_FARTHER_FATHER', 'D4_HOM_CONFUSABLE_WORDS', 'Choose farther or father by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_LED_LEAD', 'D4_HOM_CONFUSABLE_WORDS', 'Choose led or lead by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_PRECEDE_PROCEED', 'D4_HOM_CONFUSABLE_WORDS', 'Choose precede or proceed by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_DESCENT_DISSENT', 'D4_HOM_CONFUSABLE_WORDS', 'Choose descent or dissent by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_DRAFT_DRAUGHT', 'D4_HOM_CONFUSABLE_WORDS', 'Choose draft or draught by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_PRINCIPAL_PRINCIPLE', 'D4_HOM_CONFUSABLE_WORDS', 'Choose principal or principle by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_WARY_WEARY', 'D4_HOM_CONFUSABLE_WORDS', 'Choose wary or weary by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_CONSCIENCE_CONSCIOUS', 'D4_HOM_CONFUSABLE_WORDS', 'Choose conscience or conscious by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_ESPECIALLY_SPECIALLY', 'D4_HOM_CONFUSABLE_WORDS', 'Choose especially or specially by meaning and context'),
  ('D4_HOM_CONFUSABLE_WORDS_SE_SY_CE_CY', 'D4_HOM_CONFUSABLE_WORDS', 'Learn to distinguish related nouns and verbs with different endings. In these British English word pairs, nouns use -ce or -cy, while verbs use -se or -sy. Teach using [advice, advise], [device, devise], [practice, practise], [licence, license], [prophecy, prophesy]. The child learns to identify whether the sentence requires a noun or verb and select the correct spelling. This is a pattern found in these word pairs, not a universal spelling rule.'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_BRAKE_BREAK', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose brake or break by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_ALLOWED_ALOUD', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose allowed or aloud by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_SENT_CENT_SCENT', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose sent, cent or scent by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_WHETHER_WEATHER', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose whether or weather by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_STATIONARY_STATIONERY', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose stationary or stationery by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_HERE_HEAR', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose here or hear by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_BARE_BEAR', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose bare or bear by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_ONE_WON', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose one or won by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_SUN_SON', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose sun or son by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_BE_BEE', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose be or bee by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_BLUE_BLEW', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose blue or blew by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_NIGHT_KNIGHT', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose night or knight by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_BALL_BAWL', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose ball or bawl by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_FAIR_FARE', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose fair or fare by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_GRATE_GREAT', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose grate or great by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_GROAN_GROWN', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose groan or grown by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_HEEL_HEAL_HE_LL', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose heel, he''ll or heal by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_KNOT_NOT', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose knot or not by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_MAIL_MALE', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose mail or male by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_MAIN_MANE', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose main or mane by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_MEAT_MEET', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose meat or meet by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_MEDAL_MEDDLE', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose medal or meddle by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_PLAIN_PLANE', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose plain or plane by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_RAIN_REIN_REIGN', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose rain, rein or reign by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_SCENE_SEEN', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose scene or seen by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_AISLE_ISLE', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose aisle or isle by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_ALTAR_ALTER', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose altar or alter by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_ASCENT_ASSENT', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose ascent or assent by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_BRIDAL_BRIDLE', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose bridal or bridle by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_CEREAL_SERIAL', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose cereal or serial by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_MORNING_MOURNING', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose morning or mourning by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_STEAL_STEEL', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose steal or steel by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_PROFIT_PROPHET', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Choose profit or prophet by meaning and context'),
  ('D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T', 'D4_HOM_CONTENT_WORD_HOMOPHONES', 'Confusing ed for T lesson is taught with multiple pairs. [Missed, Mist], [Guessed, Guest], [past, passed], [least, leased], [packed, pact]'),
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR', 'D4_HOM_FUNCTION_WORD_HOMOPHONES', 'Choose for or four by meaning and context'),
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_BY_BYE_BUY', 'D4_HOM_FUNCTION_WORD_HOMOPHONES', 'Choose by, bye or buy by meaning and context'),
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_OUR_HOUR', 'D4_HOM_FUNCTION_WORD_HOMOPHONES', 'Choose our or hour by meaning and context'),
  ('D4_HOM_FUNCTION_WORD_HOMOPHONES_WHO_S_WHOSE', 'D4_HOM_FUNCTION_WORD_HOMOPHONES', 'Choose who''s or whose by meaning and context'),
  ('D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS', 'D4_HOM_CONTRACTION_REAL_WORD_CONFUSABLES', 'Choose the contraction when omitting its apostrophe would make a different valid English word')
) as v(micro_skill_key, cluster_key, display_name)
where not exists (select 1 from public.micro_skill_catalog c where c.micro_skill_key = v.micro_skill_key);
commit;
