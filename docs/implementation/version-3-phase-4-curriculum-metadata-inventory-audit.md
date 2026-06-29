# Version 3.0 Phase 4: Curriculum Metadata Inventory Audit

## Executive summary

Phase 4 audits Scarlett's Spells against the target mastery-system vision:

```text
Canonical Truth answers: What is true about English?
Child Proficiency answers: What does this child currently know?
```

Those two domains must remain completely separate. Canonical word and
curriculum metadata may describe English spelling, pronunciation, morphology,
frequency, misspelling patterns, and reviewed teaching content. Child
proficiency may describe successes, failures, evidence strength, recency,
difficulty, Word Treasure progress, and transferable micro-skill mastery.

Current repo state is promising but not first-exposure-ready. The repo already
has a broad D4 micro-skill seed artifact, a local/dev canonical word-map pilot,
source/review metadata, local-only import tooling, and contract boundaries that
prevent word-map rows from becoming runtime truth. It does not yet have a
production teaching dictionary schema, row-level curriculum readiness, every
written word evidence capture, proficiency aggregation, or reviewed canonical
promotion workflows.

Phase 4 is an audit/report only. It does not authorize runtime generation,
assignment composition, migrations, imports, production deployment, hosted
Supabase mutation, resolver changes, or invented teaching content.

## Current repo/data inventory

Inspected source-of-truth documents and artifacts:

- `docs/implementation/version-3-roadmap.md`
- `docs/contracts/canonical-spelling-word-map-contract.md`
- `docs/contracts/adle-daily-assignment-composer-contract.md`
- `docs/contracts/adle-instructional-activity-registry-contract.md`
- `docs/contracts/writing-engine-mastery-and-evidence-contract.md`
- `docs/contracts/micro-skill-taxonomy-and-assignment-contract.md`
- `supabase/migrations/20260608193000_add_canonical_spelling_word_map_storage.sql`
- `scripts/validate-canonical-spelling-word-map.py`
- `scripts/import-canonical-spelling-word-map.py`
- `docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json`
- `docs/implementation/seed-data/canonical-spelling-word-map/canonical-spelling-word-map-v1.xlsx`
- `docs/implementation/seed-data/common_misspellings_seed_v1.csv`
- `lib/writing-engine/assignments/stage2d1-word-map-content.ts`
- `lib/writing-engine/persistence/stage2d1-word-map-content.ts`

Current D4 taxonomy seed coverage:

| Artifact | Current coverage |
|---|---:|
| Active assignable D4 micro-skills | 240 |
| Micro-skills with `display_name` | 240 |
| Micro-skills with `teaching_point` | 240 |
| Micro-skills with `example_words` | 240 |
| Micro-skills with `starter_word_bank` | 240 |
| Micro-skills with `developmental_foundation` | 240 |
| Micro-skills with `cluster_name` | 240 |

Current canonical word-map workbook coverage:

| Sheet | Rows | Current value |
|---|---:|---|
| `micro_skill_word_bank` | 88 | Teaching/practice/review words linked to micro-skills |
| `word_metadata` | 99 | Manual syllable, phoneme hint, schwa, morphology, irregularity, complexity metadata |
| `micro_skill_diversity_groups` | 40 | Breadth groups for future practice/mastery support |
| `contrast_pairs` | 30 | Approved contrast content, not resolver truth |
| `diagnostic_misspelling_mappings` | 20 | Diagnostic examples only, resolver-visible forced false |
| `lesson_route_support` | 30 | Route support and minimum content requirements |
| `import_notes` | 2 | Workbook-level source/licence/review/boundary notes |

Existing local/dev storage:

- `canonical_spelling_word_map_import_batches`
- `canonical_spelling_word_metadata`
- `canonical_spelling_word_map_diversity_groups`
- `canonical_spelling_word_map_words`
- `canonical_spelling_word_map_contrast_pairs`
- `canonical_spelling_word_map_diagnostic_examples`
- `canonical_spelling_word_map_route_support`

Existing safeguards:

- Word-map storage has RLS enabled and grants only to `service_role`.
- The import planner refuses generic production apply paths.
- Local apply/import paths require explicit local Supabase URL, local port,
  confirmation tokens, migration ledger checks, protected table counts, and
  duplicate active-content checks.
- Diagnostic examples cannot be resolver-visible in the current storage.
- Stage 2D.1 content reads remain bounded and read-only; they do not hook into
  ADLE assignment generation.

Current gaps:

- No production `canonical_words` teaching dictionary.
- No row-level curriculum readiness table.
- No stable child-facing teaching metadata layer.
- No every-written-word evidence ledger.
- No child micro-skill proficiency aggregate table.
- No reviewed canonical promotion pipeline for generated metadata.
- No schema for multiple micro-skill evidence roles per word.
- No approved Phase 5A readiness rules.
- No Instructional Activity Registry runtime truth.

## Target architecture

Target Version 3 architecture:

```text
Canonical Truth
-> Curriculum Metadata
-> Curriculum Readiness
-> Learning Item
-> Instructional State
-> Instructional Activity Registry
-> ADLE Daily Assignment Composer
-> Assignment Items
-> Child Attempt
-> Evidence
-> Micro-skill Proficiency
```

Mastery-system interpretation:

- Canonical Truth stores reviewed knowledge about English.
- Child Proficiency stores evidence and summaries about a child.
- Every analysed written word can contribute evidence.
- Correct words create positive evidence.
- Confirmed misspellings create negative evidence.
- Proficiency drives future lesson recommendations.
- Human-reviewed misspellings can improve Canonical Truth, but never
  automatically.

Domain boundary:

| Domain | Owns | Must not own |
|---|---|---|
| Canonical Truth | English word facts, teaching metadata, word-to-skill mappings, reviewed misspellings, source/licence lineage | Child mastery, rewards, progress, assignment creation |
| Child Proficiency | Evidence events, proficiency summaries, levels, recent performance, difficulty performance | English truth, taxonomy creation, canonical mappings |
| Word Treasure | Individual word journey after a child missed that word | Transferable micro-skill mastery |
| Micro-Skill Level | Transferable mastery across many words and contexts | Golden Nugget/Golden Bar state |

## Proposed production tables

These tables are Phase 5B design candidates only. Phase 4 does not create
migrations.

### `canonical_words`

Shared word identity and high-level reviewed metadata.

Candidate fields:

- `id`
- `normalised_word`
- `display_word`
- `dialect_code`
- `frequency`
- `frequency_band`
- `age_band`
- `complexity_band`
- `review_status`
- `source_name`
- `source_url`
- `source_license`
- `source_category`
- `confidence`
- `version`
- `row_status`
- `created_at`
- `updated_at`

### `canonical_word_metadata`

Draft and reviewed technical word metadata.

Candidate fields:

- `id`
- `canonical_word_id`
- `phonemes`
- `graphemes`
- `syllables`
- `morphemes`
- `stress_pattern`
- `has_schwa`
- `pronunciation_source`
- `metadata_source`
- `metadata_source_version`
- `confidence`
- `manual_override`
- `manual_override_note`
- `review_status`
- `reviewed_by`
- `reviewed_at`

### `canonical_word_micro_skills`

Reviewed word-to-micro-skill associations.

Candidate fields:

- `id`
- `canonical_word_id`
- `micro_skill_key`
- `micro_skill_role`
- `difficulty_band`
- `evidence_weight`
- `confidence`
- `review_status`
- `source_name`
- `source_license`
- `reviewed_by`
- `reviewed_at`

One word may map to multiple micro-skills. Example: `beautiful` may support
evidence for an `eau` spelling pattern, suffix `-ful`, multisyllable spelling,
and schwa awareness.

### `canonical_misspellings`

Reviewed or pending misspelling knowledge.

Candidate fields:

- `id`
- `misspelling_normalised`
- `correction_word_id`
- `micro_skill_key`
- `error_pattern`
- `confidence`
- `review_status`
- `resolver_visible_candidate`
- `resolver_visible_approved`
- `source_name`
- `source_license`
- `reviewed_by`
- `reviewed_at`

Rows must default to pending/non-resolver-visible. They may inform review and
teaching, but must not become canonical resolver mappings without explicit
review.

### `child_word_evidence`

Append-only evidence from analysed writing and controlled practice.

Candidate fields:

- `id`
- `child_id`
- `parent_user_id`
- `canonical_word_id`
- `attempt_text`
- `normalised_attempt`
- `micro_skill_key`
- `evidence_result`
- `source_type`
- `source_entity_type`
- `source_entity_id`
- `difficulty_band`
- `evidence_weight`
- `word_context`
- `was_prompted`
- `was_parent_verified`
- `verification_status`
- `created_at`

Evidence result values should distinguish success, failure, correction,
delayed authentic success, and other mastery-contract vocabulary rather than
collapsing to a simple boolean.

### `child_micro_skill_proficiency`

Permanent child + micro-skill summary projection.

Candidate fields:

- `child_id`
- `micro_skill_key`
- `easy_successes`
- `easy_failures`
- `medium_successes`
- `medium_failures`
- `hard_successes`
- `hard_failures`
- `advanced_successes`
- `advanced_failures`
- `distinct_words_successful`
- `distinct_words_attempted`
- `recent_success_weight`
- `recent_failure_weight`
- `authentic_writing_success_weight`
- `mastery_score`
- `current_status`
- `current_level`
- `last_evidence_at`
- `updated_at`

Do not use a simple percentage. Preserve difficulty-band performance so a child
can be mastered at easy words, secure at medium words, and developing at hard
words.

## Target metadata matrix

| Metadata type | Current status | Importance | Product value | Safety classification |
|---|---|---:|---|---|
| `micro_skill_key` identity | Ready in D4 seed | P0 | Selection, evidence, gap reports | Runtime-safe as catalog FK |
| Teaching objective | Partial via display/teaching point | P0 | First-exposure intent | Manual review before teaching |
| Child-friendly explanation | Missing | P0 | Child-facing instruction | Manual authored/reviewed only |
| Rule explanation | Partial via `teaching_point` | P0 | Teach-the-skill block | Advisory until reviewed |
| Anchor word | Partial via word-map role | P0 | Stable cue | Reviewed content only |
| Ordered example words | Partial | P0 | Guided practice sequence | Needs explicit order/review |
| First-exposure progression | Missing | P0 | INTRODUCTION_REQUIRED | Needs registry keys/readiness |
| Source/licence/confidence/review | Partial | P0 | Legal and safety gate | Required before import/runtime |
| Memory tip/mnemonic | Missing | P1 | Recall support | Manual authored/reviewed only |
| Contrast words | Partial | P1 | Interleaving and misconception checks | Advisory until reviewed |
| Common misconceptions | Partial via diagnostics | P1 | Reteaching and parent clarity | Advisory/manual review |
| Review progression | Missing | P1 | Retrieval/consolidation | Requires scheduler/activity contract |
| Phoneme/stress/schwa | Partial/manual | P1 | Phonics, dictation, schwa support | Source-reviewed |
| Morphology | Partial/manual | P1 | Morphology lessons and transfer | Source-reviewed |
| Frequency | Partial/manual bands | P2 | Workload and commonness | Advisory unless sourced |
| Age band | Missing | P2 | UK primary suitability | Needs source/licence |
| Complexity band | Partial/manual | P2 | Difficulty and progression | Manual override capable |
| Diversity group | Partial | P2 | Breadth, mastery coverage | Advisory until scoring approved |
| Word class | Missing | P2 | Homophones, morphology, sentence work | Source-reviewed |
| Scraped mnemonics/free web explanations | Missing | P3 | Possible inspiration | Do not import without licence |
| Unreviewed AI copy | Missing | P3 | Draft authoring acceleration | Draft-only, never final truth |

## Product value ranking by field

P0 fields are required before ADLE can teach first exposure safely:

- teaching objective
- child-friendly explanation
- rule explanation
- anchor word
- ordered example words
- first-exposure progression
- source/licence/confidence/review status

P1 fields strongly improve lesson quality and sequencing:

- memory tip or mnemonic
- contrast words
- common misconceptions
- review progression
- phoneme/stress/schwa metadata
- morphology metadata

P2 fields enrich selection and reporting:

- frequency
- age band
- complexity band
- diversity group
- word class
- dialect notes

P3 fields are risky or nice-to-have:

- scraped mnemonics
- unreviewed AI-generated teaching copy
- unclear common-misspelling datasets
- copyrighted/free-to-read teaching explanations

## External source register

Research performed during Phase 4 planning used current public pages where
available. Any source marked legal-review required must not be imported until a
human has verified terms for the exact dataset/version.

| Source | URL | Owner/publisher | Cost/status | Licence/use constraints | Likely value | Risk | Decision | UK/US relevance |
|---|---|---|---|---|---|---|---|---|
| UK National Curriculum English programmes and Appendix 1 spelling | https://www.gov.uk/government/publications/national-curriculum-in-england-english-programmes-of-study | UK Department for Education | Free | GOV.UK content is OGL v3.0 unless stated otherwise; attribution and non-endorsement required | UK spelling scope/sequence and statutory word-list expectations | Must preserve statutory/non-statutory distinctions | Importable/adaptable with attribution | Strong UK |
| Open Government Licence v3.0 | https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ | The National Archives | Free/open | Allows copy, adaptation, distribution, commercial use with attribution; excludes third-party rights and official endorsement | Licensing basis for GOV.UK reuse | Must track attribution | Import/reference | UK public sector |
| SUBTLEX-UK | Candidate dataset; exact canonical URL/licence not verified in Phase 4 | Academic corpus researchers | Unknown | Licence/importability not verified | British frequency/commonness | High legal uncertainty until exact dataset terms are confirmed | Legal review required; do not import yet | UK/British English |
| wordfreq | https://github.com/rspeer/wordfreq | Robyn Speer/open-source contributors | Free library | Code is open; underlying data has mixed source/licence and attribution constraints | Frequency estimates, Zipf scores, broad coverage | Raw data/export strategy can create licence obligations | Advisory scoring only until licence design approved | Mixed English |
| CYP-LEX | Candidate child exposure/lexical database; exact canonical URL/licence not verified in Phase 4 | Academic child language researchers | Unknown | Licence/importability not verified | Age exposure and child vocabulary suitability | High legal uncertainty | Legal review required; do not import yet | Strong potential for UK primary if terms allow |
| CMU Pronouncing Dictionary | https://github.com/cmusphinx/cmudict | Carnegie Mellon Speech Group | Free | Research/commercial use unrestricted; acknowledgement requested | Phonemes, stress, draft schwa support | US pronunciation; may not match British English | Importable for US/draft pronunciation with attribution | US |
| G2P systems | Tool-specific | Varies | Tool/model licences vary | Draft phoneme/grapheme generation | Dialect and accuracy issues | Draft generator only | Generate pending metadata only | Depends on model |
| Pyphen | https://pyphen.org/ | CourtBouillon / LibreOffice dictionaries | Free | GPL 2.0+ / LGPL 2.1+ / MPL 1.1 tri-license; dictionaries from LibreOffice under GPL/LGPL/MPL | Draft syllable/hyphenation support, GB/US dictionaries | Licence compatibility needs review | Draft/advisory only until legal review | GB and US dictionaries |
| CELEX | Licensed lexical database | Max Planck / distributor-dependent | Paid/licensed likely | Licence required | High-value morphology/phonology | Cost and redistribution restrictions | Paid/licensed candidate only | Strong linguistic value |
| SymSpell | https://github.com/wolfgarbe/SymSpell | Wolf Garbe | Free/open | MIT licence for software | Fast spelling suggestions and candidate generation | Frequency dictionaries and generated candidates still need review | Tool importable; output pending only | Language independent; dictionary-dependent |
| Edit-distance methods | Internal implementation / libraries | Free if internally implemented | Library-specific if used | Candidate generation and similarity scoring | False positives on child writing | Tool only; never canonical promotion | UK/US neutral |
| Phonetic matching | Internal or library-specific | Varies | Library-specific | Candidate misspelling matching | Dialect and accent sensitivity | Tool only; review required | UK/US sensitive |
| FCRR Student Center Activities | https://fcrr.org/student-center-activities | Florida Center for Reading Research / Florida DOE | Free-to-access | Non-profit educational use; no commercial use; do not modify/copy/repost | Activity design inspiration | Not importable for product content | Human research/link only | US |
| UFLI Foundations Toolbox | https://ufli.education.ufl.edu/foundations/toolbox/ | University of Florida Literacy Institute | Free resources plus paid manual | All rights reserved/restricted; manual/toolbox content cannot be reproduced broadly | Scope/sequence and lesson-design inspiration | High copyright risk | Human research/link only unless permission | US; has Australian variant |
| IDA Structured Literacy | https://dyslexiaida.org/structured-literacy/ | International Dyslexia Association | Free-to-read | Copyrighted informational content | Dyslexia-friendly principles | Not bulk importable | Human research summary only | US/global |
| Core Knowledge Language Arts | https://www.coreknowledge.org/language-arts/ | Core Knowledge Foundation | Free curriculum | CC BY-NC-SA 4.0 with third-party exclusions | Scope/sequence and remediation ideas | Noncommercial/share-alike restrictions | Avoid product import without legal review | US |
| WordNet | https://wordnet.princeton.edu/license-and-commercial-use | Princeton University | Free | Permissive WordNet licence with notices/disclaimers | Word class, senses, lexical relations | Definitions are not child explanations | Importable for lexical metadata with notices | US/global |
| Moby Word Lists | https://www.gutenberg.org/ebooks/3201 | Grady Ward / Project Gutenberg | Free | Public domain in the USA | Word-list validation/coverage | Old/noisy data; public-domain status may vary outside USA | Importable only after quality/legal check | US/older |
| Wiktionary | https://en.wiktionary.org/wiki/Wiktionary:Copyrights | Wikimedia community | Free/open | CC BY-SA/GFDL; external media/material may differ | Etymology, morphology hints, pronunciations | Share-alike and attribution obligations | Human research or explicit attribution pipeline | Mixed dialect |

## Paid/licensed/manual-authoring candidates

Paid or licensed sources may be valuable but must not seed canonical truth
without explicit permission:

- UFLI Foundations manual
- Sounds-Write
- Nessy
- Words Their Way / Pearson spelling inventories
- Oxford, Collins, Chambers, Merriam-Webster, or other dictionary APIs
- CELEX and other licensed lexical databases
- Licensed UK pronunciation/audio datasets

Manual expert authoring is required for:

- child-friendly explanations
- memory tips
- common misconceptions
- British English decisions
- final word-to-micro-skill mappings
- misspelling-to-correction mappings
- complexity overrides
- canonical promotion

## Import-pipeline gap notes

Current pipeline is strong for local/dev word-map import, but not for a
production teaching dictionary.

Recommended future stages:

1. Import reviewed dictionary words, frequency, and age band into
   `canonical_words`.
2. Generate draft metadata: phonemes, graphemes, syllables, morphemes,
   complexity, and micro-skill suggestions.
3. Generate candidate misspellings using SymSpell, edit distance, phonetic
   matching, child error corpus, and allowed public datasets.
4. Admin review approves or rejects metadata, word-to-skill mappings,
   misspellings, British English decisions, and complexity overrides.
5. Writing analysis emits child evidence only from reviewed canonical truth or
   confirmed parent/admin interpretation.

Required validator expansions:

- row-level source category
- source URL
- source licence
- attribution text
- redistribution/import permission
- generated-vs-reviewed status
- dialect code
- confidence
- reviewer and review timestamp
- P0 curriculum-readiness blocker detection
- conflict detection across sources
- source-specific importability rules

Required dry-run reports:

- per-word importability
- per-micro-skill readiness
- source/licence blockers
- generated metadata coverage
- pending review queues
- British English review blockers
- production-forbidden content

## Manual-review workflow recommendations

Suggested review statuses:

- `draft_generated`
- `draft_internal_authored`
- `source_checked`
- `legal_review_needed`
- `pedagogy_review_needed`
- `british_english_review_needed`
- `manual_verified`
- `ready_for_guided_review_only`
- `ready_for_first_exposure`
- `rejected`
- `superseded`

Human approval is required before:

1. Micro-skill taxonomy changes.
2. Word-to-micro-skill mappings.
3. Misspelling-to-correction mappings.
4. Misspelling-to-micro-skill mappings.
5. Complexity overrides.
6. British English spelling/pronunciation decisions.
7. Canonical promotion.
8. Child-facing teaching explanations.
9. Resolver visibility.

Review should happen at field level, not just row level. A word may have
reviewed frequency metadata while its morphology, phonemes, teaching copy, or
micro-skill links are still pending.

## Mastery engine notes

Future proficiency should use weighted evidence, not a simple percentage.

Evidence strength direction:

| Source type | Suggested strength |
|---|---|
| Recognition/copying | Low |
| Controlled practice | Medium |
| Guided correction | Low-medium |
| Dictation/contrast | Medium-high |
| Sentence application | High |
| Authentic/free writing | Highest |

Suggested proficiency inputs:

- weighted accuracy
- difficulty band
- recency decay
- exposure count
- distinct-word breadth
- authentic-writing bonus
- failure recurrence
- parent/admin verification

Suggested statuses:

- `not_started`
- `emerging`
- `developing`
- `secure`
- `mastered`

Suggested micro-skill levels:

| Level | Internal name | Optional child-facing name |
|---:|---|---|
| 0 | Unseen | Hidden |
| 1 | Discovered | Explorer |
| 2 | Practising | Miner |
| 3 | Emerging | Prospector |
| 4 | Developing | Goldsmith |
| 5 | Secure | Master Goldsmith |
| 6 | Fluent | Treasure Keeper |
| 7 | Mastered | Grand Treasure Master |

Important distinction:

- A word can become a Golden Bar without the whole micro-skill being mastered.
- A micro-skill can level up across many words even if one specific Word
  Treasure has not become a Golden Bar.
- Both may read the same evidence engine but must calculate different outcomes.

## Complexity-banding notes

Draft complexity may combine:

- frequency
- child age exposure
- syllable count
- morphology depth
- irregularity
- competing spellings
- phoneme/grapheme transparency
- word length
- dialect-specific spelling/pronunciation issues

Suggested bands:

- `easy`
- `medium`
- `hard`
- `advanced`

Manual override is required before a complexity band becomes canonical
assignment or readiness truth.

## Licensing and safety recommendations

- Nothing enters canonical truth without review.
- Free-to-read content is not importable unless its licence permits reuse.
- External generated metadata must store source, licence, confidence, date,
  version, and review status.
- Diagnostic misspellings never become resolver-visible canonical mappings
  automatically.
- British English decisions require explicit review.
- AI-generated teaching copy may be draft-only until human reviewed.
- Core Knowledge, UFLI, FCRR, IDA, and commercial programmes are research
  references only unless explicit product-use permission exists.
- GOV.UK/OGL material is the safest external source for UK scope/sequence, with
  attribution and non-endorsement handling.
- CMUdict, SymSpell, WordNet, and Pyphen are technical metadata/tooling
  candidates, not teaching truth.

## Scalability notes

Target scale:

- 10,000+ users
- millions of evidence records
- low Supabase cost
- efficient Daily Assignment reads

Storage strategy:

- Keep canonical dictionary tables shared, compact, reviewed, and versioned.
- Keep raw `child_word_evidence` append-only and index by child, micro-skill,
  word, source, source entity, and time.
- Keep `child_micro_skill_proficiency` as a permanent summary projection.
- Aggregate asynchronously so daily planning reads summaries rather than
  scanning raw evidence.
- Allow historical raw evidence archiving by date or child if cost requires it.
- Preserve enough source lineage in raw evidence for recalculation.

Candidate indexes for later schema design:

- `canonical_words(normalised_word, dialect_code, row_status)`
- `canonical_word_micro_skills(micro_skill_key, difficulty_band, review_status)`
- `canonical_misspellings(misspelling_normalised, correction_word_id, review_status)`
- `child_word_evidence(child_id, micro_skill_key, created_at desc)`
- `child_word_evidence(child_id, canonical_word_id, created_at desc)`
- `child_word_evidence(source_entity_type, source_entity_id)`
- `child_micro_skill_proficiency(child_id, micro_skill_key)`

## Proposed Phase 4 deliverables

Phase 4 deliverables are satisfied by this audit report:

- Current repo/data inventory.
- Canonical Truth and Child Proficiency target model.
- Target curriculum metadata matrix.
- External-source register with licence/importability decisions.
- Paid/licensed/manual-authoring candidate list.
- Product value ranking by field.
- Licensing and safety recommendations.
- Schema gap notes.
- Import-pipeline gap notes.
- Manual-review workflow recommendations.
- Phase 5A/5B handoff criteria.
- Explicit non-goals.

## Proposed Phase 5A handoff criteria

Phase 5A can begin when:

- P0 readiness fields are accepted.
- Readiness states and blocker semantics are accepted.
- Review statuses are accepted.
- ADLE skip/readiness behavior is confirmed.
- Product accepts that missing P0 content must produce explicit readiness gaps
  rather than fallback generation.

Phase 5A should define:

- exact readiness-state vocabulary
- exact field-level blocker vocabulary
- minimum P0 content requirements
- manual-review gates
- readiness report format
- first-exposure versus guided-review-only distinction

## Proposed Phase 5B handoff criteria

Phase 5B can begin when:

- Production table design is approved.
- Source/licence policy is approved.
- Validator expansion is approved.
- Local/dev-only migration/import boundaries are reconfirmed.
- No hosted/production import is planned without a separate approval.

Phase 5B should design schema and tooling only after Phase 5A readiness rules
are stable.

## Explicit non-goals

This Phase 4 audit does not authorize:

- runtime generation
- Daily Assignment composer hooks
- production import
- hosted Supabase mutation
- migrations
- resolver changes
- assignment persistence
- evidence writes
- proficiency scoring writes
- Word Treasure behavior changes
- automatic canonical promotion
- treating free-to-read content as importable
- invented teaching content as final truth
- conflating Word Treasure with Micro-Skill Levels
