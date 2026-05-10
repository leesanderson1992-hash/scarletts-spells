# Micro-Skill Taxonomy

## Purpose

This document is the canonical pedagogical taxonomy for Scarlett's Spells.

It defines the conceptual structure used to organise learning from broad outcomes down to assignable micro-skills.

This document owns:
- what each taxonomy level means
- how the levels relate
- naming and stability rules
- prerequisite and related-skill logic
- generic cross-domain relationship rules
- the distinction between taxonomy and competency

This document does not own:
- detailed spelling developmental pathways
- Domain 4 developmental foundations
- domain-specific route mapping
- issue lifecycle semantics
- reward policy
- review cadence
- assignment runtime mechanics
- database schema unless explicitly mirrored from a contract

Implementation contracts may derive keys and runtime rules from this document, but they should not redefine the taxonomy in competing language.

## Core taxonomy ladder

The taxonomy should be read from largest educational intent to smallest teachable unit:

`ultimate outcome -> capability area -> mastery domain -> skill family -> skill cluster, where useful -> micro-skill`

This ladder sits inside the broader 11-layer learning-system overview, where:
- ultimate outcome and capability map to the top educational layers
- mastery domain, skill family, and micro-skill define the stable curriculum spine
- review, durable issues, practice, and progression live in adjacent system layers rather than inside the taxonomy itself

It may also record:
- prerequisite links
- related or encompassed skills

The taxonomy answers:

```text
What skill is being learned?
```

Competency levels answer:

```text
How independently and reliably can the child use that skill?
```

Competency levels sit alongside micro-skills.
They do not replace the taxonomy.

## Canonical distinction matrix

Use this matrix as the shared source of truth for concepts that are often confused.

| Concept | Question it answers | Belongs to | Example values | Must not be confused with |
|---|---|---|---|---|
| Taxonomy | What skill is being learned? | Curriculum/micro-skill model | Domain 4 -> phoneme-grapheme spelling -> final /ai/ with `ay` | competency, issue classification, lifecycle |
| Competency | How independently and reliably can the child use the skill? | child + micro-skill evidence/profile | Level 1-5 | taxonomy hierarchy or issue classification |
| Issue classification | What kind of problem does the reviewed issue appear to be? | writing issue / reviewed issue | `checking_only`, `fragile_knowledge`, `concept_gap`, `transfer_failure`, `not_an_issue` | competency level or workflow state |
| Lifecycle state | Where is the issue/task in the workflow? | runtime workflow object | `detected`, `sent_back`, `attempted`, `resolved`, `assigned` | taxonomy or competency |

Canonical wording:

```text
Taxonomy = what skill is being learned.
Competency = how well the child can use that skill.
Issue classification = what kind of problem a reviewed issue appears to be.
Lifecycle state = where the issue is in the workflow.
```

Important consequences:
- taxonomy classifies the skill itself
- competency classifies the child's current performance relative to that skill
- issue classification interprets a reviewed issue
- lifecycle state tracks workflow position
- one reviewed issue may influence competency evidence without changing what taxonomy object the skill belongs to

## Taxonomy levels

### Ultimate outcome

The ultimate outcome is the highest-level human capability the product is trying to build.

Examples:
- communicate clearly and confidently
- produce independent high-quality work
- use literacy to participate in real projects and life tasks

Rules:
- ultimate outcomes are broad and few
- they should remain stable over time
- they should not be written like worksheet objectives

### Capability area

A capability area is a major dimension of competence that contributes to the ultimate outcome.

Examples:
- writing
- reading
- speaking
- listening
- research and media literacy

Rules:
- capability areas should be durable
- they should group multiple mastery domains
- they should describe meaningful educational territory, not product screens

### Mastery domain

A mastery domain is a coherent area of teachable learning with its own evidence patterns and practice expectations.

The canonical top-level English/literacy mastery-domain spine is declared in the learning-system overview.

Current first deeply instantiated domain:
- spelling and orthographic knowledge

Rules:
- mastery domains may use different practice routes and mastery evidence
- domains should be large enough to hold several families
- domains should not collapse into a single isolated micro-skill
- each micro-skill should have exactly one primary mastery domain for MVP routing clarity

### Skill family

A skill family is a cluster of closely related teachable patterns inside a mastery domain.

Examples inside spelling:
- short vowel plus `ck`
- common homophone contrasts
- suffix changes
- high-frequency irregular words

Cross-domain examples:
- inference question types in reading
- paragraph purpose structures in writing
- turn-taking and spoken explanation in speaking/listening
- source evaluation patterns in research/media

Rules:
- a family groups micro-skills with similar teaching logic
- a family should support contrast and transfer work
- a family should not be so broad that it hides different teaching needs
- each micro-skill should have exactly one primary strand / skill family for MVP routing clarity

### Skill cluster

A skill cluster is an optional intermediate grouping inside a skill family.

Use it when:
- a family needs a clearer internal structure
- several nearby micro-skills share the same local teaching pattern
- the cluster reduces noise without hiding meaningful distinctions

Canonical rule:

```text
Skill Cluster is optional.
Introduce a Skill Cluster only when a family is too broad for practical authoring, review, reporting, or lesson generation.
Do not add a Skill Cluster layer where the family can map directly to micro-skills cleanly.
```

### Micro-skill

A micro-skill is the smallest stable assignable learning target the system should teach directly.

Examples:
- use `ck` after a short vowel at the end of a one-syllable word
- capitalise the pronoun `I`
- distinguish `there`, `their`, and `they're` in sentence context

Rules:
- a micro-skill must be teachable
- a micro-skill must be recognisable in evidence
- a micro-skill must support a sensible practice route
- a micro-skill must be small enough to assign, but not so small that every surface variation becomes a new skill

## Supporting relationship types

### Prerequisite links

Prerequisites are skills that usually need to be secure before a later skill can be taught efficiently.

Rules:
- prerequisite links indicate typical dependency, not a prison
- they should be used to guide sequencing and interpretation
- a missing prerequisite can explain why a child struggles with a later skill

### Related or encompassed skills

Related skills are nearby skills that often:
- reinforce one another
- confuse with one another
- interleave well
- need separation during early teaching

Rules:
- related or encompassed skills are not the same as prerequisite links
- they should support assignment design and contrast teaching
- one skill may have one primary home in the taxonomy while still carrying related or secondary links elsewhere
- cross-domain overlap should not force duplicate primary ownership when one skill is mainly anchored in one domain

Why primary ownership matters for MVP routing:
- assignment and review flows need one primary domain and one primary family for consistent grouping
- cross-domain relationships may enrich interpretation, but they should not create competing primary homes in MVP
- broader multi-domain routing is deferred until after the Writing-first MVP

## Naming rules

Use human-readable pedagogical labels for the taxonomy itself.

Examples:
- `Short vowel + ck`
- `Pronoun I capitalisation`
- `Their / there / they're contrast`

Use implementation keys only in derivative contracts and runtime systems.

Pedagogical naming rules:
- prefer stable instructional language
- name the actual concept being taught
- avoid DB-shaped names in pedagogy docs
- avoid screen-specific language

## Stability rules

### Ultimate outcomes and capability areas

These should change rarely.

Change only when:
- the product vision materially changes
- a major structural simplification is needed

### Mastery domains

These should be stable but may expand as the platform grows.

Change only when:
- a domain was wrongly scoped
- two domains are clearly one
- one domain clearly contains multiple incompatible pedagogies

### Skill families

These may evolve with curriculum refinement.

Change only when:
- a family is too broad to teach coherently
- a family is too fragmented to usefully organise skills

### Micro-skills

These require the most discipline.

Change only when:
- the old unit was not truly teachable
- the old unit was not truly assignable
- the old unit could not support stable evidence or practice

Do not create a new micro-skill for every recurring word or every surface mistake.

## Design tests for a good micro-skill

A good micro-skill should pass these tests:

1. The child can be told what they are learning in clear language.
2. A parent can recognise evidence of it in real work.
3. The system can assign focused practice for it.
4. The system can later judge whether the skill is still fragile or becoming secure.
5. The skill supports transfer back into authentic work.

If a supposed micro-skill fails these tests, it is probably:
- too broad
- too narrow
- not really a skill
- or actually just a temporary example

## Current scope

The taxonomy is built to support multiple domains later.

Current first fully instantiated domain:
- spelling and orthographic knowledge

Domain 4 should therefore supply:
- the first concrete mastery domain
- the first family structure
- the first stable micro-skill examples
- the first assignment-route mappings
