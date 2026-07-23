# ADLE Central Curriculum Readiness Resolver and Mapped-Target Inventory Plan

Status: central resolver and the Base Word Lab fact adapter/inventory are
committed. The resolver remains a bounded read-only diagnostic; broad future
route coverage and curriculum population are paused.

## Base Word Lab adapter boundary

The first route adapter supplies facts only for `base_word_lab:v2` and the two
catalogued Base Word micro-skills. It reads approved dictionary, support,
content-version, family, family-member and dictation facts, then delegates
child queue selection to `selectBaseWordFamilyLesson`. The target fact answers
whether the exact word is structurally complete. The selection fact answers
whether the child currently has the selector's two authentic targets and four
transfer words. Neither answer enables a route or writes an assignment.

The adapter reports the existing Base Word environment and child allowlist
gates as observed activation facts, including the child scope whenever a pilot
gate is child-specific. Route registry metadata remains capability metadata,
never production activation authority. The companion inventory is select-only
and emits canonical JSON; it has no RPC or mutation boundary.

## 1. Purpose

Build one exhaustive, deterministic read model that answers:

1. Is each approved spelling mapping a valid, traceable correction identity?
2. Is each active ADLE learning item internally valid and traceable?
3. Which registered ADLE lesson routes are compatible with each canonical
   word and micro-skill target?
4. Which compatible routes are activated?
5. Is a new assignment genuinely ready now, and if not, which dependencies
   block it?

The central curriculum-work identity is:

```text
canonical_word_id + micro_skill_key
```

This identity deduplicates dictionary, content, and route-readiness work. It
does not merge children, misspellings, mapping decisions, learning items,
sources, or review evidence.

Route readiness is more specific. Every reusable dependency check is scoped
by:

```text
canonical_word_id + micro_skill_key + route_id + route_version
```

and records a dependency fingerprint so a complete route cannot accidentally
make another compatible route ready.

Mapping truth is intentionally narrower than lesson readiness. Missing exact
word-to-micro-skill support is reported as curriculum completeness, not as a
defect in an otherwise approved correction relationship. The stricter runtime
intake gate remains separately owned by `canonical-intake.ts`.

The resolver reports shared canonical baseline completeness separately: active
approved canonical identity and banding presence. It does not claim to author
or infer definitions, morphology, word sums, dictation, family data, or
route-specific content; those remain explicit curriculum and route facts.

Route narrowing and broader future-route interpretation remain a separate
follow-up. This correction changes source and curriculum decision boundaries
only; it does not alter route coverage or assignment interpretation.

This slice is inspection only. It must not add or apply migrations, import
dictionary content, activate a route or profile, create or alter mappings,
create or alter learning items, compose assignments, reconcile shared routes,
or mutate production.

## 2. Existing authority reused by this slice

The resolver must consume existing facts and call existing pure rules. It must
not establish a second source of curriculum truth.

| Concern | Existing authority |
|---|---|
| Canonical word and reviewed teaching facts | Teaching Dictionary tables and their current row/review statuses |
| Mapping-to-target intake rules | `lib/adle/canonical-intake.ts` |
| Learning-item states and ordering | `lib/adle/learning-items.ts` |
| Base Word Lab compatibility and selection | `lib/adle/base-word-family-selection.ts` |
| Dynamic Prefix compatibility and selection | `lib/adle/morphology/dynamic-prefix-word-lab.ts` and its dictionary-first profile loader |
| Shared canonical-word review policy | `lib/adle/shared-word-routes.ts` |
| Route implementation capability | the uncommitted ADLE route registry, supplied to the resolver as data |
| Environment and child gates | existing route-gate and guarded-access helpers |

`docs/implementation/adle-current-state-and-release-registry.md` remains the
operational explanation of route state. Runtime code must not parse Markdown.
The implementation should consume the corresponding side-effect-free registry
value or adapter from the uncommitted route-registry work. If that code value
does not yet exist, adding it belongs to the route-registry slice, not this
one.

## 3. Non-goals and safety boundary

The implementation may add pure types, pure resolvers, read-only loaders, a
read-only CLI/report, and regression tests. It may not:

- call an intake, import, persistence, completion, reconciliation, promotion,
  enablement, assignment, evidence, scheduling, reward, or learner-write RPC;
- update `resolver_visibility_status`, `production_enabled`, feature flags,
  allowlists, catalog state, or review state;
- manufacture a canonical word, micro-skill, dictionary support row, family
  member, prefix member, transfer word, route, or learning item;
- treat `in_review`, hidden, staging-only, legacy-only, rejected, superseded,
  or awaiting-content facts as assignment-ready;
- substitute a same-skill support word for the learner's exact canonical
  target;
- collapse two micro-skills for the same canonical word into one curriculum
  target;
- log raw `source_attempt_text`.

The production adapter must expose only database reads. The executable should
fail at startup if configured with an operation list containing a write or
RPC.

## 4. Four independent decisions

The output must not use one overloaded `eligible` flag. Every source row and
target reports the following decisions separately.

### 4.1 Mapping validity

Mapping validity asks whether an approved spelling mapping is a sound,
traceable pointer to an existing canonical curriculum target. It does not ask
whether a lesson route is live.

For every approved parent-local candidate mapping and every approved global
canonical mapping in scope, report `READY` or `BLOCKED` under the `validity`
field. Also report
`intakeUsability` separately, because valid canonical truth may deliberately
remain hidden from the runtime resolver.

A valid mapping requires:

- a recognised approved status for its authority type;
- non-empty, different normalised misspelling and correction values;
- the mapping's original id, authority type, scope, source ids, and
  micro-skill key;
- exactly one active Teaching Dictionary word matching the normalised
  correction;
- an existing active, assignable D4 catalog micro-skill;
- exact approved non-contrast word support for
  `canonical_word_id + micro_skill_key`;
- for a global canonical mapping, active mapping status and no incompatible
  active exact-pair identity;
- for a parent-local promoted mapping, matching parent and child scope without
  requiring global resolver visibility.

Dictionary content completeness, route activation, queue thresholds, and
child-band eligibility are not mapping-validity tests. They are later
dependencies. Global resolver consumption is also a separate mapping-level
decision: it requires visible status, a matching visibility-enable event, no
conflicting visible exact-pair or same-misspelling mapping, and the existing
resolver-visible-mappings feature gate. A hidden but otherwise coherent
canonical mapping is therefore valid mapping truth but is not currently
intake-usable.

An approved mapping that cannot identify one target still receives its own
inventory record and blocker evidence. It must not disappear because it
cannot be grouped under a target key.

### 4.2 Learning-item validity

Learning-item validity asks whether an existing `row_status = active` ADLE
learning item has a coherent identity and lineage. It is not the same as
selectability.

Inspect every active row, including `resolved`, `in_lesson`,
`awaiting_review_outcome`, and `paused_parent_review`; do not pre-filter to the
two selectable statuses.

A valid item requires:

- an existing child, canonical Teaching Dictionary word, and catalog
  micro-skill;
- a D4, active, assignable micro-skill;
- a recognised item status and source kind;
- a non-empty source reference;
- no second active item for the same
  `child_id + canonical_word_id + micro_skill_key`;
- for `verified_misspelling`, at least one matching
  `adle_learning_item_sources` lineage row whose child, word, skill, candidate
  mapping, canonical mapping when present, and normalised pair agree;
- for non-mapping sources, the source-specific reference required by the
  existing learning-item contract.

A historically valid learning item does not become invalid merely because a
global mapping is later hidden or a route is deactivated. Those changes affect
current route/assignment readiness, while the attached source row preserves
the original intake authority.

Item selectability is reported separately:

```text
SELECTABLE = row_status active AND item_status in (pending, pending_reteach)
```

The item remains visible with a named state blocker when it is valid but not
selectable.

### 4.3 Route activation

Route activation asks whether a compatible registered route may generate a
new assignment in the current deployment and child scope. It does not prove
that the target or the route's whole lesson cohort is ready.

For every compatible registered route and micro-skill, report each observed
gate independently. Activation facts are keyed by:

```text
micro_skill_key + route_id + route_version + environment
```

The registry describes code capability only; it never states that production
is active.

Report each gate independently:

- registry implementation state (`registered` or `legacy_render_only`);
- route-level environment gate;
- profile/family production flag where applicable;
- child allowlist or guarded-pilot gate where applicable;
- `newAssignmentCapable` from the registry.

`legacy_pilot` may remain render-compatible for immutable historical snapshots
but must report inactive for new assignment. A global environment flag must
not override a disabled profile. A production-enabled registry entry must not
override a closed environment or child gate.

### 4.4 Assignment readiness

Assignment readiness is `READY` only when at least one compatible route:

- has a valid target pair;
- has at least one valid, selectable authentic learning item for the relevant
  child when the route requires one;
- has all route-specific reviewed Teaching Dictionary dependencies;
- passes the existing route selector with the full child queue, not just the
  current row;
- is activated for new assignment in the current environment and child
  scope;
- satisfies child banding and route-specific content requirements;
- for a review activity or existing shared schedule, preserves complete
  explicit shared-word route linkage;
- can compile its immutable payload/read model through the existing pure
  compiler where one exists.

Mapping validity alone never means `READY`. Learning-item validity alone never
means `READY`. Route activation alone never means `READY`.

## 5. Inventory topology

The read model needs three lossless views.

### 5.1 Source records

One record per inspected approved mapping and one record per inspected active
learning item. This proves exhaustive coverage and preserves lineage.

```ts
type SourceInspection =
  | {
      kind: "mapping";
      mappingAuthority: "parent_local" | "global_canonical";
      mappingId: string;
      lineage: MappingLineageEvidence;
      validity: Decision;
      intakeUsability: Decision;
      targetKey: string | null;
    }
  | {
      kind: "learning_item";
      learningItemId: string;
      childId: string;
      lineage: LearningItemLineageEvidence[];
      validity: Decision;
      selectability: Decision;
      targetKey: string;
    };
```

Misspelling lineage includes the mapping/source ids, authority and scope,
normalised misspelling, normalised correction, micro-skill, verification
timestamp, and source reference. `source_attempt_text` stays excluded from
normal reports and logs.

### 5.2 Deduplicated curriculum targets

All resolvable mappings and all active learning items feed a map keyed by:

```ts
canonicalTargetKey(canonicalWordId, microSkillKey)
```

Each target retains arrays of mapping ids, learning-item ids, child ids, and
lineage refs. Arrays are unique and lexicographically sorted. Curriculum
dependencies and route evaluations run once per target key, while
child-specific assignment evaluations run once per target key and child.

### 5.3 Shared canonical-word groups

Separately group active unresolved items by:

```text
child_id + canonical_word_id
```

This view preserves multiple `canonical_word_id + micro_skill_key` targets for
the same spelling. It calls `resolveSharedWordReviewPolicy` with every active
item and every explicit active schedule route in stable attachment order.

An unscheduled canonical word may receive its first-exposure lesson without
explicit review links. Once an active multi-route review schedule exists, a
missing or incomplete link set reports `SHARED_ROUTE_LINKAGE_MISSING`; do not
infer that one route replaces another.
When links exist, retain:

- every linked learning-item id and micro-skill key;
- the newest attached micro-skill as the activation cue;
- the strictest `requiresSentenceContext` value;
- the schedule-word and linkage ids used as evidence.

For a not-yet-scheduled word, the result may include a deterministic
`prospectiveRouteLinks` description. It is evidence for a later writer, not a
write instruction and not proof that linkage already exists.

## 6. Registered-route contract

The resolver must iterate the complete supplied registry. It must not use a
`switch` that silently knows only today's Base Word and Dynamic Prefix routes.

```ts
interface CurriculumRouteDefinition {
  routeId: string;
  routeVersion: string;
  supportedMicroSkillKeys: readonly string[];
  newAssignmentCapable: boolean;
  implementationState: "registered" | "legacy_render_only";
  compatibility(
    target: CanonicalTargetFacts,
    facts: ResolverFacts,
  ): Decision;
  activation(
    context: DeploymentAndChildContext,
    facts: ResolverFacts,
  ): Decision;
  readiness(
    target: CanonicalTargetFacts,
    childId: string,
    facts: ResolverFacts,
  ): RouteReadiness;
}
```

Registry validation fails the whole report with evidence when route ids or
versions are duplicated, supported keys are unsorted/duplicated, a route has
no adapter, or an unknown release state appears. A missing adapter must never
look like “no compatible route”.

Compatibility is evaluated before activation and is retained even for
inactive routes. This makes the inventory useful for curriculum planning:
content may be structurally compatible while blocked only on approval or
activation.

Initial adapters wrap existing behavior:

- Base Word Lab calls `selectBaseWordFamilyLesson` with the entire child's
  active item set and all reviewed family/member facts. Its two-authentic-
  target threshold, family checks, six-word fill, complexity window, and
  deterministic ordering remain authoritative.
- Dynamic Prefix Word Lab evaluates each compatible registered profile
  independently by calling the existing selector with that one profile and
  the entire child item set. This prevents the current cross-profile winner
  selection from hiding blockers for other compatible profiles. A later
  ranking pass may call the full existing selector to identify the route that
  would win today.
- Fixed `un-` v1 is reported as historical render compatibility only when its
  registry entry is `legacy_pilot`; it cannot become new-assignment `READY`.
- Any remaining registered route gets its own adapter. A catalogued skill with
  no compatible registered route reports `NO_COMPATIBLE_REGISTERED_ROUTE`.

Adapters may translate existing selector skip reasons into central blocker
codes, but must retain the original selector reason and relevant fact ids in
evidence.

## 7. Dependency graph and blocker model

Every decision has exactly one of these shapes:

```ts
type Decision =
  | { status: "READY"; evidence: EvidenceRef[] }
  | { status: "BLOCKED"; blockers: Blocker[]; evidence: EvidenceRef[] };

interface Blocker {
  code: BlockerCode;
  stage:
    | "mapping_validity"
    | "learning_item_validity"
    | "item_selectability"
    | "target_content"
    | "route_compatibility"
    | "route_activation"
    | "route_selection"
    | "shared_route_integrity"
    | "inventory_integrity";
  dependency: string;
  evidence: EvidenceRef[];
}
```

Evidence references use stable identifiers and observed values, for example:

```json
{
  "source": "canonical_teaching_dictionary_prefix_members",
  "id": "member-id",
  "field": "review_status",
  "observed": "in_review",
  "required": "approved_for_first_exposure"
}
```

Evidence should identify facts, not copy whole rows. Sensitive attempt text is
never evidence.

The blocker vocabulary is a closed, versioned union. It should include the
existing canonical-intake and selector reasons without renaming away their
meaning, plus central integrity reasons such as:

- `APPROVED_MAPPING_TARGET_NOT_FOUND`
- `APPROVED_MAPPING_TARGET_AMBIGUOUS`
- `MAPPING_SCOPE_OR_AUTHORITY_INVALID`
- `MAPPING_LINEAGE_MISSING`
- `LEARNING_ITEM_IDENTITY_INVALID`
- `LEARNING_ITEM_LINEAGE_MISSING`
- `DUPLICATE_ACTIVE_LEARNING_ITEM`
- `LEARNING_ITEM_NOT_SELECTABLE`
- `TARGET_WORD_NOT_APPROVED`
- `TARGET_SKILL_SUPPORT_MISSING`
- `TARGET_CONTENT_INCOMPLETE`
- `TARGET_OUT_OF_CHILD_BAND`
- `NO_COMPATIBLE_REGISTERED_ROUTE`
- `ROUTE_NOT_PRODUCTION_ENABLED`
- `ROUTE_ENVIRONMENT_GATE_CLOSED`
- `ROUTE_CHILD_GATE_CLOSED`
- `ROUTE_SELECTOR_BLOCKED`
- `ROUTE_PAYLOAD_NOT_COMPILABLE`
- `SHARED_ROUTE_LINKAGE_MISSING`
- `REGISTRY_INVALID`
- `INVENTORY_SOURCE_CHANGED`
- `INVENTORY_COVERAGE_INCOMPLETE`

Do not choose a blocker by incidental query or array order. Return all
applicable blockers for a stage, then sort by:

```text
stage rank, blocker code, dependency, stable evidence key
```

An overall target is `READY` if any new-assignment-capable compatible route is
ready. Otherwise its blockers are the sorted union of target-level blockers
and every compatible route's blockers. Per-route results remain present so
one closed route cannot hide another route's readiness.

## 8. Exhaustive read-only loader

The current audit's fixed `.limit(...)` calls cannot prove “every”. Replace
them for this inventory with ordered, exhaustive keyset pagination.

Required source sets include:

- approved parent-verified candidate mappings in every approved status;
- approved/active canonical mappings and their visibility/audit events;
- every `row_status = active` ADLE learning item;
- every lineage row for those items;
- referenced children, canonical words, metadata, dictation, support,
  banding, content-version, catalog-skill, family/profile/member, schedule,
  and explicit route-link facts;
- the complete supplied route registry.

Rules:

1. Page by a stable unique key, normally `id`, with an explicit ascending
   order. Never rely on default database order.
2. Continue until an empty page; never treat a page-size result as completion.
3. Deduplicate only after recording duplicate source ids as an integrity
   error.
4. Record a source manifest containing row count, first id, last id, and a
   stable SHA-256 over the canonical projection used by the resolver.
5. Re-read the lightweight manifests after loading. If any relevant source
   changed during the run, return `INVENTORY_SOURCE_CHANGED` rather than a
   mixed-time readiness report.
6. Assert:

   ```text
   inspected approved mapping ids = loaded approved mapping ids
   inspected active learning-item ids = loaded active learning-item ids
   ```

   Any mismatch returns `INVENTORY_COVERAGE_INCOMPLETE`.
7. Keep database access in `server-only` loader code. Pure resolution receives
   a complete `ResolverFacts` value and has no client or environment reads.

No materialised view, cache table, trigger, RPC, or schema change is needed in
this slice.

## 9. Determinism rules

Given identical canonical input projections, registry version, deployment
context, child-band policy, and resolver version, output must be byte
identical.

- Canonicalise strings with the existing stored normalised values; do not
  invent a second normaliser.
- Use UTC ISO dates already stored in source facts.
- Sort source rows by stable id before projection.
- Sort targets by `canonical_word_id`, then `micro_skill_key`.
- Sort child evaluations by child id.
- Sort route results by registry route id and version.
- Reuse `compareOldestItemFirst` for learning-item age.
- Reuse route selectors' existing tie-breaks.
- Sort and deduplicate all evidence arrays.
- Do not emit `now()`, elapsed time, database return order, object insertion
  order, or environment secrets into the canonical report.
- Put observational metadata such as run time in a non-hashed envelope.

The report contains:

```text
schemaVersion
resolverVersion
registryVersion
inputManifestHash
coverage
sourceInspections[]
targets[]
sharedWordGroups[]
summary
```

## 10. Proposed implementation slices

### Slice A — pure contracts and registry validation

Add a focused module namespace such as:

```text
lib/adle/curriculum-readiness/types.ts
lib/adle/curriculum-readiness/blockers.ts
lib/adle/curriculum-readiness/registry.ts
```

Define the versioned output schema, stable keys, evidence projection,
canonical sorting, and registry validation. No loader and no environment reads
belong here.

Acceptance:

- duplicate target inputs fold under one target key without losing source ids;
- two micro-skills for one canonical word remain two target records;
- malformed registry input fails closed;
- permutations of the same facts produce byte-identical output.

### Slice B — source validity and lineage

Add pure mapping and learning-item inspectors. Refactor reusable checks out of
`resolveCanonicalIntakeReadiness` only where this can be done without changing
its current public behavior. Do not fork its approval rules.

Acceptance:

- every approved mapping produces one inspection record;
- every active learning item produces one inspection record;
- global and parent-local authority rules remain distinct;
- multiple misspellings targeting one word/skill remain visible under one
  target;
- a verified learning item with two valid lineage sources retains both;
- a hidden historical mapping does not erase valid item lineage;
- duplicate active child/word/skill items block explicitly.

### Slice C — Teaching Dictionary dependency projection

Project exact target-pair dependencies once per
`canonical_word_id + micro_skill_key`: word approval, catalog skill, exact
support, content version, metadata, dictation, banding, family/profile
membership, and assignment eligibility.

Acceptance:

- same-skill support for a different word cannot satisfy the target;
- in-review or inactive facts remain visible as evidence but cannot satisfy a
  ready dependency;
- no missing content is replaced or inferred.

### Slice D — route adapters and shared-route evaluation

Wrap Base Word, Dynamic Prefix, fixed legacy routes, and every other supplied
registry entry. Evaluate compatibility, activation, and readiness separately.
Call the shared-word policy for every child/canonical-word group with multiple
active unresolved routes.

Acceptance:

- every compatible registered route has a result, including inactive routes;
- Base Word readiness exactly matches its existing selector;
- every Dynamic Prefix profile is independently evaluated;
- the full Dynamic Prefix selector still identifies the deterministic current
  winner;
- legacy fixed `un-` is never ready for a new assignment;
- missing explicit shared links fail closed without discarding either route;
- newest linked route and strictest sentence-context requirement are retained.

### Slice E — exhaustive loader and report command

Add a service-role read-only loader and a CLI such as:

```text
npm run adle:curriculum-readiness-inventory
```

Default output is JSON to stdout or an explicitly named local output path. The
command performs no write RPC and no database mutation. A compact summary may
show counts by blocker, route, and target while the full report retains
evidence.

Acceptance:

- pagination fixtures larger than one page are fully inspected;
- zero approved mappings and zero active items are valid exhaustive results,
  not loader failure;
- source drift returns an integrity blocker and no `READY` report;
- counts reconcile exactly to inspected source ids;
- rerunning against unchanged fixtures produces an identical canonical JSON
  hash.

## 11. Regression matrix

At minimum, cover:

| Fixture | Expected result |
|---|---|
| Two approved misspellings, same word and skill | one target, two mapping lineage records |
| Same word, two skills (`plaiing` and `plaing` precedent) | two target keys; both lineages retained |
| Approved mapping, no active item | mapping inspected; target blocked for learner assignment |
| Active item, no mapping lineage, source is verified misspelling | item blocked with lineage evidence |
| Active probe/review item, no mapping | mapping not required; source-specific item rule applies |
| Resolved active-row item | item inspected and valid, but not selectable |
| Duplicate active child/word/skill items | explicit integrity blocker |
| Exact target support missing but same-skill support exists elsewhere | blocked; no substitution |
| Compatible route is staging-approved | compatibility reported; activation blocked |
| Route registry says production-enabled but environment gate is closed | activation blocked with both facts |
| Prefix profile disabled while global gate is open | activation blocked |
| Base Word has one authentic target | existing insufficient-target blocker retained |
| Base Word has two targets but transfer pool is incomplete | existing selector blocker retained |
| Two compatible Dynamic Prefix profiles | both evaluated; deterministic winner reported separately |
| Multi-skill shared word without explicit route links | shared-route blocker |
| Multi-skill shared word with links | newest route activation cue and strictest context retained |
| Legacy fixed `un-` snapshot route | render-compatible, never new-assignment ready |
| Unknown D4 skill with no registry route | no-compatible-route blocker |
| Input rows delivered in random order | byte-identical canonical report |
| More rows than page size | full coverage counts and ids reconcile |
| Source changes between manifests | source-changed blocker; no ready result |

Also retain the existing canonical-intake, Base Word selector, Dynamic Prefix
selector/compiler, composer, and shared-route regressions unchanged.

## 12. Completion criteria

This planning slice is complete when the later implementation can demonstrate:

- exhaustive one-for-one inspection of every approved mapping and every
  active ADLE learning item;
- lossless misspelling and intake lineage without exposing raw attempt text;
- exactly one curriculum dependency evaluation per canonical word/skill pair;
- explicit per-route compatibility and activation results for every supplied
  registered route;
- existing selector/compiler parity rather than rewritten route rules;
- explicit shared-route integrity for words carrying more than one skill;
- deterministic `READY` or sorted blocker results with stable dependency
  evidence;
- a canonical report whose coverage counts and input hash are reproducible;
- zero migrations, imports, activations, mappings, learner-item writes,
  assignments, evidence writes, schedule writes, rewards, or production
  mutations.

Implementation of any writer that consumes this inventory is a separate,
explicitly authorised slice.
