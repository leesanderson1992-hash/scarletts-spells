# Writing Engine Canonical Brief

## Purpose

This document is the canonical product and architecture brief for the Writing
Engine.

It merges the original Writing Engine mastery-model brief with later
documentation, audit, and reconciliation decisions so the repo has one
authoritative Writing Engine brief before lower-level documentation is further
reconciled.

This brief is intentionally broader than a runtime contract and more stable
than an implementation plan. It defines what the Writing Engine is, what truths
it must preserve, and how it relates to the surrounding documentation set.

## Product identity

The Writing Engine is not a spelling checker.

It is a mastery-based writing improvement system that helps a child become a
better writer by:

- analysing submitted work
- identifying weaknesses
- mapping those weaknesses to user-facing mini-skills
- allowing parent verification
- updating mastery
- generating assignments that improve real writing

The first practical implementation domain is spelling, but the engine must be
architected so later modules can reuse the same core pattern.

The Writing Engine is also the first full implementation of a wider platform
pattern:

`evidence -> verification -> mastery -> assignment -> transfer`

Implementation remains Writing-first, but the architecture must not become a
spelling-only or writing-only dead end.

## Scope: Writing-first, multi-domain later

The first implemented domain is spelling.

The architecture must later support:

- spelling
- punctuation
- sentence boundaries / sentence formation
- grammar and usage
- vocabulary and word choice
- paragraph structure
- proofreading and editing
- genre/style-specific writing

Future domains should plug into the shared Writing Engine boundary rather than
creating parallel verification, mastery, or assignment systems.

## User-facing language

Parent- and child-facing language should use:

- mini-skill
- lesson
- review
- practice
- mastered
- needs more practice
- used in real writing

Technical documentation may refer to graphs, prerequisite edges, or inference
internally, but user-facing experiences should use mini-skill language rather
than node language.

## Existing repo source-of-truth assumptions

The current likely canonical repo spine is:

- `micro_skill_catalog` = mini-skill registry
- `learning_items` = active learner mastery/practice stream
- `learning_item_evidence` = evidence ledger
- `writing_issues` = durable authentic writing issue history

Related canonical tables and supporting records may include:

- `micro_skill_families`
- `micro_skill_clusters`
- `writing_issue_suggestions`
- `writing_issue_correction_attempts`
- `learning_item_issue_links`
- `task_submissions`
- `writing_samples`

Current transitional or legacy surfaces:

- `daily_assignments` = current transitional delivery/header surface, not a
  long-term architecture anchor
- `word_progress` = legacy/runtime debt, not future source of truth

Do not create duplicate long-term truth tables unless a later audit proves
they are required.

## Canonical product spine

The canonical product spine is:

`authentic work / diagnostic source -> candidate issue or hypothesis -> parent verification -> verified outcome -> learning item / mini-skill stream -> learning evidence -> targeted assignment item -> later transfer evidence from real writing`

This means:

- authentic work and diagnostics can both produce candidate concerns
- candidate concerns do not become truth by themselves
- parent verification is the gate between suggestion and verified truth
- verified outcomes strengthen or create canonical learning streams
- later authentic writing provides transfer evidence back into the same mastery
  model

## Canonical parent review surface

Parent review of Writing Engine outputs happens in `Review Work`.

`Add Writing Sample` is an intake step for authentic paper writing that
originated outside the app.

`/analyse` is an intake-only route for that parent-entered writing.

`/analyse/review` is obsolete and unsupported. It must not exist as a supported
parent review surface, compatibility handoff, or duplicate review workflow.

Manual writing samples and lesson submissions are both valid source inputs into
the same canonical review spine.

Operationally this means the canonical pathway may begin with either:

- lesson submission
- parent-entered `writing_sample`

and continue through the same shared flow:

`lesson submission or parent-entered writing_sample -> candidate issue or hypothesis -> parent verification -> verified outcome -> durable issue / learning stream path`

This does not create a second review workflow. It is one canonical parent
review surface over multiple supported source types.

Canonical parent review detail may render existing shared suggested or
reviewable outputs inside `Review Work`.

Those detail panels remain part of the same canonical review spine:
- they do not create a second review surface
- they do not create new analysis
- they do not turn visibility alone into verified truth

Canonical parent verification actions may also live inside `Review Work`
detail, but only as a presentation and action-trigger surface over existing
shared verification contracts.

This means:
- `Review Work` is where parent review and parent verification happen
- `Review Work` is not where verification semantics are invented
- parent actions must reuse existing shared verified-truth and durable-issue
  pathways rather than creating a second review or issue workflow
- `Review Work` is the only canonical parent review surface
- `Analyse` does not own verification, mastery, assignment generation, rewards,
  or durable learning effects
- parent verification remains the source of truth for what counts as verified
  writing-engine truth
- `Accept` availability depends on existing canonical suggestion truth; it is
  not the same thing as offering richer override alternatives
- the current bounded `Accept` path is limited to lesson/task-submission-
  backed spelling suggestions that already satisfy the documented canonical
  mapping rule
- if Review Work later surfaces catalog-backed override choices, that must be
  treated as a separate option-provider boundary rather than assumed to be
  solved by bounded `Accept` readiness alone
- that next separate selectable UI/runtime boundary remains deferred for
  lesson/task-submission-backed spelling suggestions
- existing server-side override behavior is covered by the tracked
  override-provider behavior regression
- `micro_skill_catalog` remains the only mini-skill identity source for that
  slice
- bounded provider options must not become unrestricted catalog browsing or
  free-text override truth
- parent verification may confirm event-level truth and capture a candidate
  mapping, but normal parent review does not itself mint global canonical
  mapping truth
- if a later bounded stage captures spelling candidate mappings for future
  reuse, that mapping layer must remain separate from:
  - `micro_skill_catalog`
  - existing deterministic Stage `2C` / Slice `1` catalog-backed mapping
    logic
  - `writing_issues`
  - `parent_verifications`
- candidate capture may classify a case such as `natral -> natural` against an
  existing canonical micro-skill, but that initial capture remains
  non-canonical until explicit promotion
- `micro_skill_catalog` remains the only micro-skill identity source for that
  classification boundary
- no free-text `micro_skill_key` invention is authorized
- pending candidate mappings must not be reusable by future suggestions
- the bounded Slice `2` lesson-submission capture path is now implemented and
  QA passed:
  - success state is visible after save
  - pending candidate mappings do not unlock `Accept`
  - pending candidate mappings are not used by future suggestion resolution
  - parent-added missed words persist as reviewable parent input after reopen
  - manual writing samples remain excluded
- known limitation:
  - candidate capture depends on seeded canonical micro-skill coverage
  - valid rows such as `natral -> natural` may remain blocked until the
    correct canonical micro-skill exists in the bounded seeded option set
  - this is a catalogue/seed coverage limitation, not a Slice `2` runtime
    boundary failure
- a captured row may remain visible in both `Suggested / candidate` and
  `Parent Verification` while the mapping is still
  `pending_parent_promotion`; this is acceptable for Slice `2`, though later
  copy may clarify the state as captured-but-not-promoted
- parent-local promotion is the highest authority authorised in the
  single-child MVP
- parent-local promoted mappings may improve suggestions only inside the same
  parent/child environment
- global canonical promotion remains a separate curator/admin workflow deferred
  from MVP
- no parent action in normal `Review Work` directly writes global canonical
  mapping truth
- the bounded override save path uses the canonical anchor fallback that any
  future selectable Review Work provider UI must also use when persisted
  shared suggestion truth is still `unknown`
- template routing is micro-skill-owned, not word-owned, for Review Work
  spelling issues
- `verified_template_key` remains deferred/blocked in Review Work and must not
  become free-text canonical override truth
- accepted suggestions use the suggested canonical micro-skill's configured
  template route, and overridden suggestions use the verified replacement
  micro-skill's configured template route
- no parent-facing template dropdown/provider is authorized now; any later
  template choice UI must be separately authorized and bounded to the verified
  micro-skill's allowed template metadata
- the bounded Review Work read-only derived template metadata slice is now
  implemented for lesson/task-submission spelling suggestions
- it may display template-route metadata derived from canonical/verified
  micro-skill truth, but it must not introduce editable template fields,
  word-by-word template truth, or independent template persistence
- any later parent-verified spelling candidate-capture stage must not change:
  - `Accept` readiness
  - override-provider behavior
  - read-only derived template metadata behavior
  - reward
  - mastery
  - assignment
  - scoring
  - thresholds
  - template routing
  - analytics
  - positive-evidence semantics
- that stage is separate from `Stage 7F` and separate from `Stage 8`

Parent-facing summary surfaces outside `Review Work` may use advisory
evidence/progress wording, but that wording must not be treated as verified
truth or automatic mastery. `Stage 8A` is a wording-safety pass, not a
mastery-model change.

Completed `Stage 8A` preserved this boundary: summary surfaces remain advisory
interpretation only, while `Review Work` remains the canonical
parent-verified-truth surface. Residual product-metaphor labels may be refined
later through another bounded copy-only pass if needed.

Stage `8` closeout preserves the same rule: it was a boundary-safety and
parent-facing evidence-wording stage only, not a mastery-runtime stage, and it
did not alter verification truth, mastery semantics, or workflow ownership.

## Navigation ownership

Parent navigation should expose writing review under `Courses`.

This means:
- `Review Work` belongs under `Courses`
- `Analyse Writing` belongs under `Courses`
- standalone top-level Analyse navigation is not allowed

This navigation rule is an ownership rule, not just an information-architecture
 preference. Analyse intake is subordinate to canonical `Review Work`, not a
 parallel parent workflow.

## Mastery semantics

A word is evidence about one or more mini-skills, not the skill itself.

Correct spelling gives credit only for the mini-skills the word genuinely
tests.

The system must preserve these rules:

- one word must not prove mastery
- a complex word does not prove all simpler mini-skills
- supporting prerequisite mini-skills should not be strongly penalised unless
  the error directly proves prerequisite failure
- repeated controlled practice must not be mistaken for authentic transfer

Parent- and child-facing "Mastered" must require:

- authentic writing transfer
- breadth across representative examples
- sufficient confidence / evidence count
- low recent recurrence

This brief establishes those as canonical product semantics even where the
exact implementation formula remains versioned elsewhere.

## Internal and parent-facing mastery states

The canonical internal mastery ladder is:

0. Unseen
1. Introduced
2. Recognises
3. Controlled production
4. Contrast control
5. Delayed retention
6. Transfer
7. Generalised mastery
8. Automatic mastery

Parent-facing simplified states may be:

- Learning
- Practising
- Remembering
- Using in Writing
- Mastered

Important gate:

- "Mastered" must not be available without authentic writing transfer

## Evidence model

Evidence should be modelled conceptually using:

- source weight
- mini-skill role weight
- complexity weight
- diversity / breadth contribution
- independence
- recency / retention

Evidence source types should distinguish at least:

- recognition / multiple choice
- copying / guided task
- controlled lesson spelling
- contrast practice
- dictation
- delayed review
- authentic writing
- self-correction in free writing
- correct after previous failure
- parent-verified diagnostic
- parent-rejected suggestion
- false positive

Evidence records should preserve, where available:

- source type
- source entity
- target text
- attempt text
- correctness
- parent verification state
- mini-skill role
- evidence strength / weight
- complexity metadata
- breadth metadata

The exact mathematical scoring model belongs in a lower-level mastery/evidence
contract, but the requirement to preserve these evidence dimensions is part of
the canonical brief.

## Word-to-mini-skill evidence model

Each word can provide an evidence map that identifies:

- primary tested mini-skill
- supporting prerequisite mini-skills
- unrelated mini-skills
- evidence weights

Example:

- `hopeing -> hoping` strongly updates `drop final e before vowel suffix`
- it may weakly or conditionally affect suffix awareness or final silent-e base
  awareness
- it should not weaken unrelated mini-skills such as CVC word mastery

This distinction is required to avoid corrupting mastery with overly broad
negative updates.

## Word diversity and complexity

Mastery requires breadth across representative word groups, not repeated
success on a single item.

Word complexity should consider:

- frequency
- syllable count
- phonics regularity
- grapheme ambiguity
- morphology depth
- etymology / irregularity
- homophone / context risk
- number of mini-skills required
- highest-level mini-skill involved
- common error rate in actual learner work

Complexity matters only for the mini-skills a word genuinely tests.

Difficulty must not be treated as universal proof of lower-level mastery.

## Parent verification

Parent verification is central.

The engine may suggest:

- likely category
- mini-skill
- prerequisite gaps
- lesson
- assignment item

But in early stages:

- unverified suggestions must not update mastery

The system must preserve both:

- engine suggestion
- parent decision

Parent decisions should support:

- accept suggestion
- override category
- override mini-skill
- override lesson
- mark false positive / not an issue
- add note

This is required for auditability, future classifier improvement, override-rate
analysis, and protecting mastery from false positives.

## Assignment architecture

`assignment_items` is the generic assignment composition layer.

`daily_assignments` is the current transitional delivery/header surface only.
No new canonical architecture should be designed around it as the permanent
model.

Long-term direction should move toward a generic assignment header such as:

- `writing_assignments`
- `improvement_assignments`

Assignment items must be able to support:

- spelling dictation
- spelling contrast practice
- punctuation correction
- sentence splitting
- proofreading
- grammar transformation
- paragraph revision
- writing-transfer tasks

The Writing Engine must not become a word-list-only system.

Stage `1D` implementation rule:

- assignment generation must start from canonical `learning_items`, not from
  `word_progress`, retired spelling runtime rows, or route-local assignment
  composition
- the first implementation slice may be narrow, but the architecture must stay
  generic at the `assignment_items` boundary
- after `1D.2` proves deterministic append-only persistence for single-word
  spelling items, the next bounded builder pass should widen shape rather than
  widen ownership:
  - `1D.3` is the first grouped-set builder pass
  - it should remain inside the spelling domain
  - it should keep `learning_items`, `micro_skill_catalog`, and
    `learning_item_evidence` as the only canonical generation inputs
  - it should not broaden into adaptive routing, contrast logic, dictation, or
    route-local delivery
- after `1D.3` proves grouped-set building without new ownership or provenance,
  the next bounded builder pass should still widen shape rather than widen
  ownership:
  - `1D.4` is the first contrast builder pass
  - it should remain inside the spelling domain
  - it should keep `learning_items`, `micro_skill_catalog`, and
    `learning_item_evidence` as the only canonical generation inputs
  - it should reuse the existing duplicate-safe append model
  - it should not broaden into dictation, adaptive routing, or route-local
    delivery
- after `1D.4` proves contrast building without new ownership or provenance,
  the next bounded builder pass should still widen shape rather than widen
  ownership:
  - `1D.5` is the first dictation builder pass
  - it should remain inside the spelling domain
  - it should keep `learning_items`, `micro_skill_catalog`, and
    `learning_item_evidence` as the only canonical generation inputs
  - it should reuse the existing duplicate-safe append model
  - it should keep one active `learning_item` as the generation unit and one
    evidence-backed anchor `target_word` as the persisted identity anchor
  - it should not broaden into audio delivery, browser speech synthesis,
    sentence-level batching, adaptive routing, or route-local delivery
- if a proposed implementation requires undocumented assignment ownership,
  undocumented provenance rules, or a new legacy compatibility anchor, the
  docs must be updated before code is written

Stage `3` implementation rule:

- authentic-writing submission analysis must begin from canonical repo-owned
  submission truth, not route-local review heuristics or retired spelling-page
  logic
- the first Stage `3` pass remains spelling-only and must reuse the shared
  Writing Engine boundary plus documented Stage `2` spelling-content truth
- raw authentic-writing analysis output is candidate-hypothesis truth only:
  - it is not durable issue truth by itself
  - it is not mastery truth by itself
  - it is not transfer evidence by itself
- parent verification remains the gate between authentic-writing suggestions
  and verified educational truth
- accepted and overridden authentic-writing outcomes must remain able to feed
  the durable `writing_issue` lifecycle and later canonical `learning_items`
  without creating a parallel diagnostic-only issue system
- rejected authentic-writing outcomes must remain auditable without creating
  fake `writing_issues`, fake mastery updates, or fake transfer evidence
- if a proposed Stage `3` implementation requires a new parallel issue
  history, free-text mini-skill identity, or external API truth owner, the
  docs must be updated before code is written

Stage `4` implementation rule:

- Stage `4` is the punctuation-only reuse of the proven Stage `3`
  authentic-writing path
- raw punctuation analysis output is candidate-hypothesis truth only:
  - it is not durable issue truth by itself
  - it is not mastery truth by itself
  - it is not transfer evidence by itself
- Stage `4` must reuse the shared Writing Engine boundary plus the existing
  parent-verification and durable-issue contracts rather than creating a
  punctuation-specific parallel workflow
- punctuation hypotheses may classify punctuation-specific educational truth,
  but they must remain bounded to punctuation and must not expand into:
  - sentence-boundary detection
  - sentence-formation diagnosis
  - grammar/usage diagnosis
  - general proofreading ownership
- accepted and overridden punctuation outcomes must remain able to feed the
  durable `writing_issue` lifecycle without introducing punctuation-only issue
  stores or a new verification model
- rejected punctuation outcomes must remain auditable without creating fake
  `writing_issues`, fake mastery updates, or fake transfer evidence
- if a proposed Stage `4` implementation requires a new sentence-boundary or
  grammar taxonomy, a new evidence source type, or a new external truth owner,
  the docs must be updated before code is written

Stage `5` implementation rule:

- Stage `5` is the sentence-boundary / sentence-formation reuse of the proven
  Stage `3` and Stage `4` authentic-writing path
- raw sentence-boundary analysis output is candidate-hypothesis truth only:
  - it is not durable issue truth by itself
  - it is not mastery truth by itself
  - it is not transfer evidence by itself
- Stage `5` must reuse the shared Writing Engine boundary plus the existing
  parent-verification and durable-issue contracts rather than creating a
  sentence-boundary-specific parallel workflow
- sentence-boundary hypotheses may classify sentence-boundary-specific
  educational truth, but they must remain bounded to sentence-boundary /
  sentence-formation concerns and must not expand into:
  - grammar/usage diagnosis
  - broad proofreading ownership
  - transfer evidence ownership
- accepted and overridden sentence-boundary outcomes must remain able to feed
  the durable `writing_issue` lifecycle without introducing a sentence-only
  issue store or a new verification model
- rejected sentence-boundary outcomes must remain auditable without creating
  fake `writing_issues`, fake mastery updates, or fake transfer evidence
- if a proposed Stage `5` implementation requires a grammar fallback
  taxonomy, a proofreading catch-all taxonomy, a new evidence source type, or
  a new external truth owner, the docs must be updated before code is written
- Stage `5` is now complete for its documented `5A` / `5B` / `5C`
  sentence-boundary contract, and those boundaries remained intact at closeout
- Stage `6A` is now complete for its documented bounded
  grammar/proofreading candidate-only contract, and those boundaries remained
  intact at closeout
- Stage `6B` is now complete for its documented bounded
  grammar/proofreading shared verification contract, and those boundaries
  remained intact at closeout
- Stage `6C` is now complete for its documented bounded
  grammar/proofreading durable-issue bridge contract, and those boundaries
  remained intact at closeout

## Analytics and assessment contract

Analytics dashboards can come later, but evidence capture must be designed from
the start.

The system must eventually be able to answer:

Is the child becoming a better writer?

It should support later calculation of:

- spelling errors per 100 words
- punctuation errors per 100 words
- sentence-boundary errors per 100 words
- repeated error rate
- corrected-after-feedback rate
- high-frequency word accuracy
- target mini-skill transfer rate
- writing volume
- complexity of attempted words and sentences
- self-correction rate
- parent override rate
- controlled task accuracy
- contrast task accuracy
- dictation accuracy
- delayed review accuracy
- authentic writing transfer
- recurrence after mastery
- breadth coverage
- confidence / stability

Stage 1 should therefore capture the evidence fields needed for later analytics
even if dashboards are deferred.

## External API strategy

External APIs may assist later but must not own truth.

Possible later uses:

- LanguageTool for suggestion seeding in spelling, grammar, punctuation, or
  homophone detection
- Datamuse for related words, sound-alikes, and syllable/frequency enrichment
- Wiktionary or Free Dictionary for pronunciation, definitions, or etymology
  hints
- browser speech synthesis for dictation delivery

Stage 1 rule:

- no external APIs in the runtime-critical path

APIs may enrich or seed suggestions later, but the app owns:

- mini-skills
- lesson templates
- mastery
- assignments
- final parent-verified truth

## Stage 1A scope

Stage 1A is architecture foundation only.

It should not build the full spelling classifier.

Stage 1A should establish:

- shared `lib/writing-engine` boundary
- shared types/interfaces for domain modules
- candidate hypotheses
- parent verification commands
- verified outcomes
- mastery evidence commands
- assignment item candidates
- analytics/evidence capture contract
- generic assignment item contract
- future module plug-in surface

It should prove:

- unverified suggestions do not update mastery
- verified outcomes can produce evidence
- evidence can strengthen or create a learning item
- assignment items can be generated under the current transitional delivery
  model
- assignment items are not spelling-only
- domain logic lives in `lib/writing-engine`, not `app/*`

## Stage 1B scope

Stage 1B is the manual spelling diagnostic MVP.

Input:

- target word
- child spelling
- sentence context

Output:

- likely error category
- suggested mini-skill / mini-skills
- possible prerequisite gaps
- recommended micro-lesson
- similar practice words
- confidence score
- parent verification status

Initial classifier approach:

- deterministic rules for obvious patterns
- word-to-mini-skill map
- edit distance comparison
- grapheme/phonics comparison where practical
- parent verification

Examples:

- `runing -> running` = double final consonant before vowel suffix
- `hopeing -> hoping` = drop final e before vowel suffix
- `plai -> play` = final `ay` for long /a/

## Documentation ownership

This brief does not replace lower-level owner docs.

Documentation ownership remains:

- pedagogy docs own educational meaning
- contract docs own executable rules and invariants
- architecture docs own system boundaries and canonical shape
- `writing-engine-roadmap.md` owns implementation sequence
- `targeted-writing-practice-status.md` reports current state only

Older or superseded plans should be marked historical or archived if they
conflict with the active documentation set.

## Non-goals

This brief does not:

- define the exact implementation formula constants for mastery scoring
- replace detailed contracts for evidence persistence
- replace the implementation roadmap
- build the spelling classifier
- define external APIs as sources of truth
- justify reviving the retired spelling runtime

## Risks and controls

- Risk: the engine collapses into a spelling checker
  Control: preserve multi-domain architecture from the start
- Risk: one strong practice result is mistaken for mastery
  Control: require transfer, breadth, confidence, and recurrence protection
- Risk: supporting prerequisites are unfairly penalised
  Control: only apply strong negative updates where evidence directly proves
  failure
- Risk: generic assignments regress into word-list-only delivery
  Control: keep `assignment_items` generic and treat `daily_assignments` as
  transitional only
- Risk: false positives damage mastery
  Control: require parent verification before meaningful mastery updates
- Risk: external tools start to own educational truth
  Control: limit them to enrichment and suggestion seeding
- Risk: overlapping docs create drift
  Control: use this brief as the canonical synthesis before lower-level
  reconciliation
