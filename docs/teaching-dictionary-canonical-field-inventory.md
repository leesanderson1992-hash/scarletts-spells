# Teaching dictionary canonical field inventory

| Fact | Authoritative source | Editor | Validation | Output |
| --- | --- | --- | --- | --- |
| Word spelling, display, dialect and bands | Active canonical word row | Overview text and reviewed band selectors | Normalised spelling, required display, approved age/frequency/complexity values | Dictionary lookup, lesson eligibility |
| Shared definition | Latest approved non-route definition | Overview text | Nonempty before publication | Dictionary and shared lesson meaning |
| Dictation sentence and target | Approved dictation version | Overview sentence and target selector | Exact target occurrence | Dictation activities |
| Pronunciation, syllables and word metadata | Active word metadata and reviewed written facts | Overview controls | Route readiness and written spelling checks | Audio, phonology and route adapters |
| Source and confidence | Word, metadata and morphology provenance | Overview source controls | Source category and licence rules | Review audit and publication gate |
| Word parts, joins, transformations and word sum | Approved active canonical word morphology | Visual word-parts editor | Typed parts, exact surface reconstruction, generated word sum and reviewed status | Family membership and route morphology projection |
| Base or root family and chosen meaning | Latest approved lexical family revision; historical registry aliases for compatibility | Searchable family selector | Exact base/root evidence in approved morphology | Dictionary family display and lesson family inputs |
| Affix meanings | Approved dictionary affix meanings, with lesson profiles as compatibility fallback | Word-parts meaning selector | One reviewed choice per affix use | Morphology gloss; route profiles retain lesson-specific meaning bins |
| Micro skills | Reviewed word-skill pairs and releases | Micro-skills selector | Active assignable skill and review release | Lesson eligibility |
| Lesson-only choices | Reviewed route content version | Route controls | Route-specific preflight | Compiled lesson JSON |

## Field-level contract

| Field | Approved storage and input | Check and downstream mapping |
| --- | --- | --- |
| `normalised_word`, `display_word`, `dialect_code` | Active canonical word; Overview spelling and display text, en-GB dialect | Normalised lookup key and exact printed spelling for dictionary, morphology, dictation, and lesson word identity |
| `age_band`, `frequency_band`, `complexity_band` | Active canonical word; reviewed Overview dropdowns | Must be one of the published band choices; used for readiness and selection |
| `definition` | Latest approved definition version without a route ID; Overview text | Required nonempty shared meaning; projected into route `wordMeaning` and dictionary display |
| `dictation_sentence`, `dictation_target_token_index` | Active reviewed dictation row; Overview sentence and target selector | Target tokens must spell the canonical word; projected into dictation activities |
| Dictation variants and audio text | Reviewed Overview dictation controls | Unique IDs, valid target occurrence and primary sentence agreement; route dictation adapters consume these |
| `syllables`, `phoneme_hint`, `stress_pattern`, `has_schwa` | Active reviewed metadata row; Overview text or yes/no control | Required pronunciation and spoken syllable facts feed phonology and audio routes |
| `written_syllable_breakdown` | Reviewed Overview control | Its letters must reproduce the word; used by routes requiring written syllable cuts; historical omissions are queued separately |
| `grapheme_notes`, `morphemes`, `morphology_notes`, `irregularity_notes` | Active reviewed metadata row; Overview text, with morphemes and morphology notes derived from approved parts | Reused by dictionary display and route adapters; derived values must follow the reviewed structure |
| `source_category`, `source_name`, `source_url`, `source_licence`, `source_use_note`, `confidence` | Approved word, metadata and morphology provenance; Overview source controls | Reference-only material cannot publish; licensed sources require a licence; review and output lineage use the stored source |
| `raw_morpholex_segmentation`, `raw_morpholex_pos` | Active reviewed morphology; Overview raw evidence and part-of-speech selector | Preserve imported evidence and use the reviewed part of speech for family and route eligibility |
| `morphology_parts` | Active approved morphology; visual Overview part editor | Each part has `id`, `kind`, `sourceText`, `surfaceText`, `gloss`, and generated `displayRange`; no legacy alias fields on new approval |
| `morphology_joins` | Active approved morphology; visual join dropdowns | Exactly one ordered join between adjacent parts; together with visible parts must reproduce `display_word` |
| `morphology_transformations`, `transformation_notes` | Active approved morphology; visual transformation controls and explanatory text | Ordered part-specific source-to-surface steps must terminate at the printed part; lesson adapters receive the reviewed steps |
| `word_sum` | Derived from approved source parts and `display_word`; read-only Overview display | Must equal the generated sum before approval; projected into lesson content |
| Morphology review and provenance | Active approved morphology version; Overview review action | New approvals require canonical parts; historical versions remain readable without rewriting evidence |
| Family key, base or root lemma, family meaning and membership | Latest approved lexical family revision; searchable Overview selector or free-base creation controls | Exact approved base/root evidence is required; family display and route base facts read the latest approved revision plus historical registry links |
| Bound-root pronunciation applicability | Root entry metadata on the approved family revision | Dedicated root review | Reviewed IPA or explicit `not_applicable`; a bound root has no standalone dictation sentence | Dictionary family display |
| Reviewed bound-root import facts | `root_family_key`, `root_definition`, `root_origin_language`, `root_pronunciation_applicability`, optional `root_pronunciation_ipa` in the CSV draft | Reviewed import columns | One root part, approved existing family, exact reviewed root gloss; IPA required only for `reviewed` | Atomic Overview, root-entry revision and skill release |
| Reviewed free-base import facts | Optional `base_family_key` and `base_part_of_speech` in the CSV draft | Searchable family selector or part-of-speech dropdown; reviewed CSV columns | Exactly one base part; existing family must match its reviewed meaning; a new family requires an approved base word and explicit base part of speech | Atomic Overview, family revision and skill release |
| Affix meaning for this word | Approved part `gloss` chosen from `canonical_teaching_dictionary_affix_meanings` in Overview; older profile choices remain readable until catalogued | Multiple reviewed meanings appear in a dropdown; stale selections are marked for review; route meaning uses the approved part |
| Micro-skill keys | Reviewed word-skill pair and released skill authority; Micro-skills control | Active assignable choice; drives lesson eligibility and Lesson checks |
| Route-specific facts and pedagogy | Reviewed route content version; route text, select and visual controls with accessible format help | Route preflight checks the named facts; adapters combine them with shared Overview facts to produce lesson JSON |

The active word, metadata, dictation, morphology and definition records are the
approved fact sources. A manager draft is an editing snapshot, not a competing
authority. Route wrappers retain older shared copies for compatibility, but
projection replaces them with approved Overview values when compiling new
content. Ambiguous old morphology and conflicting route copies enter the
format-review queue instead of receiving inferred values.

Shared definition, word sum and true morphology are projected from Overview. Historical route copies are compatibility input only; conflicts require review rather than silent approval. Existing legacy morphology is readable but cannot be newly approved until the visual editor saves the canonical shape.

Family search matches the reviewed base or root lemma. It ignores the common
`_base_family` key suffix, shows only approved revisions, and ranks exact and
prefix matches before other matches. Historical family links remain readable.

An approved bound-root family revision must have a reviewed root entry with the
same root text and meaning as the family. The root entry records its definition,
origin, pronunciation applicability and provenance. It is a dictionary family
anchor, distinguished from a standalone spoken word so it is not selected for
dictation. Historical approved revisions without an entry remain visible for
review; they are not silently assigned a pronunciation or meaning.
