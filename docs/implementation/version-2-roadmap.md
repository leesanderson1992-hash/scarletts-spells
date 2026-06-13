# Version 2.0 Roadmap

## Purpose

This is the active Version 2.0 roadmap for Scarlett's Spells after the private
parent-led MVP.

It turns the proven parent-review loop into a reliable daily learning loop with
accelerated spelling-engine population.

Controlling context:
- [docs/current-priorities.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/current-priorities.md:1)
- [docs/workflows/mvp-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/mvp-workflow.md:1)
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- [docs/contracts/canonical-spelling-word-map-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/canonical-spelling-word-map-contract.md:1)
- [docs/contracts/parent-recommended-canonical-mapping.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/parent-recommended-canonical-mapping.md:1)
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/operations/supabase-migration-policy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/operations/supabase-migration-policy.md:1)

This roadmap is documentation only at registration. It does not authorize
runtime code, migrations, resolver behavior changes, Review Work behavior
changes, assignment-generation changes, reward changes, mastery changes,
dashboard changes, analytics changes, scoring changes, or template-routing
changes.

## 1. Version 2.0 goal

Reviewed writing becomes verified learning evidence; verified learning gaps become calm daily practice; repeated spelling evidence rapidly becomes reviewable child-local or admin-canonical mapping suggestions without weakening truth boundaries.

## 2. Product problem

The private MVP proves the parent-review loop:
- child completes structured lesson/test work or parent enters writing through
  `Add Writing Sample`
- `Review Work` is the canonical parent review surface
- parent can inspect engine suggestions and parent-added missed words
- parent can approve, reject, override, send back, and finalise returned
  corrections
- child retry and returned correction evidence are supported
- verified learning gaps can become `learning_items`
- parent-facing progress remains advisory, not automatic mastery truth

Version 2.0 must turn that loop into a daily learning system:

`reviewed writing -> child correction -> verified learning gap -> targeted daily practice -> spaced review -> fresh writing transfer evidence`

The next bottleneck is not parent trust. It is throughput:
- too much manual parent classification
- too little automatic/ranked micro-skill suggestion
- insufficient reusable spelling mapping coverage
- daily practice is not yet strong enough as the child-facing learning habit

Manual classification currently slows engine population:

`wrong spelling -> correct spelling -> choose micro-skill -> promote/recommend/categorise`

Version 2.0 must reduce that workload without letting unreviewed evidence
become truth.

## 3. Version 2.0 pillars

- Daily Assignment Practice: make daily spelling practice a calm, predictable
  child habit sourced from active child-specific `learning_items`.
- Engine Population Acceleration: identify repeated spelling evidence and move
  it into reviewable child-local or admin-canonical mapping workflows faster.
- Stronger Spelling Classification: provide ranked micro-skill suggestions so
  parent/admin review becomes confirmation, not taxonomy hunting.
- Trustworthy Evidence and Mastery Boundaries: preserve parent verification,
  learning-gap creation rules, advisory mastery wording, and transfer evidence
  requirements.
- Controlled Backlog and Child-Calm UX: show the child today's manageable work,
  not every discovered issue.
- Admin/Canonical Curation Safety: keep canonical adoption explicit, audited,
  reversible, and separate from resolver visibility.

## 4. In scope

- daily practice from existing active child-specific `learning_items`
- `assignment_items` as the generated practice delivery surface
- small capped daily practice set
- due reviews before new items
- 1-3 new Nuggets per day
- grouping repeated issues by `micro_skill_key`
- spelling-engine population audit
- ranked micro-skill suggestion helper
- child-local mapping reuse after parent approval/promotion
- admin review/adoption of high-confidence canonical mappings
- bulk candidate mapping import/review workflow
- canonical word-map content used only as supporting content for already-active
  `learning_items` or reviewable mapping suggestions
- false-positive and word-level-only handling as review outcomes
- operator/admin tools to identify top spelling mapping gaps

## 5. Out of scope for first Version 2 slices

- broad AI diagnosis
- automatic mastery
- reward expansion
- new writing domains
- grammar/punctuation/proofreading expansion
- resolver-visible global mappings by default
- hosted historical backfill
- parent free-text micro-skill creation
- raw `misspelling_instances` becoming reusable truth
- open catalog-review cases becoming resolver truth
- word-map rows creating `learning_items` or `assignment_items` by themselves

## 6. Truth boundaries

- raw `misspelling_instances` are evidence only
- parent-added missed words are evidence only
- pending candidate mappings are not reusable
- parent-local promoted mappings may be reused only inside the same
  parent/child scope
- PCRM recommendation evidence remains evidence only until explicit admin
  adoption
- accepted PCRM evidence is not automatically canonical truth
- canonical/global spelling mappings require explicit admin adoption
- resolver visibility remains explicit, audited, reversible, and separately
  gated
- word-map rows are content metadata, not mastery, resolver, taxonomy, or
  assignment truth
- only verified learning gaps create or strengthen `learning_items`
- daily practice draws from curated active `learning_items`, not the full raw
  backlog

## 7. Proposed Version 2 slice order

### Slice 0 - Version 2 roadmap registration

Goal:
- create this roadmap doc
- optionally add a short pointer from `docs/current-priorities.md`
- no runtime code
- no migrations

Hard boundary:
- this slice is documentation only

### Slice 1 - Read-only spelling-engine population audit

Status: `implemented as read-only operator audit script`

Goal:
- produce a ranked view of the highest-leverage ways to populate the spelling
  engine

Audit:
- unresolved spelling pairs
- unknown micro-skill rows
- repeated misspelling -> correction pairs
- repeated correction targets
- repeated pattern/micro-skill candidates
- parent-added rows not yet reusable
- parent-local mappings that might merit admin canonical review
- open catalog-review cases
- accepted/unadopted PCRM recommendations
- word-level-only candidates
- likely false positives
- missing D4 micro-skill coverage
- top 50 suggested mapping/micro-skill seed opportunities

Hard boundary:
- read-only only
- no mutations
- no resolver changes

Implementation closeout:
- added `scripts/writing-engine-spelling-population-audit.ts`
- added `npm run writing-engine:spelling-population-audit`
- audit reads spelling evidence, parent-local mappings, catalog-review cases,
  PCRM recommendations when available, canonical mappings, D4 catalog rows,
  learning items, and word-map metadata when available
- audit emits JSON only and treats every opportunity as review-only candidate
  evidence
- hosted/non-local reads require
  `SPELLING_POPULATION_AUDIT_ALLOW_HOSTED_READ_ONLY=true`
- read-only client guard refuses `rpc`, `insert`, `update`, `upsert`, and
  `delete`
- protected table counts are read before and after the audit to confirm the
  script did not mutate the audited database
- no runtime code, migrations, resolver behavior, Review Work behavior,
  assignment generation, rewards, mastery, dashboards, analytics, scoring, or
  template routing changed

Run:

```sh
npm run writing-engine:spelling-population-audit
```

For an explicitly approved hosted read-only audit, set:

```sh
SPELLING_POPULATION_AUDIT_ALLOW_HOSTED_READ_ONLY=true
```

### Slice 2 - Ranked micro-skill suggestion helper

Goal:
- for a spelling pair, propose the top likely micro-skills so the parent/admin
  confirms instead of manually searching the taxonomy

Input:
- child spelling
- correction
- optional sentence/context
- existing `micro_skill_catalog`
- canonical word-map metadata where safe
- existing canonical mappings
- parent-local mappings where scoped
- historical reviewed evidence

Output:
- top 3 suggested active assignable D4 micro-skills
- confidence
- reason
- fallback: no matching skill / word-level only / likely false positive

Hard boundary:
- suggestion only
- does not create truth

### Slice 3 - Parent review UX acceleration

Goal:
- in `Review Work`, replace manual taxonomy hunting with ranked suggestions
  and one-click confirmation where safe

Parent actions:
- accept suggested skill
- choose different skill
- not a learning issue
- false positive
- no matching skill
- recommend pairing for admin review where eligible

Hard boundary:
- parent approval creates event truth and may create/promote scoped child-local
  mappings only under existing rules
- no global canonical truth

### Slice 4 - Bulk candidate mapping import/review

Goal:
- allow admin/operator to import or generate batches of candidate spelling
  mappings for review

Input shape:
- misspelling
- correction
- `suggested_micro_skill_key`
- confidence
- source
- note/provenance

Output:
- reviewable candidate/recommendation rows
- no resolver-visible truth by default
- audit trail preserved

Hard boundary:
- bulk import must not write resolver-visible canonical mappings directly

### Slice 5 - Child-local reuse and suggestion improvement

Goal:
- once the parent approves/promotes a mapping for the child, the engine reuses
  it automatically within the same parent/child scope

Hard boundary:
- child-local reuse only
- no global reuse unless admin canonical adoption and resolver visibility are
  separately enabled

### Slice 6 - Daily spelling practice generation hook

Goal:
- generate a calm daily practice set from active `learning_items`

Rules:
- due reviews first
- 1-3 new Nuggets per day
- group by `micro_skill_key`
- use `assignment_items`
- use word-map content only as supporting content for existing active
  `learning_items`
- avoid overwhelming the child
- no automatic mastery claims

### Slice 7 - Child daily practice surface

Goal:
- make `/learn/week` or child home show the daily spelling-practice block
  clearly

UX:
- today's practice
- due review
- new Nuggets
- short optional transfer task
- simple completion state
- no scary backlog

### Slice 8 - Admin canonical adoption hardening

Goal:
- make the best reviewed mappings safely canonical where appropriate

Include:
- accepted/unadopted PCRM review
- catalog-review canonical mappings
- conflict blocking
- resolver visibility still separate and explicit
- audit events
- rollback/disable path

## 8. Safety and migration rules

- do not run broad `db push`
- any DB-changing slice requires a unique timestamp migration
- production/hosted migration-ledger safety must be checked before DB-changing
  work
- no hosted destructive cleanup without explicit approval
- no service-role exposure to client components
- parent-scoped RLS must remain parent-scoped
- admin reads/writes must remain server-only and allowlist-protected for
  private MVP

## 9. Success metrics

- parent classification time per spelling row reduced
- percentage of rows with ranked suggested micro-skill
- percentage of parent accepted suggestions
- number of repeated pairs resolved child-locally
- number of admin canonical mappings adopted
- number of daily practice items generated from verified `learning_items`
- child completes daily spelling practice in 10-20 minutes
- no increase in false-positive resolver reuse
- no unreviewed raw evidence becomes reusable truth

## 10. First implementation prompt after roadmap

Recommended next slice:

`Read-only spelling-engine population audit`

Exact prompt:

```md
Adopt the role of a senior Supabase/Next.js architecture reviewer, spelling-engine data auditor, and learning-science-aware product engineer for Scarlett's Spells.

Implement Version 2.0 Slice 1 only: Read-only spelling-engine population audit.

Use these docs as controlling context:
- docs/implementation/version-2-roadmap.md
- docs/current-priorities.md
- docs/implementation/writing-engine-roadmap.md
- docs/implementation/targeted-writing-practice-status.md
- docs/contracts/writing-engine-mastery-and-evidence-contract.md
- docs/contracts/targeted-writing-practice-contract.md
- docs/contracts/micro-skill-taxonomy-and-assignment-contract.md
- docs/contracts/canonical-spelling-word-map-contract.md
- docs/contracts/parent-recommended-canonical-mapping.md
- docs/architecture/writing-engine-canonical-brief.md
- docs/architecture/targeted-writing-practice-architecture.md
- docs/operations/supabase-migration-policy.md

Goal:
Produce a ranked, read-only view of the highest-leverage ways to populate the spelling engine without changing resolver truth or weakening parent/admin review boundaries.

Audit:
- unresolved spelling pairs
- unknown micro-skill rows
- repeated misspelling -> correction pairs
- repeated correction targets
- repeated pattern/micro-skill candidates
- parent-added rows not yet reusable
- parent-local mappings that might merit admin canonical review
- open catalog-review cases
- accepted/unadopted PCRM recommendations
- word-level-only candidates
- likely false positives
- missing D4 micro-skill coverage
- top 50 suggested mapping/micro-skill seed opportunities

Hard boundaries:
- read-only only
- no runtime behavior changes
- no resolver changes
- no Review Work behavior changes
- no assignment generation changes
- no migrations
- no writes to Supabase data unless a later slice explicitly authorizes them
- no unreviewed raw evidence becomes reusable truth

Return:
1. Files changed.
2. Audit surfaces added.
3. Data sources read.
4. Safety boundaries preserved.
5. How to run the audit.
6. Suggested first 50 mapping/micro-skill seed opportunities if available.
7. Risks or follow-up cleanup recommendations.
```

## Later cleanup candidates

- Consider marking older roadmap/status documents as historical only after
  Version 2.0 becomes the accepted single active planning surface.
- Do not archive files as part of Slice 0.
- Keep any cleanup separate from implementation slices that change runtime or
  database behavior.
