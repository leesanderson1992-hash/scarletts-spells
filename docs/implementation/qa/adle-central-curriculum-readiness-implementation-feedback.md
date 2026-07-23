# ADLE Central Curriculum Readiness — Implementation Feedback

Date: 2026-07-23

## Completed locally; pending narrow commit

The read-only central readiness foundation has been implemented.

- Added a pure resolver that inspects approved mappings and active ADLE
  learning items independently, then groups resolvable work by
  `canonical_word_id + micro_skill_key`.
- Preserved mapping and learning-item lineage as source-level evidence rather
  than merging distinct misspellings, children, mappings, or items.
- Kept these decisions separate in the output:
  - mapping validity;
  - mapping intake usability;
  - learning-item validity;
  - learning-item selectability;
  - route compatibility;
  - route activation;
  - route selection/content readiness;
  - shared-route integrity.
- Added a declarative implementation registry for Base Word Lab, Dynamic
  Prefix Word Lab, and the legacy fixed `un-` route. It describes registered
  versus legacy render-only code; it is not activation authority. The legacy
  route can remain render-compatible but cannot become ready for a new
  assignment.
- Defined a supplied-fact boundary for existing Base Word and Dynamic Prefix
  selectors. Their adapters remain outside this narrow commit so the resolver
  does not depend on unrelated uncommitted route work.
- Added shared-word evaluation using the existing shared-route model. An
  unscheduled word may still receive its first-exposure route. Once an active
  multi-route review schedule exists, incomplete explicit links fail closed
  with `SHARED_ROUTE_LINKAGE_MISSING`; linked words retain the newest
  activation route and strictest sentence-context requirement.
- Route-content facts are scoped to canonical word, micro-skill, route,
  route version, and a dependency fingerprint. Observed activation facts are
  likewise scoped to micro-skill, route, route version, and environment.
- Added a server-only loader that uses select-only keyset pagination for
  mappings, dictionary facts, active learning items, lineage, schedules, and
  route links. The loader does not call RPCs or write to Supabase.
- Added deterministic sorting for source inspections, targets, routes,
  evidence, and blockers.

## Verification completed

`npm run adle:curriculum-readiness-regression` passes.

The regression covers:

- two misspellings for the same canonical word but different micro-skills;
- inspection of every active item, including a resolved item that is no longer
  selectable;
- first-exposure readiness before a review schedule exists;
- incomplete links blocking existing shared-review integrity without blocking
  first-exposure assignment readiness;
- valid explicit shared links restoring review readiness;
- route-specific content isolation and micro-skill-specific activation;
- newest shared route and strictest context preservation;
- byte-identical output when mapping and item input order is reversed;
- registry validation.

A focused strict TypeScript compile of the new resolver, registry, selector
adapters, loader, and regression also passes.

## Remaining integration boundary

The loader deliberately accepts observed route activation, exact route-scoped
content, and existing-selector results as read-only supplied facts. A caller
should obtain those facts from the established Base Word and Dynamic Prefix
loaders, then pass them to `resolveCurriculumReadinessInventory`.

This keeps the central resolver from duplicating selector logic or treating a
registry entry as activation authority. Until a caller supplies an exact
route-scoped content fact and selector result, the resolver fails closed with
named blockers rather than reporting a target ready.

## Safety confirmation

No migration, import, route activation, feature-flag change, mapping change,
learning-item write, schedule write, assignment creation, evidence write,
reward change, or production mutation was performed.
