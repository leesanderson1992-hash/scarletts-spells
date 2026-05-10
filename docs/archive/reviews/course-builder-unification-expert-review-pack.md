# Course Builder Unification Expert Review Pack

## Purpose

This review pack is a pre-implementation signoff document for the current Course Builder Unification documentation set.

It exists to:
- review the course-builder contract
- review the course-builder architecture doc
- review the course-builder implementation plan
- review the parent and child workflow docs
- compare them against the canonical contracts they depend on
- identify the remaining product, architecture, UX, QA, and implementation risks before code work begins

## Scope

This pack reviews the current course-builder documentation set now present in the repo.

Primary review targets:
- [docs/contracts/course-builder-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/course-builder-contract.md:1)
- [docs/architecture/course-builder-unification-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/course-builder-unification-architecture.md:1)
- [docs/implementation/completed/course-builder-unification-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/course-builder-unification-plan.md:1)
- [docs/workflows/course-builder-parent-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/course-builder-parent-workflow.md:1)
- [docs/workflows/course-builder-child-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/course-builder-child-workflow.md:1)

Canonical comparison docs:
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1)
- [docs/contracts/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/modules-model.md:1)
- [docs/archive/spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-model.md:1)

Supporting architecture context:
- [docs/archive/course-creator-architecture-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/course-creator-architecture-plan.md:1)
- [docs/archive/reviews/course-builder-unification-review.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/reviews/course-builder-unification-review.md:1)

## Product Owner Review

| Area | Review question | Risk | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Terminology | Are `Progress` and `Timed` explained clearly enough in the contract and workflows? | `Progress` is clearer for parents than `Phased`, but it can still be mistaken for general child progress unless the builder copy stays explicit. | Keep `Progress` as the parent-facing label and consistently describe it as the staged course type across all parent workflows. | High |
| Homeschool fit | Do the current docs match the intended homeschool use case? | The docs now support both structured curriculum and timed training plans, but `Timed` could still feel too operational if implemented without restraint. | Keep `Timed` framed as a calm planning rhythm with guidance rather than an automated accountability system. | High |
| Parent workflow completeness | Do the parent workflow docs cover the main planning journey? | The parent flow is now present, but real usability depends on keeping the sequence simple when `Timed` adds goals, focus blocks, and recurring work. | Preserve a stepwise builder flow and avoid collapsing all timed planning choices into one dense authoring surface. | High |
| Child workflow completeness | Is anything still missing from the child workflow? | The child workflow is present, but the eventual implementation must keep the child experience focused on current work rather than builder concepts. | Keep child surfaces centered on “what matters now” rather than exposing internal planning structures. | High |
| Goal separation | Is the split between course goals, phase goals, and focus blocks understandable? | The documentation now separates them, but the eventual UI could still blur those concepts if labels are weak. | Preserve distinct terms in implementation: course goals for the whole arc, phase goals for recurring phase work, focus blocks for the current mission. | High |
| V1 sizing | Do the docs keep v1 small enough? | The slices are better bounded now, but `Timed` still spans enough concepts that scope creep is the main product risk. | Enforce slice order and keep later-phase enhancements out of the first implementation pass. | High |

## Web Architecture Review

| Area | Review question | Risk | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Shared engine | Does the architecture doc preserve one shared course engine? | The doc preserves the shared engine well, but implementers may still be tempted to shortcut into direct task-to-phase ownership. | Keep hidden/default timed modules in v1 and require an explicit later decision before changing task ownership. | High |
| Concerns separation | Are validation, selectors, scheduling, and UI concerns separated clearly enough? | The architecture doc is directionally strong, but recurrence and warning semantics still need tighter operational definitions before coding. | Treat selectors and validation as first-class implementation targets before UI work grows around them. | High |
| Timed modules | Are hidden/default timed modules documented strongly enough? | If this remains only a light note, timed modules may leak into parent UX or be bypassed inconsistently. | Reiterate in implementation slices that timed modules are an internal support strategy, not a parent planning concept. | Medium |
| Completion model discipline | Does the architecture avoid inventing a second completion model? | The docs are aligned with the universal progress contract, but `Timed` pace tracking could still be misbuilt as alternate completion truth. | Keep pace and warnings explicitly advisory while module and task completion stay canonical. | High |
| Warning ownership | Are selectors and derived warnings centralized enough? | The doc now expects selector-driven warnings, but the exact selector contract is not yet fully pinned down. | Lock warning ownership in shared selectors before any page implements bespoke logic. | High |
| Architecture readiness | Are the new models justified without overcommitting schema? | The architecture identifies likely additions without over-specifying them, but recurrence and goal typing still need a tighter implementation decision. | Keep schema decisions minimal and staged until slice 3–5 clarify the actual operational need. | Medium |

## Database Review

| Area | Review question | Risk | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Reused tables | Is the architecture explicit enough about reused tables? | The reuse story is strong, but future implementers may still assume `Timed` requires a second task engine. | Keep `courses`, `course_modules`, `course_tasks`, `task_completions`, and `task_submissions` as the explicit shared base. | High |
| Schema additions | Are likely additions identified without hard-coding schema too early? | The docs identify likely additions well, but occurrence modeling and goal typing remain open enough to produce inconsistent implementation choices. | Require an implementation decision on occurrence modeling and goal typing before schema work begins. | High |
| Naming migration | Do the docs correctly defer any rename of `phased`? | Yes, but this is easy to lose once UI and schema work start in parallel. | Keep `Progress` as a UX label in early slices and avoid DB renames until product language is fully stable. | Medium |
| Integrity rules | Are data integrity rules clear enough before implementation? | The docs call for mode-specific validation, but they do not yet enumerate the invalid-shape matrix in full detail. | Expand validation cases during implementation planning, especially around mode/task compatibility and timed goal shapes. | High |
| Recurrence storage | Is the recurrence model sufficiently defined? | No. It is still unclear whether rolling occurrence truth is derived or persisted. | Lock the recurrence storage strategy before slice 5. | High |
| Warning persistence | Is it clear whether warnings are selector-only or persisted? | The docs lean selector-first, but they do not yet say when persisted read models would become justified. | Keep v1 derived-only unless performance or audit constraints prove otherwise. | Medium |

## UX Review

| Area | Review question | Risk | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Parent builder complexity | Does the parent workflow read calmly and sequentially? | The workflow is calmer now, but `Timed` still risks becoming cognitively heavy if too many concepts appear at once. | Use staged authoring with clear labels and keep focus blocks, goals, and recurring work visually distinct. | High |
| Child clarity | Does the child workflow avoid admin-like phrasing and feel understandable? | The child workflow is calmer than before, but implementation could still over-expose pacing or logging concepts. | Keep the child view centered on current work, one current weekly occurrence, and the next focus action only. | High |
| Planning object distinction | Are `Focus blocks` and recurring goals clearly distinguished? | The docs distinguish them conceptually, but the UI can still make them feel like duplicate systems. | Use clear visual and language differences: recurring goals for rhythm, focus blocks for mission-based work. | High |
| Warning tone | Are warnings framed supportively? | The docs say warnings are parent-facing and non-punitive, but eventual UI tone is still a risk. | Phrase warnings as support signals and pacing checks, not failure messages. | High |
| Review markers | Do review markers feel reflective rather than gate-like? | They are defined well in docs, but UI could still accidentally present them like blockers. | Keep review markers visually lightweight and separate from task completion states. | Medium |
| Hidden structure leakage | Is there a UX risk from hidden/default timed modules leaking through? | Yes. Internal structure may appear in UI if implementation is not disciplined. | Treat any visible timed-module-first UI as a defect against the contract. | Medium |

## Education Review

| Area | Review question | Risk | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Child autonomy | Does the documented workflow support autonomy? | The child is still supported, but logging and pacing features could tip toward surveillance if overemphasized. | Keep the child’s next action simple and preserve choice around when to schedule focus work. | High |
| Over-scheduling | Does the plan avoid over-scheduling? | The rolling weekly model helps, but daily and weekly goals together could still feel relentless if not used carefully. | Keep backlog duplication out of v1 and let review markers serve as reset points rather than pressure amplifiers. | High |
| Pacing pressure | Are recommendations and warnings educationally helpful rather than punitive? | The docs frame them well, but educational tone can still degrade in implementation. | Treat recommendations as guidance and keep warnings parent-facing. | High |
| Goal diversity | Do aspiration goals remain educationally useful? | Yes, but they need strong examples later so they do not collapse into vague placeholders. | Keep aspiration goals distinct from numerical tracking and use them for reflective, qualitative homeschool aims. | Medium |
| Reflection rhythm | Do review markers encourage reflection? | Yes, if implemented as check-ins rather than progress gates. | Preserve review markers as opportunities to pause, adapt, and reset. | Medium |
| Calmness | Does the overall child experience stay calm? | It can, but only if the implementation does not surface every planning layer to the child. | Keep the child surface intentionally lighter than the parent builder. | High |

## QA Review

| Area | Review question | Risk | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Acceptance criteria | Do the implementation slices have enough acceptance criteria? | The slices are much better defined, but slices 3–5 still leave some implementation-critical semantics open. | Add explicit acceptance criteria for recurrence semantics and missed-event behavior before coding those slices. | High |
| Edge cases | Are recurrence and holiday-shift edge cases covered enough? | Not fully. They are recognized, but not yet crisply enumerated. | Add explicit QA cases for holiday shifts, recurring carryover boundaries, and renamed timed phases. | High |
| Manual checks | Are manual checks concrete enough? | The plan has manual checks, but some of them still need more exact expected outcomes. | Tighten the manual pilot around reconciliation: course view, week view, insights, and raw logged events. | High |
| Contract alignment | Is alignment with the universal progress contract explicit enough? | Yes, but it remains a high-risk area once timed pacing logic is implemented. | Add regression checks that confirm pace tracking never changes canonical completion or unlock truth. | High |
| Cross-surface truth | Are warnings and recurrence checked across surfaces? | Not yet enough. That is a likely integration failure point. | Require QA comparison between selectors, parent insights, week view, and child course view. | High |
| Child experience checks | Are calmness and non-duplication actually testable? | Only partially. They need concrete manual expectations. | Add manual checks for “one current weekly occurrence only” and “no punitive child warning states.” | Medium |

## AI/Codex Implementation Review

| Area | Review question | Risk | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Slice order | Is the implementation order safe? | Yes, as documented. The main risk is skipping forward into richer timed behavior too early. | Keep strict slice order and do not bundle slices 3–8 into one implementation pass. | High |
| Decision completeness | Is each slice specific enough for implementation? | Slices 1 and 2 are implementation-ready. Later slices still depend on a few unresolved semantic decisions. | Treat slices 3–5 and 8 as gated by explicit decisions on recurrence, missed events, and warning ownership. | High |
| Remaining vagueness | Is anything still too vague for Codex? | Yes: occurrence model choice, exact missed-event definition, and selector-vs-persisted warning strategy. | Resolve those before coding slices that depend on them. | High |
| Prerequisites | Are the slice prerequisites clear now? | Much clearer than before, but the recurrence and warning prerequisites should be called out even more strongly. | Add a short prerequisite note ahead of slices 3–5 and 8 during implementation kickoff. | Medium |
| Contract discipline | Is there still a risk of Codex inventing a second progress model? | Yes, especially once pace tracking and warnings enter the same code paths as completion. | Repeat in implementation prompts that pace is advisory and completion remains governed by canonical contracts. | High |
| v1 boundary discipline | Is deferred scope clearly out of bounds? | Mostly yes, but deferred work can still sneak in if implementers “finish the thought” early. | Keep direct phase-owned tasks and focus-block reward splitting explicitly out of scope for v1. | High |

## Top 10 Risks

1. Recurrence semantics are still underdefined enough that different surfaces could implement “current weekly occurrence” differently.
2. `Progress` as a UX label could still drift from internal `phased` terminology during implementation.
3. Warning selectors are directionally defined but still underspecified enough to invite page-local logic.
4. Hidden/default timed modules could leak into parent UX if implementation is not disciplined.
5. Timed goals could still drift into a second progress model if implementers blur pacing with completion.
6. Holiday shifting remains a downstream complexity risk for phase windows, review markers, and recurring expectations.
7. Aspiration and numerical goals may still need tighter examples to stay distinct in implementation.
8. Review markers could still be misimplemented as gates rather than reflective checkpoints.
9. Reward semantics could still get mixed into planning or progress language if contracts are not followed closely.
10. Slice boundaries could still be violated if implementation begins too broadly instead of following the documented order.

## Top 10 Decisions to Confirm Before Coding

1. Whether `Progress` remains a UX-only rename while internal data stays `phased` in v1.
2. What the exact recurring occurrence model is for daily and weekly work.
3. What the exact definition of a “missed event” is across week view and insights.
4. How holiday shifts affect recurring expectations and review markers in detail.
5. Whether timed goal typing needs a schema extension in slice 3 or slice 4.
6. Whether warning selectors remain fully derived in v1 or need any persisted read shape.
7. Whether focus-block rewards in v1 are merely optional/simple or should be omitted entirely at first.
8. Whether parent insights warnings are passive only or should include recommended interventions later.
9. Whether hidden/default modules are guaranteed to stay completely invisible in parent timed UX.
10. Whether slice 3 or slice 4 owns the first schema change for timed-specific behavior.

## Recommended Final Amendments

| Area | Amendment | Reason | Priority |
| --- | --- | --- | --- |
| Recurrence semantics | Lock the recurrence model before slice 5. | This is the biggest remaining implementation ambiguity. | High |
| Missed-event definition | Lock the missed-event definition before slice 8. | Warnings and insights depend on one shared interpretation. | High |
| Naming | Keep `Progress` as UX language while avoiding schema rename in early slices. | This preserves product clarity without forcing premature migration work. | High |
| Warning ownership | Enforce selector ownership for warnings. | This prevents cross-surface truth drift. | High |
| Focus rewards | Keep focus-block reward splitting out of v1. | The simple reward model is safer and already supported by the docs. | Medium |
| Review markers | Keep review markers non-blocking. | This protects educational tone and contract consistency. | High |
| Slice discipline | Keep implementation in slice order without bundling slices 3–8 together. | Later slices depend on decisions that still need to be locked precisely. | High |
