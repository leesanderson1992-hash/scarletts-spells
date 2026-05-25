begin;

insert into public.micro_skill_clusters (
  mastery_domain_key,
  skill_family_key,
  skill_cluster_key,
  display_name,
  is_assignable,
  metadata
)
values
  ('D4', 'D4_MOR', 'D4_MOR_BASE_WORDS', 'Base word awareness', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Identify and preserve base words in longer spellings', 'notes', 'Keep', 'seeded_non_assignable', true)),
  ('D4', 'D4_MOR', 'D4_MOR_PREFIXES', 'Prefixes', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Spell common prefixes such as un-, re-, pre-, dis-, mis-', 'notes', 'Keep', 'seeded_non_assignable', true)),
  ('D4', 'D4_MOR', 'D4_MOR_SUFFIXES', 'Suffixes', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Spell common suffixes as stable meaning units', 'notes', 'Keep', 'seeded_non_assignable', true)),
  ('D4', 'D4_MOR', 'D4_MOR_COMPOUND_WORDS', 'Compound words', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Spell compound words by preserving both base words', 'notes', 'Keep', 'seeded_non_assignable', true)),
  ('D4', 'D4_MOR', 'D4_MOR_WORD_FAMILIES', 'Word families', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Use related words to support spelling', 'notes', 'Keep', 'seeded_non_assignable', true)),
  ('D4', 'D4_MOR', 'D4_MOR_LATIN_ROOTS', 'Latin roots', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Use common Latin roots to support spelling and meaning', 'notes', 'Keep', 'seeded_non_assignable', true)),
  ('D4', 'D4_MOR', 'D4_MOR_GREEK_ROOTS', 'Greek roots', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Use common Greek roots to support spelling and meaning', 'notes', 'Keep', 'seeded_non_assignable', true)),
  ('D4', 'D4_MOR', 'D4_MOR_BASE_PRESERVATION', 'Base preservation', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Preserve base spelling when adding affixes', 'notes', 'Keep', 'seeded_non_assignable', true)),
  ('D4', 'D4_MOR', 'D4_MOR_PRONUNCIATION_SHIFT', 'Pronunciation shifts in word families', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Preserve spelling despite pronunciation changes', 'notes', 'Keep', 'seeded_non_assignable', true)),
  ('D4', 'D4_MOR', 'D4_MOR_BOUND_MORPHEMES', 'Bound morphemes', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Spell meaningful word parts that do not stand alone', 'notes', 'Keep', 'seeded_non_assignable', true)),
  ('D4', 'D4_MOR', 'D4_MOR_DERIVED_WORDS', 'Derived word spelling', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Spell new words formed from known base words', 'notes', 'Keep if derivational suffixes are not a separate family', 'seeded_non_assignable', true)),
  ('D4', 'D4_MOR', 'D4_MOR_MEANING_BASED_SPELLING', 'Meaning-based spelling', false, jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'purpose', 'Use meaning to choose or preserve spelling', 'notes', 'Keep as cross-cutting morphology cluster', 'seeded_non_assignable', true))
on conflict (skill_cluster_key) do update
set
  mastery_domain_key = excluded.mastery_domain_key,
  skill_family_key = excluded.skill_family_key,
  display_name = excluded.display_name,
  is_assignable = excluded.is_assignable,
  metadata = excluded.metadata,
  updated_at = timezone('utc', now());

update public.micro_skill_families
set
  metadata = metadata || jsonb_build_object(
    'seeded_cluster_ids',
    jsonb_build_array(
      'D4_MOR_BASE_WORDS',
      'D4_MOR_PREFIXES',
      'D4_MOR_SUFFIXES',
      'D4_MOR_COMPOUND_WORDS',
      'D4_MOR_WORD_FAMILIES',
      'D4_MOR_LATIN_ROOTS',
      'D4_MOR_GREEK_ROOTS',
      'D4_MOR_BASE_PRESERVATION',
      'D4_MOR_PRONUNCIATION_SHIFT',
      'D4_MOR_BOUND_MORPHEMES',
      'D4_MOR_DERIVED_WORDS',
      'D4_MOR_MEANING_BASED_SPELLING'
    ),
    'seeded_node_support',
    'machine_readable_seed_artifact_only_until_catalog_supports_non_assignable_nodes_without_fabricated_routes',
    'seeded_node_count',
    104,
    'developmental_foundation',
    'Morphological spelling control'
  ),
  updated_at = timezone('utc', now())
where skill_family_key = 'D4_MOR';

update public.micro_skill_clusters
set
  metadata = metadata || jsonb_build_object(
    'interleaving_group_ids',
    jsonb_build_array('D4_INT_CVC_SHORT_VOWELS', 'D4_INT_CVC_FULL_MAPPING')
  ),
  updated_at = timezone('utc', now())
where skill_cluster_key = 'D4_PG_CVC_SHORT_VOWELS';

update public.micro_skill_clusters
set
  metadata = metadata || jsonb_build_object(
    'interleaving_group_ids',
    jsonb_build_array('D4_INT_DIGRAPH_CORE', 'D4_INT_DIGRAPH_VS_BLEND')
  ),
  updated_at = timezone('utc', now())
where skill_cluster_key = 'D4_PG_CONSONANT_DIGRAPHS';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Sequential sound-to-spelling mapping',
  'teaching_point', 'In CVC words, each spoken sound should be represented in order, with one short vowel letter in the middle.',
  'example_words', jsonb_build_array('cat', 'map', 'sat', 'pan'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'cat', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'map', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'sat', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'pan', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_E', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member'),
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_I', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member'),
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_O', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member'),
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_U', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member'),
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_INITIAL_CONSONANT', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member'),
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_FINAL_CONSONANT', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member'),
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member'),
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_VOWEL_DISCRIMINATION', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member'),
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_CHECK_VOWEL', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member')
  ),
  'interleaving_group_ids', jsonb_build_array('D4_INT_CVC_SHORT_VOWELS', 'D4_INT_CVC_FULL_MAPPING')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CVC_SHORT_VOWELS_SHORT_A';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Sequential sound-to-spelling mapping',
  'teaching_point', 'In CVC words, each spoken sound should be represented in order, with one short vowel letter in the middle.',
  'example_words', jsonb_build_array('bed', 'pen', 'red', 'ten'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'bed', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'pen', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'red', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'ten', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_A', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_CVC_SHORT_VOWELS', 'D4_INT_CVC_FULL_MAPPING')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CVC_SHORT_VOWELS_SHORT_E';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Sequential sound-to-spelling mapping',
  'teaching_point', 'In CVC words, each spoken sound should be represented in order, with one short vowel letter in the middle.',
  'example_words', jsonb_build_array('sit', 'pin', 'dig', 'lip'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'sit', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'pin', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'dig', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'lip', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_A', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_CVC_SHORT_VOWELS', 'D4_INT_CVC_FULL_MAPPING')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CVC_SHORT_VOWELS_SHORT_I';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Sequential sound-to-spelling mapping',
  'teaching_point', 'In CVC words, each spoken sound should be represented in order, with one short vowel letter in the middle.',
  'example_words', jsonb_build_array('dog', 'hop', 'pot', 'log'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'dog', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'hop', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'pot', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'log', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_A', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_CVC_SHORT_VOWELS', 'D4_INT_CVC_FULL_MAPPING')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CVC_SHORT_VOWELS_SHORT_O';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Sequential sound-to-spelling mapping',
  'teaching_point', 'In CVC words, each spoken sound should be represented in order, with one short vowel letter in the middle.',
  'example_words', jsonb_build_array('sun', 'cup', 'mud', 'run'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'sun', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'cup', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'mud', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'run', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_A', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_CVC_SHORT_VOWELS', 'D4_INT_CVC_FULL_MAPPING')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CVC_SHORT_VOWELS_SHORT_U';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Sequential sound-to-spelling mapping',
  'teaching_point', 'In CVC words, each spoken sound should be represented in order, with one short vowel letter in the middle.',
  'example_words', jsonb_build_array('cat', 'dog', 'sun', 'pen'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'cat', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'dog', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'sun', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'pen', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_A', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_CVC_SHORT_VOWELS', 'D4_INT_CVC_FULL_MAPPING')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CVC_SHORT_VOWELS_INITIAL_CONSONANT';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Sequential sound-to-spelling mapping',
  'teaching_point', 'In CVC words, each spoken sound should be represented in order, with one short vowel letter in the middle.',
  'example_words', jsonb_build_array('map', 'bed', 'sit', 'dog'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'map', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'bed', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'sit', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'dog', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_A', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_CVC_SHORT_VOWELS', 'D4_INT_CVC_FULL_MAPPING')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CVC_SHORT_VOWELS_FINAL_CONSONANT';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Sequential sound-to-spelling mapping',
  'teaching_point', 'In CVC words, each spoken sound should be represented in order, with one short vowel letter in the middle.',
  'example_words', jsonb_build_array('cat', 'pen', 'sit', 'dog'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'cat', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'pen', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'sit', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'dog', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_A', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_CVC_SHORT_VOWELS', 'D4_INT_CVC_FULL_MAPPING')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Sequential sound-to-spelling mapping',
  'teaching_point', 'In CVC words, each spoken sound should be represented in order, with one short vowel letter in the middle.',
  'example_words', jsonb_build_array('cat/cot', 'pin/pen', 'bed/bad'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'cat', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'cot', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'pin', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'pen', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'bed', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'bad', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_A', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_CVC_SHORT_VOWELS', 'D4_INT_CVC_FULL_MAPPING')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CVC_SHORT_VOWELS_VOWEL_DISCRIMINATION';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Sequential sound-to-spelling mapping',
  'teaching_point', 'In CVC words, each spoken sound should be represented in order, with one short vowel letter in the middle.',
  'example_words', jsonb_build_array('cap/cup', 'pin/pan', 'hot/hut'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'cap', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'cup', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'pin', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'pan', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'hot', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'hut', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CVC_SHORT_VOWELS_SHORT_A', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_CVC_SHORT_VOWELS', 'D4_INT_CVC_FULL_MAPPING')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CVC_SHORT_VOWELS_CHECK_VOWEL';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Grapheme awareness',
  'teaching_point', 'A consonant digraph uses two letters to represent one consonant sound; the child should treat the grapheme as one sound-spelling unit.',
  'example_words', jsonb_build_array('ship', 'shop', 'fish', 'wish'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'ship', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'shop', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'fish', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'wish', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CONSONANT_DIGRAPHS_CH_INITIAL_FINAL', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member'),
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CONSONANT_DIGRAPHS_TH_UNVOICED', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member'),
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CONSONANT_DIGRAPHS_TH_VOICED', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member'),
    jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CONSONANT_DIGRAPHS_WH_INITIAL', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_member')
  ),
  'interleaving_group_ids', jsonb_build_array('D4_INT_DIGRAPH_CORE', 'D4_INT_DIGRAPH_VS_BLEND')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Grapheme awareness',
  'teaching_point', 'A consonant digraph uses two letters to represent one consonant sound; the child should treat the grapheme as one sound-spelling unit.',
  'example_words', jsonb_build_array('chip', 'chat', 'rich', 'much'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'chip', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'chat', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'rich', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'much', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_DIGRAPH_CORE', 'D4_INT_DIGRAPH_VS_BLEND')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CONSONANT_DIGRAPHS_CH_INITIAL_FINAL';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Grapheme awareness',
  'teaching_point', 'A consonant digraph uses two letters to represent one consonant sound; the child should treat the grapheme as one sound-spelling unit.',
  'example_words', jsonb_build_array('thin', 'thick', 'bath', 'path'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'thin', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'thick', 'difficulty', 'medium', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'bath', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'path', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_DIGRAPH_CORE', 'D4_INT_DIGRAPH_VS_BLEND')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CONSONANT_DIGRAPHS_TH_UNVOICED';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Grapheme awareness',
  'teaching_point', 'A consonant digraph uses two letters to represent one consonant sound; the child should treat the grapheme as one sound-spelling unit.',
  'example_words', jsonb_build_array('this', 'that', 'then', 'they'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'this', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'that', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'then', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'they', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_DIGRAPH_CORE', 'D4_INT_DIGRAPH_VS_BLEND')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CONSONANT_DIGRAPHS_TH_VOICED';

update public.micro_skill_catalog
set metadata = metadata || jsonb_build_object(
  'developmental_foundation', 'Grapheme awareness',
  'teaching_point', 'A consonant digraph uses two letters to represent one consonant sound; the child should treat the grapheme as one sound-spelling unit.',
  'example_words', jsonb_build_array('when', 'what', 'where', 'whip'),
  'starter_word_bank', jsonb_build_array(
    jsonb_build_object('word', 'when', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'what', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'where', 'difficulty', 'medium', 'common_wrong_spellings', jsonb_build_array()),
    jsonb_build_object('word', 'whip', 'difficulty', 'easy', 'common_wrong_spellings', jsonb_build_array())
  ),
  'related_nodes', jsonb_build_array(jsonb_build_object('relationship_type', 'related', 'related_node_id', 'D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL', 'relationship_strength', 'seed', 'relationship_reason', 'same_cluster_base_skill')),
  'interleaving_group_ids', jsonb_build_array('D4_INT_DIGRAPH_CORE', 'D4_INT_DIGRAPH_VS_BLEND')
), updated_at = timezone('utc', now())
where micro_skill_key = 'D4_PG_CONSONANT_DIGRAPHS_WH_INITIAL';

commit;
