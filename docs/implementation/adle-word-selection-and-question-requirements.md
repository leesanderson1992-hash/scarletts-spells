# ADLE word selection and question requirements

**Purpose.** Use this reference when deciding whether a dictionary word can support a micro-skill lesson, and when identifying the facts needed to compile each question. A word can be approved as spelling evidence without being ready for a particular lesson. A registered lesson route can also remain unavailable until its reviewed content, profile, environment, group, and learner checks pass.

**Scope and date.** This describes the repository contracts on 9 October 2026. The active, assignable Production catalogue contained 243 micro skills when checked. The specialist route registry explicitly names 29 of them. The others have no specialist route in that registry; a generic lesson may be available only when its independent policy and learner checks pass. Registration is an implementation inventory, not proof of Production activation. Current activation must be read from the live [ADLE Requirements page](https://scarletts-spells.vercel.app/admin/adle-canonical-intake-readiness) or the route resolver.

## The three levels of requirements

| Level | Question answered | Authority |
|---|---|---|
| Word and skill | Is this canonical word reviewed and approved for this exact micro skill as evidence? | Dictionary review, effective word–skill association, and authentic spelling lineage. Descriptive morpheme text is not approval. |
| Word and route | Does reviewed content supply every fact needed by this route's activities and exact variant? | Route member or approved content version, route validator, compiler, and activity fact registry. An existing released member can satisfy this even when a new manager draft is incomplete. |
| Lesson and learner | Can these words form a valid lesson for this child now? | Profile and route release, required word counts and coverage, child learning items, environment gate, assignment compiler, and snapshot validator. |

The Teaching Dictionary Manager's [`routeBlockers`](../../lib/teaching-dictionary-manager/contracts.ts) checks fields in a **new manager content draft**. It is not the full runtime specification. In particular, it must not be interpreted as withdrawing an existing released member. The runtime also checks exact word structure, profile compatibility, group composition, and immutable assignment bindings.

## Shared word facts to collect

For a word being considered for any lesson, record its canonical identity and display spelling, child-suitable meaning, source and review state, pronunciation or audio support, age/frequency/complexity bands, and a contextual dictation sentence with the exact target position. The selected route may also need syllables, stress, schwa, morphemes, word sum, semantic base or root, decomposition, joins, transformations, and a meaning group. **Only collect and review a fact when its intended route or question uses it; do not manufacture a morphological analysis to satisfy a form.**

Evidence approval is a separate exact word–micro-skill decision. A verified independent use may count for more than one approved skill, but the word-level authentic-use event is counted once. Lesson selection additionally requires the child's eligible learning item and the route's reviewed word pool; dictionary presence alone does not create a lesson.

### A practical check for one candidate word

1. Choose the exact micro skill; use the map below to identify its specialist route, if any.
2. Check whether the word is approved for evidence for that skill. This does not certify a lesson.
3. Check the selected route's word facts and its question variants. Reuse an already released member when valid; do not create an empty replacement draft just to edit a shared definition.
4. Check whether the chosen lesson set has enough reviewed authentic and transfer words, forms, meanings and distinct sentences.
5. Finally check profile release, environment and child eligibility. Only then call the word *usable in that learner's lesson*.

## Specialist lesson families and selected-word checklists

The route IDs and activity sequences below come from the [route registry](../../lib/adle/curriculum-readiness/route-registry.ts). The word fields combine the manager validator with the route's runtime contracts; the **runtime validator and released member remain authoritative**.

| Route | Selected word must provide | Lesson-level requirements | Questions / activities |
|---|---|---|---|
| **Base Word Lab v2** | Reviewed family key and membership; base word and its meaning; whole-word meaning; word sum; ordered morphology parts and joins; any transformation; dictation sentence, target and audio; provenance. | Six independent words: two distinct authentic targets of the same skill, four safe family transfers, at most two families; released family content and route activation. | Introduction, family reveal, Cleaver (find the base), word build, cover/check, dictation, reflection. The base/affix boundaries must reconstruct the word. |
| **Dynamic Prefix v2** | Reviewed prefix form declared by profile; base word and base meaning; derived meaning; teaching build text; meaning-group ID; child-facing split parts and joins; word sum; exact dictation; pronunciation and banding; reviewed prefix-choice audit; provenance. | Four words, authentic targets first and approved same-profile transfers; form and meaning-group coverage; enabled profile and environment. | Introduction and prefix cards, discovery, Cleaver, meaning sort or form choice as profile declares, prefix build, cover/check, dictation, reflection. |
| **Dynamic Suffix v3** | Reviewed suffix form; semantic base/root and its `base`/`root` classification; teaching base text; base and derived meanings; meaning-group ID; teaching split parts/joins; true morphology parts/joins, transformation and provenance; word sum; exact dictation; pronunciation and banding. | Four words, authentic targets first and approved same-profile transfers; suffix-form and meaning-group coverage; enabled profile and environment. | Introduction, discovery, two Cleavers, word build, cover/check, dictation, reflection. Meaning sort is conditional on a profile with multiple meaning groups. |
| **Compound Word Lab v2** | Reviewed whole and component canonical IDs; ordered component spellings and meanings; join kinds (joined, space, or hyphen); whole meaning and component-to-whole explanation; exact dictation target span and audio; source and review provenance; assignment and transfer eligibility. | Four words, an eligible reviewed structure for each, released route and valid group composition. | Introduction, compound jigsaw, meaning match, cover/check, dictation, reflection. The components and joins must reconstruct the whole spelling. |
| **-ing Endings v1** | Governed base verb, derived `-ing` word, rule-specific transformation, meaning, dictation sentence containing the derived word exactly once, audio text, source refs and review/approval refs. Doubling needs a reviewed `short_cvc` or `stressed_final_syllable` pattern. | Exactly six distinct approved words, at least one queued eligible target, route activation. | Introduction, meaning match, word build, Cleaver, cover/check, dictation, reflection. Rule variants are regular, drop final `e`, double final consonant, and `ie` to `y`. |
| **Comparative/Superlative v1** | A governed adjective family with base, `-er`, and `-est` canonical words; meaning; two exact transformations and explanations; verified adjective/gradable/child-suitable status; sentence gaps; paired dictation; one `why` and one `when` question with options, answer and explanation; provenance and review. Doubling needs syllable and short-vowel verification. | Two distinct approved families, six words total, two to four eligible authentic targets spanning both families, route activation. | Introduction, sentence/word build, meaning sort, Cleaver plus rule question, cover/check, paired dictation, reflection. The current task sequence rotates question and target order from the assignment key. |
| **Generic composer v1** | Approved canonical word and skill support; display word, age/banding and a usable sentence/target for dictation; reviewed teaching content appropriate to the skill. | One to eight words under generic policy, authentic-item and learner checks. It is a fallback, not an automatic specialist release. | Introduction, guided prompt, cover/check and dictation; review/probe activities have their own contracts when used. |

The manager currently exposes draft-field checks for base, prefix, suffix, compound, `-ing`, and comparative route content. Those checks are a starting checklist, not a substitute for the runtime validators: [`ingWordBlockers`](../../lib/adle/ing/contracts.ts), [`adjectiveFamilyBlockers`](../../lib/adle/inflection/contracts.ts), [compound structure validation](../../lib/adle/morphology/compound-word-structure-v2.ts), and the reviewed prefix/suffix profile loaders and compilers.

## Which micro skill uses which specialist route?

| Route | Exact micro-skill keys and variant |
|---|---|
| Base Word Lab v2 | `D4_MOR_BASE_WORDS_IDENTIFY_BASE` (identify the base); `D4_MOR_BASE_WORDS_PRESERVE_BASE` (preserve its spelling); `D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX` (base before a prefix); `D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX` (base before a suffix). The latter two are registered but have historically been transfer capabilities rather than independent first-impression lessons; check the live activation. |
| Dynamic Prefix v2 | `D4_MOR_PREFIXES_UN` (`un`); `D4_MOR_PREFIXES_DIS_MIS` (`dis`, `mis`); `D4_MOR_PREFIXES_IN_IM_IL_IR` (`in`, `im`, `il`, `ir`); `D4_MOR_PREFIXES_RE_PRE` (`re`, `pre`); `D4_MOR_PREFIXES_SUB_INTER_SUPER` (`sub`, `inter`, `super`). |
| Dynamic Suffix v3 | `D4_MOR_SUFFIXES_NESS`, `D4_MOR_SUFFIXES_ABLE_IBLE`, `D4_MOR_SUFFIXES_MENT`, `D4_MOR_SUFFIXES_FUL_LESS`, `D4_MOR_SUFFIXES_AL`, `D4_MOR_SUFFIXES_ITY`, `D4_MOR_SUFFIXES_LY`, `D4_MOR_SUFFIXES_OUS`, `D4_MOR_SUFFIXES_TION`, `D4_MOR_SUFFIXES_SION`. Their declared forms and question-selection policies are in the [generated route reference](../generated/adle-composable-lesson/route-and-activity-reference.md#shared-affix-compiler). |
| Compound Word Lab v2 | `D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS`; `D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED`. |
| -ing Endings v1 | `D4_INF_ING_ENDINGS_REGULAR`; `D4_INF_ING_ENDINGS_DROP_E`; `D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT`; `D4_INF_ING_ENDINGS_IE_TO_Y`. |
| Comparative/Superlative v1 | `D4_INF_COMPARATIVE_SUPERLATIVE_REGULAR`; `D4_INF_COMPARATIVE_SUPERLATIVE_DROP_E`; `D4_INF_COMPARATIVE_SUPERLATIVE_Y_TO_I`; `D4_INF_COMPARATIVE_SUPERLATIVE_DOUBLE_FINAL_CONSONANT`. |

The four active root micro skills (`D4_MOR_ROOTS_COMMON_GREEK_ROOTS`, `D4_MOR_ROOTS_COMMON_LATIN_ROOTS`, `D4_MOR_ROOTS_ROOT_FAMILY_SPELLING`, `D4_MOR_ROOTS_SCIENCE_MATH_ROOTS`) have no specialist route in this registry. An evidence approval for one of them does **not** mean a root-specific ADLE lesson exists. Other catalogue skills outside the 29 named above likewise need generic policy or a future specialist specification.

### How the specialist variants change questions

| Micro-skill variants | Question change that affects word selection |
|---|---|
| Base: identify base; preserve base; base plus prefix; base plus suffix | The selected base and word sum must support the **named** task. Base plus prefix/suffix should not be treated as a standalone first-impression lesson merely because it is registered. |
| Prefix `un`; `dis/mis`; `re/pre`; `sub/inter/super` | Cleaver identifies a prefix at the start. Mixed profiles need the selected words' declared forms; build uses reviewed prefix choices, and meaning sort uses the profile's declared groups. `sub/inter/super` also seeks distinct forms across the set. |
| Prefix `in/im/il/ir` | In addition to four distinct declared forms, this profile includes a genuine form-choice task. Each selected word needs the word-specific valid-choice audit, not a spelling-only guess. |
| Suffix `ness`, `ment`, `al`, `ity`, `ly`, `ous`, `tion`, `sion` | One-form profiles select contrasting direct/changed Cleavers and build all four words. The teaching split and any spelling transformation must be reviewed for each chosen word. |
| Suffix `able/ible`; `ful/less` | Both forms must be represented. Cleaver and build examples are selected by form; `ful/less` also runs a four-word meaning sort and form-specific builds. |
| Compound: closed; separated/hyphenated | The join kind and exact surface reconstruction change; a spaced or hyphenated target needs an authored target span that matches the dictation sentence. |
| `-ing`: regular; drop `e`; double final consonant; `ie`→`y` | The rule determines the stem transformation. Doubling has two subvariants, short CVC and stressed final syllable, that require different reviewed facts. |
| Comparative: regular; drop `e`; `y`→`i`; double final consonant | Both `-er` and `-est` forms must be valid, with two explanations, sentence gaps, paired dictation and rule questions. Doubling needs verified vowel and syllable conditions. |

These are selection rules, not a fixed list of words or literal question copy. The [shared affix profile table](../generated/adle-composable-lesson/route-and-activity-reference.md#shared-affix-compiler) records each prefix/suffix profile's split, build and meaning policy. Reviewed profile content supplies its actual wording and examples.

## What each question needs

This is the question-design view of the [activity fact registry](../../lib/adle/composable-lesson/activity-requirements.ts). “Profile” facts are authored once per micro skill or lesson version; “assignment” facts are compiled for one learner. They should not become repeated free-text fields on every word.

| Question or step | Word-specific input | Profile, group, or compiled input |
|---|---|---|
| Introduction | Usually none; optional example word and pronunciation. | Reviewed micro-skill explanation, rule, examples. |
| Discovery / meet words | Canonical word, reviewed child meaning and exact word–skill support. | Selection and presentation order. |
| Family reveal | Reviewed base/root and child meaning. | Approved family membership and section order. |
| Cleaver | **Teaching decomposition** for this question, base/root, canonical morphology, joins and transformations. | Which boundary the micro skill asks for; reviewed affix form; exact selected target. A multi-affix word may require more than one cut. |
| Word build | Parts, joins, transformations and meaning. | Affix choices/distractors and deterministic choice order. The built answer must reconstruct the spelling. |
| Meaning match / sort | Whole-word and child meanings; meaning-group ID for a sort. | Reviewed meaning groups, distractors and order; sort only when the profile declares it. |
| Compound jigsaw | Ordered components, component meanings, join kinds and whole word. | Piece order; reconstruction and join-classification check. |
| Cover/check | Canonical identity, display word, pronunciation/audio and effective word–skill support. | Assignment binding and answer-comparison policy; answer hidden before independent response. |
| Dictation | Sentence, exact target token or span, target spelling and audio text. | Assignment binding and sentence order; target must resolve to the complete word. |
| Reflection | No new word analysis. | Reviewed reflection prompt and compiled attempt summary. |

The complete machine-readable activity table, including optional facts, evidence modes and visibility, is generated at [ADLE Route and Activity Reference](../generated/adle-composable-lesson/route-and-activity-reference.md#activity-requirements). A review/probe or “must use writing” question has its own entry there and is not implied by a specialist route.

## Variants that change the word-selection test

| Variant | Additional check before selecting a word |
|---|---|
| Mixed prefix forms | The word's reviewed form must belong to the selected profile. Form-choice questions need a reviewed valid-choice audit for **that word**, including valid alternatives. Meaning sort needs a declared meaning-group ID. |
| One-form suffix | A four-word set must support both direct and changed teaching-base Cleaver examples. The transformation and true morphology cannot be inferred from the visible spelling. |
| Mixed suffix forms | The set must cover the declared forms. Cleaver and build choose examples by form; profiles with multiple meaning groups also require meaning-sort coverage. |
| Base word | A Cleaver asking for the familiar base may cut a different span from a suffix-focused Cleaver on the same word. Each question needs an explicit target boundary derived from reviewed parts, not a generic “split at suffix” instruction. |
| Joined versus spaced/hyphenated compound | Component identities and meanings remain required; joins and the dictation target span must match the surface form exactly. |
| -ing transformation | A regular, drop-`e`, double-consonant, or `ie`→`y` derived word must reconstruct from its governed base and rule. |
| Comparative transformation | The adjective must genuinely take `-er`/`-est`; both derived forms, sentence gaps, paired dictation, and the `why`/`when` question must be reviewed as a family. |

For example, `activity` has a released base-word member with the reviewed word sum `act + ivity → activity`. Descriptive text such as `act + ive + ity` does not by itself supply a suffix `-ity` teaching split, meaning group, or true-morphology provenance. There is currently **no specialist `-ive` route** in the registry, so its letters cannot activate a separate `-ive` lesson. The `-ity` lesson needs its own reviewed meaning and split that match the question it asks.

## Manager implementation status

**Yes: the exact question structure and variant must be known to derive the smallest correct authoring checklist.** The current route and activity registries give much of the answer, but variant choices are spread across profile data and specialist compilers. The manager should read one versioned requirement manifest per route/profile/question variant with:

1. Micro-skill key, route/profile version, activity and question variant.
2. Word, group, profile, or assignment owner for each fact; whether it is required, conditional, or optional.
3. The validator and publication authority for that fact, plus its source/review state.
4. The correct answer shape and visibility rule, especially the intended Cleaver boundary.
5. Lesson-set constraints: word counts, authentic/transfer roles, form and meaning coverage.

The first [versioned activity inventory](../../lib/adle/composable-lesson/activity-variants.ts) and [word assessment](../../lib/teaching-dictionary-manager/activity-assessment.ts) now distinguish evidence, word facts, released content and learner gates. The current manager still uses the released compiler/member as its green-tick authority. A populated field alone is not proof that a question can be safely generated. The [implementation record](activity-driven-teaching-dictionary.md) describes the `-ity` derived-candidate pilot, its default-off rollout switch, and remaining route work.

## Primary code references

- [Route registry](../../lib/adle/curriculum-readiness/route-registry.ts), [activity requirements](../../lib/adle/composable-lesson/activity-requirements.ts), and [generated route/activity reference](../generated/adle-composable-lesson/route-and-activity-reference.md).
- [Manager draft validator](../../lib/teaching-dictionary-manager/contracts.ts) and [Teaching Dictionary Manager lifecycle](teaching-dictionary-manager.md).
- [Base-word lesson contract](adle-base-word-family-lesson-plan.md), [prefix word contract](../../lib/adle/morphology/dynamic-prefix-contracts.ts), [suffix word contract](../../lib/adle/morphology/affix-word-lab.ts), and [compound structure validator](../../lib/adle/morphology/compound-word-structure-v2.ts).
- [-ing rule and word validator](../../lib/adle/ing/contracts.ts) and [comparative family/question validator](../../lib/adle/inflection/contracts.ts).
