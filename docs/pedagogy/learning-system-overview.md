# Learning System Overview

## Purpose

This document is the canonical high-level learning-method overview for Scarlett's Spells.

It explains:
- the product thesis
- the authentic-work-first learning method
- the future-capable system shape
- the relationship between taxonomy, competency, issue classification, and workflow state
- how the broad future architecture relates to the narrower MVP implementation

When questions are about the product method or the overall shape of the learning system, this document wins over implementation-facing docs.

Operational rules still defer to:
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

## Product thesis

Scarlett's Spells is a parent-mediated, mastery-based learning system built around authentic child work.

The child works on meaningful life-skill projects and writing tasks. The parent reviews the submitted work, identifies possible issues, sends the work back for correction, and only escalates repeated, unresolved, or parent-confirmed issues into targeted lessons and practice.

The system does not assume every mistake is a learning gap. The first correction cycle helps distinguish between:
- mistypes
- rushed proofreading
- one-off slips
- misunderstanding
- durable skill gaps

The product is designed to help the child become more accurate, independent, reflective, and self-correcting through real work rather than isolated worksheets alone.

## Core learning loop

The core learning loop is:

```text
Life-skill project / writing activity
-> submission
-> parent review
-> issue detection
-> send back to child
-> child correction attempt
-> parent confirms outcome
-> durable issue created or resolved
-> targeted lesson / practice assigned if needed
-> mastery and review updated
```

In plain English:

1. The child completes meaningful work.
2. The child submits the work.
3. The parent reviews the submission and marks possible issues.
4. The work is sent back to the child.
5. The child tries to correct the issue independently.
6. The parent confirms whether the issue was corrected, misunderstood, or still fragile.
7. Only genuine, repeated, unresolved, or parent-confirmed learning gaps become durable issues.
8. Durable issues are linked to micro-skills.
9. Targeted lessons and practice are assigned where needed.
10. The child's mastery profile and review schedule are updated.

There is no AI diagnosis in the canonical MVP. The parent is the reviewer and confirmer. AI may be considered later, but the core architecture must not depend on it.

The loop should also support positive evidence from later real work:

```text
Child submits later work
-> parent and system notice previously weak words or patterns now used correctly
-> parent confirms positive evidence
-> evidence attaches to the linked micro-skill
-> competency and review confidence update
```

Canonical rule:

```text
The system should use later child submissions not only to detect new issues, but also to identify correct use of previously weak words, patterns, and micro-skills.
```

One correct authentic use increases evidence.
Repeated correct use over time supports retained mastery.
Parent confirmation remains part of the MVP before competency changes materially.

## What the system is not

Scarlett's Spells is not:
- an AI-first diagnosis system
- a generic worksheet generator
- a fixed linear English curriculum
- a spelling-only drill app
- a system that treats every mistake as a learning gap
- a system that replaces parent judgement
- a system where every detected issue automatically becomes a lesson

The system is designed to protect against over-teaching. The child should first be given the chance to correct their own work. Only unresolved, repeated, or parent-confirmed issues should become durable learning issues.

## Future-capable system framing

Scarlett's Spells should be architected as a future-capable English/literacy learning system, while the MVP remains deliberately narrow.

The full future system is designed to support:
- multiple capability areas
- authentic project work
- parent-mediated review
- mastery tracking
- targeted practice
- review scheduling

However, the canonical MVP implements only the Writing-specific loop first, with Mastery Domain 4: Spelling and Orthographic Knowledge as the first deeply instantiated mastery domain.

The guiding architecture principle is:

```text
Future architecture: broad enough for multiple capabilities.
MVP implementation: narrow enough to prove one complete learning loop.
```

The system should therefore avoid two opposite mistakes:

1. Overbuilding all capability areas before the core loop is proven.
2. Hard-coding the product so tightly around spelling that future Reading, Speaking, Listening, Research / Media, and broader project-based learning become difficult later.

## Future-capable learning system

The full system should be understood as:

```text
Learning System
├── 1. Ultimate Outcome Layer
├── 2. Capability Layer
├── 3. Authentic Work / Project Context Layer
├── 4. English / Literacy Mastery Domain Layer
├── 5. Strand / Skill Family Layer
├── 6. Micro-skill Layer
├── 7. Parent Review and Evidence Layer
├── 8. Durable Issue Layer
├── 9. Targeted Lesson and Practice Layer
├── 10. Mastery Profile Layer
└── 11. Review and Progression Layer
```

These are system-level layers, not all MVP implementation requirements.

### 1. Ultimate Outcome Layer

The ultimate outcome is the long-term educational purpose of the product:

```text
Independent learner, thinker, communicator, creator, and contributor
```

### 2. Capability Layer

Capability areas are broad modes of learning and communication.

Future capability areas may include:

```text
Writing
Reading
Speaking
Listening
Research / Media
```

For MVP, only Writing is implemented deeply.

### 3. Authentic Work / Project Context Layer

Life-skill projects are the authentic context in which capabilities are practised.

A life-skill project may produce evidence across several capability areas.

Examples:

| Life-skill project | Possible capability evidence |
|---|---|
| Write a thank-you letter | Writing, vocabulary, spelling, punctuation |
| Research a pet | Reading, research/media, writing |
| Explain how to bake a cake | Speaking, sequencing, vocabulary |
| Plan a birthday party | Writing, planning, maths, communication |
| Write a complaint email | Writing, reasoning, tone, punctuation |

Life-skill projects are not simply another spelling category. They are the meaningful context that produces authentic evidence.

### 4. English / Literacy Mastery Domain Layer

The 12 English/literacy mastery domains define the full future curriculum map.

| No. | Mastery Domain | Primary capability links |
|---:|---|---|
| 1 | Oral language and listening comprehension | Listening, Speaking, Reading, Writing |
| 2 | Phonological and phonemic awareness | Early Reading, Spelling, Oral Language |
| 3 | Phonics and decoding | Reading |
| 4 | Spelling and orthographic knowledge | Writing, Spelling, Reading support |
| 5 | Reading fluency | Reading |
| 6 | Vocabulary and morphology | Reading, Writing, Speaking, Listening |
| 7 | Grammar and sentence structure | Writing, Reading, Speaking |
| 8 | Reading comprehension | Reading |
| 9 | Written composition | Writing |
| 10 | Rhetoric, argument, and reasoning | Writing, Speaking, Reading |
| 11 | Literature, genre, and cultural knowledge | Reading, Writing, Speaking |
| 12 | Research, media, and information literacy | Research / Media, Reading, Writing |

These 12 are the canonical top-level English/literacy mastery domains.

### 5. Strand / Skill Family Layer

A strand or skill family is a coherent group of related skills inside a mastery domain.

Illustrative example inside Domain 4:

```text
Phoneme-grapheme spelling
Common spelling patterns
Morphology
Homophones
Proofreading
```

### 6. Micro-skill Layer

A micro-skill is the smallest teachable, testable, reviewable unit in the system.

Illustrative examples:

```text
Spell final /ai/ words with ay.
Choose there/their/they're by sentence meaning.
Identify the main idea in a short paragraph.
Use evidence from a source when writing a simple explanation.
```

Canonical naming at overview level:
- use `micro-skill`
- do not introduce competing internal synonyms here

### 7. Parent Review and Evidence Layer

This layer captures the parent-mediated review gate.

It includes:
- parent detection of possible issues
- parent marking of concerns
- child correction attempts
- parent confirmation of outcomes
- preserved evidence from authentic work

### 8. Durable Issue Layer

This layer preserves reviewed learning concerns that should survive reanalysis and feed later learning decisions.

It includes:
- possible issue history
- resolved slips
- durable learning issues
- linked micro-skills
- evidence lineage over time

### 9. Targeted Lesson and Practice Layer

This layer turns linked micro-skills into focused support.

It may include:
- targeted lessons
- practice items
- child attempts
- independent correction
- practice-route choice

### 10. Mastery Profile Layer

This layer represents the child's developing learning profile across skills.

It should ultimately preserve:
- active strengths
- fragile skills
- secure skills
- evidence history
- domain-level patterns

### 11. Review and Progression Layer

This layer controls how learning is revisited over time.

It includes:
- review due dates
- spaced practice expectations
- progression from fragile to secure performance
- parent-facing progress visibility

## Taxonomy hierarchy

The taxonomy answers:

```text
What skill is being learned?
```

The stable taxonomy hierarchy is:

```text
Ultimate Outcome
-> Capability Area
-> Mastery Domain
-> Strand / Skill Family
-> Skill Cluster, where useful
-> Micro-skill
-> Prerequisite Links
-> Related / Encompassed Skills
```

Taxonomy levels classify what the skill is.
They do not classify how independently or reliably the child can use it.

Detailed taxonomy rules, naming constraints, and cross-domain hierarchy semantics belong in [docs/pedagogy/micro-skill-taxonomy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/micro-skill-taxonomy.md:1), not here.

The canonical distinction matrix for taxonomy, competency, issue classification, and lifecycle state also lives in the taxonomy doc and should be treated as the shared source of truth.

## Competency Levels 1–5

The competency level answers:

```text
How independently and reliably can the child use that skill?
```

Competency levels sit alongside micro-skills.
They do not replace the taxonomy.

Canonical rule:

```text
Taxonomy levels classify what the skill is.
Competency levels classify how well the child can use it.
```

| Level | Competency stage | Meaning |
|---:|---|---|
| 1 | Recognition / exposure | Child has been introduced to the skill and may recognise it with support |
| 2 | Guided correction | Child can correct or apply the skill with prompting, reminders, or marked support |
| 3 | Independent controlled use | Child can use the skill independently in a targeted lesson or controlled practice |
| 4 | Transfer to authentic work | Child can apply the skill in real writing, not just in drills |
| 5 | Secure, fluent, and retained mastery | Child uses the skill accurately over time, across contexts, and after review delays |

Detailed competency interpretation inside the first deep domain belongs in [docs/pedagogy/mastery-domain-4-spelling.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/mastery-domain-4-spelling.md:1).

## Relationship to issue classification and lifecycle

Keep these concepts separate and defer to the canonical matrix in [docs/pedagogy/micro-skill-taxonomy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/micro-skill-taxonomy.md:1).

## MVP narrowing rule

The architecture is broad enough for multiple capabilities, but the current implementation remains deliberately narrow.

Current canonical MVP stance:
- Writing is the first deeply implemented capability
- Spelling and Orthographic Knowledge is the first deeply instantiated mastery domain
- parent review remains the canonical gate
- not every mistake becomes a durable issue
- not every durable issue becomes an immediate separate lesson
- AI is not part of canonical MVP diagnosis

This means the overview should be future-capable without pretending that all future capability areas are already live.

## MVP taxonomy subset

The MVP implements:

```text
Capability Area:
Writing

First deep Mastery Domain:
4. Spelling and Orthographic Knowledge

Allowed MVP taxonomy depth:
Mastery Domain
-> Strand / Skill Family
-> optional Skill Cluster
-> Micro-skill
```

Deferred:

```text
Other capability areas
Full multi-domain routing
Broad cross-domain assignment generation
Deep implementations of all 12 English/literacy mastery domains
```

## Documentation ownership boundaries

This overview owns:
- the product thesis
- the future-capable system structure
- the top-level curriculum spine
- the relationship between authentic work, evidence, practice, and mastery

The taxonomy doc owns:
- cross-domain taxonomy rules
- hierarchy semantics
- naming and stability rules

The Domain 4 spelling doc owns:
- spelling pedagogy
- developmental foundations
- domain-specific hierarchy, evidence, and route fit

The targeted-writing contract owns:
- issue lifecycle rules
- final classifications
- Golden Nugget creation
- `writing_issues` to `learning_items` transition

The micro-skill assignment contract owns:
- `micro_skill_key` rules
- assignment-unit rules
- grouping rules
- allowed practice routes
- mastery evidence fields
- legacy projection limits

The reward contract owns:
- progress-state semantics
- Gold Bar and Gold Coin rules

The universal progress contract owns:
- submitted, approved, returned, and complete workflow meanings
