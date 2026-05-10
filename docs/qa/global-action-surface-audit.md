# Global Action Surface Audit

## Purpose

This audit inventories the app’s action surfaces so a later standardisation pass can align:
- behaviour
- success and failure feedback
- destructive-action handling
- optimistic vs route-bounce patterns
- help and hint grammar
- shared button and control primitives

This pass does **not** propose implementation changes yet.

## Audit rules

- This is a QA inventory, not a redesign spec.
- Repeated identical controls on the same surface are grouped into one **control family** row when the implementation pattern is the same.
- If behaviour could not be proven from static code alone, it is marked **needs manual verification**.
- “Route bounce” means the control depends on redirect or link navigation to show the next successful state.

## Inventory

### Global shell and account surfaces

| Route/page | Component/file | Visible label or icon | Action type | User intention | Current implementation mechanism | Expected success behaviour | Current success behaviour | Expected failure behaviour | Current failure behaviour | Route bounce | Optimistic | Persists after hard refresh | Shared pattern | Should standardise | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| global shell | [components/app-shell.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/app-shell.tsx:1) | Scarlett's Spells logo/home | secondary_navigation | Return to home surface for current mode | link navigation | Go to mode home immediately | Link navigation works; target varies by mode | If target invalid, show navigation error | needs manual verification | yes | no | yes | shared shell link pattern | yes | P2 |
| global shell | [components/app-shell.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/app-shell.tsx:1) | Parent mode | toggle_action | Switch to parent experience | link navigation | Swap mode without losing scoped child | Link styled as mode pill; navigation-based mode change | Preserve active child and route when possible | needs manual verification | yes | no | yes | shell mode pill pattern | yes | P1 |
| global shell | [components/app-shell.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/app-shell.tsx:1) | Child mode | toggle_action | Switch to child experience | link navigation | Swap mode without losing scoped child | Link styled as mode pill; navigation-based mode change | Preserve active child and route when possible | needs manual verification | yes | no | yes | shell mode pill pattern | yes | P1 |
| global shell | [components/child-switcher.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/child-switcher.tsx:1) | child option button | toggle_action | Change active child context | form submit to `setActiveChildContext` | Active child updates and redirect path stays stable | Server action + redirect path update | Show clear error if child selection fails | no inline error visible in component; needs manual verification | likely yes | no | yes | shared child-switcher pattern | yes | P1 |
| global shell | [components/app-shell.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/app-shell.tsx:1) | sidebar nav links | secondary_navigation | Navigate to top-level app sections | link navigation | Open target page with current mode scope | Shared nav links | Show inactive state only; navigation failure rare | needs manual verification | yes | no | yes | shared shell nav pattern | yes | P2 |
| global shell | [app/dashboard/logout-button.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/dashboard/logout-button.tsx:1) | Log out | primary_action | End session and return to login | client event -> Supabase signOut -> `router.push` + `router.refresh` | Sign out immediately and land on login | Pending state plus push/refresh | Show auth error inline and stay signed in | inline error message exists | yes | no | yes | standalone auth control | yes | P1 |
| /login | [app/login/login-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/login/login-form.tsx:1) | Send magic link | form_submit | Start email login | client `onSubmit` + Supabase OTP request | Show pending state, then success message | Inline pending/error/success handling | Show validation or auth error inline | inline error shown; no route bounce | no | no | n/a | standalone auth form | yes | P1 |
| /login | [app/login/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/login/page.tsx:1) | Go to dashboard | secondary_navigation | Navigate if already authenticated | link navigation | Open dashboard | Link only | If unauthenticated, redirect via dashboard auth guard | needs manual verification | yes | no | yes | simple text link | yes | P2 |
| /settings | [app/settings/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/settings/page.tsx:1) | none in page body | help_action | Read placeholder guidance only | n/a | n/a | No page-local controls found | n/a | n/a | n/a | n/a | n/a | n/a | P2 |

### Dashboard and children surfaces

| Route/page | Component/file | Visible label or icon | Action type | User intention | Current implementation mechanism | Expected success behaviour | Current success behaviour | Expected failure behaviour | Current failure behaviour | Route bounce | Optimistic | Persists after hard refresh | Shared pattern | Should standardise | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /dashboard | [app/dashboard/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/dashboard/page.tsx:1) | dashboard CTA links | secondary_navigation | Jump to review, insights, courses, analyse, practice | link navigation | Open target section in current scope | Link-based CTA cards | Navigation failure should be rare | needs manual verification | yes | no | yes | repeated CTA link grammar | yes | P2 |
| /children | [app/children/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/children/page.tsx:1) | Back to home | secondary_navigation | Return to home | link navigation | Open home route | Standard link button | n/a | needs manual verification | yes | no | yes | shared button class | yes | P2 |
| /children | [app/children/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/children/page.tsx:1) | Analyse | secondary_navigation | Go to analyse surface for current child | link navigation | Open analyse | Standard link button | n/a | needs manual verification | yes | no | yes | shared button class | yes | P2 |
| /children | [app/dashboard/child-profile-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/dashboard/child-profile-form.tsx:1) | Add child / Save child changes | form_submit | Create or edit child profile | server action via `useActionState` | Save profile and show updated data | Pending state + inline error support | Show validation/save errors inline | inline error supported; success path needs manual verification | likely yes | no | yes | shared child profile form | yes | P1 |
| /children | [app/children/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/children/page.tsx:1) | Make active child | toggle_action | Switch current child profile | form submit server action | Active child changes immediately in app context | Form submit to `setActiveChildContext` | Show clear failure and keep current child | needs manual verification | yes | no | yes | same child context pattern as shell | yes | P1 |
| /children | [app/children/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/children/page.tsx:1) | Archive child | destructive_action | Hide child from main workflow | form submit server action | Archive profile and move it to archived section | Server action; no confirmation visible in code | Show destructive warning or confirmation | no explicit confirmation in code | likely yes | no | yes | standalone destructive button | yes | P0 |
| /children | [app/children/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/children/page.tsx:1) | Delete child | destructive_action | Permanently remove child | form submit server action | Delete profile safely with strong warning | Server action; no confirmation visible in code | Require confirmation or very clear destructive guard | no explicit confirmation in code | likely yes | no | yes | standalone destructive button | yes | P0 |
| /children | [app/children/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/children/page.tsx:1) | Restore child | destructive_action | Unarchive child | form submit server action | Move child back to active list | Form submit action | Show failure inline or message | needs manual verification | likely yes | no | yes | archive/restore family | yes | P1 |

### Parent course builder surfaces

| Route/page | Component/file | Visible label or icon | Action type | User intention | Current implementation mechanism | Expected success behaviour | Current success behaviour | Expected failure behaviour | Current failure behaviour | Route bounce | Optimistic | Persists after hard refresh | Shared pattern | Should standardise | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /courses | [app/courses/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/page.tsx:1) | add course plus icon | primary_action | Open create-course composer | link navigation with query-state | Reveal add-course form without leaving context | Query-driven open state | Preserve current list and child scope | yes, via query navigation | yes | no | n/a | builder icon link grammar | yes | P1 |
| /courses | [app/courses/components/course-create-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/course-create-form.tsx:1) | Course creation help | help_action | Explain phased vs timed setup | `<details>` help popover | Open hint without changing form state | Shared `BuilderInfoHint` | Close cleanly; not duplicate visible copy | works locally | no | no | n/a | shared help primitive | yes | P2 |
| /courses | [app/courses/components/course-create-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/course-create-form.tsx:1) | Progress course / Timed course radios | toggle_action | Switch structure type | client event state toggle | Show only relevant timing fields | Local radio toggle | Preserve typed values where appropriate | needs manual verification | no | yes local UI | n/a | local form pattern | yes | P1 |
| /courses | [app/courses/components/course-create-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/course-create-form.tsx:1) | Timed course timing help | help_action | Explain timing inputs | `<details>` help popover | Open on demand | Shared hint | n/a | works locally | no | no | n/a | shared help primitive | yes | P2 |
| /courses | [app/courses/components/course-create-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/course-create-form.tsx:1) | Create course | form_submit | Create course for child | server action form submit | Create course and land back in list with success | Form submit to `createCourse` | Show validation/save error clearly | route-query error/saved pattern on page; exact failure needs manual verification | likely yes | no | yes | shared primary builder submit | yes | P1 |
| /courses | [app/courses/components/course-create-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/course-create-form.tsx:1) | close add course icon | secondary_navigation | Close course composer | link navigation with query-state | Hide form without losing list | Query-state link | n/a | yes | no | n/a | icon-close grammar | yes | P2 |
| /courses | [app/courses/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/page.tsx:1) | parent visibility tick toggle | toggle_action | Show or hide course in parent view | form submit server action | Toggle visibility with clear state | Server action submit | Show failure and preserve prior value | needs manual verification | likely yes | no | yes | one-off icon submit | yes | P1 |
| /courses | [app/courses/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/page.tsx:1) | Save course | form_submit | Save inline course edits | hidden form submit to `updateCourse` | Persist changes and keep row truthful | Form submit | Show validation errors close to row | page-level saved/error query messages; row-local failure unclear | likely yes | no | yes | hidden-form row edit pattern | yes | P1 |
| /courses | [app/courses/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/page.tsx:1) | Stop editing | secondary_navigation | Exit inline edit state | link navigation with query-state | Return row to read state | Query link close | n/a | yes | no | n/a | close-edit link grammar | yes | P2 |
| /courses | [app/courses/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/page.tsx:1) | Edit course | row_action | Enter inline edit state or full edit flow | link navigation | Open editable row state | Query link state | n/a | yes | no | n/a | row edit link grammar | yes | P2 |
| /courses | [app/courses/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/page.tsx:1) | Delete course | destructive_action | Permanently remove course | hidden form submit to `deleteCourse` | Delete safely with confirmation/clear status | Server action; no confirmation visible in code | Strong confirmation and post-delete feedback | no explicit confirmation in code | likely yes | no | yes | hidden destructive row form | yes | P0 |
| /courses | [app/courses/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/page.tsx:1) | Open course | secondary_navigation | Open course builder | link navigation | Enter course detail page | Link works via open icon | n/a | yes | no | yes | open icon grammar | yes | P2 |
| /courses/[courseId] | [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1) | wizard step chips/links | secondary_navigation | Move between builder stages | link navigation via `step` query | Switch stage without data loss | Query-driven stage navigation | Preserve current child/mode/route scope | needs manual verification | yes | no | n/a | stage-chip grammar | yes | P1 |
| /courses/[courseId] | [app/courses/components/phased-module-order-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/phased-module-order-list.tsx:1) | move module up/down | reorder_action | Reorder phased modules | optimistic action through reorder action prop | Move instantly, persist after save path | Covered local-first reorder pattern | Roll back and show error if failed | needs manual verification in browser; pattern indicates optimistic reorder | no | yes | yes | shared builder icon pattern | yes | P1 |
| /courses/[courseId] | [app/courses/components/phased-module-order-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/phased-module-order-list.tsx:1) | edit module / stop editing / open module | row_action | Edit or open module | link navigation / query-state links | Open module editor or inline edit state | Mixed row link grammar | n/a | needs manual verification | yes | no | yes | shared icon/text link mix | yes | P2 |
| /courses/[courseId] | [app/courses/components/phased-module-order-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/phased-module-order-list.tsx:1) | save module / delete empty module | form_submit / destructive_action | Persist module edits or remove empty module | hidden form submit server actions | Save or delete with clear feedback | Server action route-bounce pattern | Show row-level failure and keep context | page-level status likely; no confirmation for delete visible | likely yes | no | yes | hidden-form row pattern | yes | P1 |
| /courses/[courseId] | [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1) | create phase / create module / create checkpoint | form_submit | Add stage objects | server action form submit | Create item and remain oriented in current stage | Form-submit builder pattern | Show validation errors clearly | page-level query error/saved pattern; exact placement needs manual verification | likely yes | no | yes | repeated create form pattern | yes | P1 |
| /courses/[courseId] | [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1) | edit phase / edit cycle focus / stop editing | row_action | Enter or exit edit states | link navigation with query-state | Swap sections without losing route context | Query-link edit model | n/a | yes | no | n/a | query-state edit grammar | yes | P2 |
| /courses/[courseId] | [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1) | save phase / save checkpoint / delete checkpoint | form_submit / destructive_action | Persist phase/checkpoint changes | server action form submit | Save/delete and keep truthful status | Server action route-bounce pattern | Show row-local validation and destructive safety | destructive confirmation not visible in code | likely yes | no | yes | hidden/inline form pattern | yes | P1 |
| /courses/[courseId] | [components/shared-task-creator-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/shared-task-creator-form.tsx:1) | Task composer help | help_action | Explain task creator flow | `<details>` help popover | Reveal hint on demand | Shared hint | n/a | local only | no | no | n/a | shared help primitive | yes | P2 |
| /courses/[courseId] | [components/shared-task-creator-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/shared-task-creator-form.tsx:1) | placement selectors | toggle_action | Choose phase/module placement | client state via selects | Update available placement options | Local state changes | Preserve selected placement where possible | needs manual verification | no | yes local UI | n/a | creator-local select pattern | yes | P1 |
| /courses/[courseId] | [components/shared-task-creator-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/shared-task-creator-form.tsx:1) | creator type selector | toggle_action | Change task type | client state via select | Show only relevant fields | Local state changes | Preserve typed data where sensible | needs manual verification | no | yes local UI | n/a | creator-local select pattern | yes | P1 |
| /courses/[courseId] | [components/shared-task-creator-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/shared-task-creator-form.tsx:1) | Add task / Add focus block | form_submit | Create task or focus block | server action form submit | Persist item and return to current builder scope | Form submit create flow | Show field errors clearly | exact error behavior needs manual verification | likely yes | no | yes | shared create form | yes | P1 |
| /courses/[courseId] | [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1) | Task overview help | help_action | Explain compact row controls | `<details>` help popover | Open on demand | Shared hint | n/a | local only | no | no | n/a | shared help primitive | yes | P2 |
| /courses/[courseId] | [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1) | group/module filter selects | toggle_action | Filter visible rows | client state via `useState` | Switch displayed group/module without save | Local state only | Preserve current selection meaningfully | local state only; needs manual verification | no | yes local UI | n/a | local filter pattern | yes | P2 |
| /courses/[courseId] | [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1) | edit row | row_action | Open task/focus edit page | link navigation | Open target editor | Link-based | n/a | yes | no | yes | shared icon button grammar | yes | P2 |
| /courses/[courseId] | [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1) | move row up/down | reorder_action | Reorder task/focus block | optimistic client reorder + action | Move immediately and persist | Local-first reorder on this surface | Roll back and show inline error | inline error support exists | no | yes | yes | same reorder primitive as builder | yes | P1 |
| /courses/[courseId] | [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1) | delete row | destructive_action | Remove task/focus block | form submit server action | Delete safely and remove row promptly | Legacy form-submit delete path remains | Show clear failure and keep row if delete fails | needs manual verification; path still legacy relative to local-first reorder | likely yes | no | yes | mixed with local-first row controls | yes | P1 |
| /courses/[courseId] | [app/courses/components/final-review-audit.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/final-review-audit.tsx:1) | open item | row_action | Jump to module/task/checkpoint needing review | link navigation | Open source item | Link-based | n/a | yes | no | yes | shared icon button grammar | yes | P2 |
| /courses/[courseId] | [app/courses/components/final-review-audit.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/final-review-audit.tsx:1) | move item up/down | reorder_action | Reorder module/task/focus/checkpoint in audit context | optimistic local-first action | Move immediately and persist | Covered optimistic reorder pattern | Roll back and show error | needs manual verification; code uses optimistic list | no | yes | yes | shared reorder icon grammar | yes | P1 |

### Module editor and task editor surfaces

| Route/page | Component/file | Visible label or icon | Action type | User intention | Current implementation mechanism | Expected success behaviour | Current success behaviour | Expected failure behaviour | Current failure behaviour | Route bounce | Optimistic | Persists after hard refresh | Shared pattern | Should standardise | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /courses/[courseId]/modules/[moduleId] | [app/courses/components/module-authoring-surface.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/module-authoring-surface.tsx:1) | Task table help | help_action | Explain module row controls | `<details>` help popover | Open on demand | Shared hint | n/a | local only | no | no | n/a | shared help primitive | yes | P2 |
| /courses/[courseId]/modules/[moduleId] | [app/courses/components/module-authoring-surface.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/module-authoring-surface.tsx:1) | show selected tasks | toggle_action | Activate selected tasks | form submit server action | Apply bulk visibility update and reflect selection result | Hidden bulk form submit | Show failure without losing context | needs manual verification | likely yes | no | yes | bulk action icon grammar | yes | P1 |
| /courses/[courseId]/modules/[moduleId] | [app/courses/components/module-authoring-surface.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/module-authoring-surface.tsx:1) | delete selected tasks | destructive_action | Bulk delete checked tasks | form submit server action | Delete safely with strong guard | Hidden bulk form submit; no confirmation visible in code | Require bulk destructive confirmation or clear warning | no explicit confirmation visible | likely yes | no | yes | bulk destructive pattern | yes | P0 |
| /courses/[courseId]/modules/[moduleId] | [app/courses/components/module-authoring-surface.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/module-authoring-surface.tsx:1) | add task / close add task | row_action | Toggle task composer visibility | link navigation | Open/close add-task composer | Query/path navigation pattern | Preserve current context | yes | no | n/a | icon grammar | yes | P2 |
| /courses/[courseId]/modules/[moduleId] | [app/courses/components/task-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-module-row.tsx:1) | select row checkbox | toggle_action | Include task in bulk action | form-associated checkbox | Mark row for bulk update | Local checkbox only | Should not lose selection unexpectedly | needs manual verification | no | yes local UI | n/a | row checkbox pattern | yes | P2 |
| /courses/[courseId]/modules/[moduleId] | [app/courses/components/task-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-module-row.tsx:1) | Save task | form_submit | Persist inline task edits | hidden form submit to `updateTask` | Save row and preserve context | Hidden form submit | Show validation inline or local message | failure likely page/query based; needs manual verification | likely yes | no | yes | hidden-form row pattern | yes | P1 |
| /courses/[courseId]/modules/[moduleId] | [app/courses/components/task-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-module-row.tsx:1) | Stop editing | secondary_navigation | Exit inline edit state | link navigation | Return to read state | Link-based | n/a | yes | no | n/a | close-edit link grammar | yes | P2 |
| /courses/[courseId]/modules/[moduleId] | [app/courses/components/task-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-module-row.tsx:1) | move up/down | reorder_action | Reorder task in module | optimistic action via `moveItem` | Move immediately, persist after hard refresh | Local-first reorder | Roll back and show inline error | inline error at surface level | no | yes | yes | shared reorder icon grammar | yes | P1 |
| /courses/[courseId]/modules/[moduleId] | [app/courses/components/task-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-module-row.tsx:1) | duplicate task | row_action | Clone task | hidden form submit to duplicate action | Duplicate and show new row predictably | Form submit server action | Show failure and avoid duplicate confusion | needs manual verification | likely yes | no | yes | hidden-form row action | yes | P1 |
| /courses/[courseId]/modules/[moduleId] | [app/courses/components/task-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-module-row.tsx:1) | full edit | row_action | Open full task editor | link navigation | Open dedicated edit page | Link-based | n/a | yes | no | yes | shared icon grammar | yes | P2 |
| /courses/[courseId]/modules/[moduleId] | [app/courses/components/task-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-module-row.tsx:1) | delete task | destructive_action | Remove task from module | optimistic delete action | Delete immediately from module surface and persist | Local-first remove on covered module-editor path | Restore row and show error if delete fails | covered path now supports optimistic removal; exact error message needs manual verification | no | yes | yes | destructive icon grammar | yes | P1 |
| /courses/[courseId]/modules/[moduleId] | [components/focus-block-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/focus-block-module-row.tsx:1) | expand/collapse caret | toggle_action | Show focus-block details | client event local state | Expand details inline | Local `useState` toggle | Preserve edit state and selection logically | local only; needs manual verification | no | yes local UI | n/a | row-local expand control | yes | P2 |
| /courses/[courseId]/modules/[moduleId] | [components/focus-block-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/focus-block-module-row.tsx:1) | edit/close focus block | row_action | Open or close focus-block editing | link navigation | Enter or leave edit mode | Link-based query/path state | n/a | yes | no | n/a | icon grammar | yes | P2 |
| /courses/[courseId]/modules/[moduleId] | [components/focus-block-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/focus-block-module-row.tsx:1) | move up/down | reorder_action | Reorder focus block | optimistic action via `moveItem` | Move immediately and persist | Local-first reorder | Roll back and show error | surface-level inline error exists in parent | no | yes | yes | shared reorder icon grammar | yes | P1 |
| /courses/[courseId]/modules/[moduleId] | [components/focus-block-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/focus-block-module-row.tsx:1) | delete focus block | destructive_action | Remove focus block | optimistic delete action | Delete immediately from view and persist | Local-first remove on covered module-editor path | Restore row and show error on failure | needs manual verification | no | yes | yes | destructive icon grammar | yes | P1 |
| /courses/[courseId]/modules/[moduleId] | [components/focus-block-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/focus-block-module-row.tsx:1) | Save focus block | form_submit | Persist focus-block edits | form submit server action | Save nested focus-block edits and mini tasks | Server action submit | Show validation errors inline | no explicit inline error in row component | likely yes | no | yes | inline row form pattern | yes | P1 |
| /courses/[courseId]/modules/[moduleId]/tasks/[taskId]/edit | [app/courses/[courseId]/modules/[moduleId]/tasks/[taskId]/edit/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/edit/page.tsx:1) | Back to module / Back to course | secondary_navigation | Leave full task editor | link navigation | Return to previous builder surface | Text-link controls | n/a | yes | no | yes | builder text button pattern | yes | P2 |
| /courses/[courseId]/modules/[moduleId]/tasks/[taskId]/edit | [app/courses/components/task-editor-fields.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-editor-fields.tsx:1) | Task setup help / Content and answers help / Delivery, pacing, and reward help | help_action | Explain grouped task-edit sections | `<details>` help popovers | Reveal scoped guidance only on demand | Shared hint | n/a | local only | no | no | n/a | shared help primitive | yes | P2 |
| /courses/[courseId]/modules/[moduleId]/tasks/[taskId]/edit | [app/courses/[courseId]/modules/[moduleId]/tasks/[taskId]/edit/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/edit/page.tsx:1) | Save | form_submit | Persist full task edits | server action form submit | Save task and remain in editor with status | Form submit to `updateTask` | Show validation/save errors clearly | page-level error/saved query handling; exact row feedback needs manual verification | likely yes | no | yes | primary save button | yes | P1 |
| /courses/[courseId]/modules/[moduleId]/tasks/[taskId]/edit | [app/courses/[courseId]/modules/[moduleId]/tasks/[taskId]/edit/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/edit/page.tsx:1) | Cancel | secondary_navigation | Leave editor without saving | link navigation | Return to module | Text+icon link | n/a | yes | no | yes | builder text button pattern | yes | P2 |

### Lesson builder shared controls

| Route/page | Component/file | Visible label or icon | Action type | User intention | Current implementation mechanism | Expected success behaviour | Current success behaviour | Expected failure behaviour | Current failure behaviour | Route bounce | Optimistic | Persists after hard refresh | Shared pattern | Should standardise | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lesson-builder shared | [app/courses/components/builder-info-hint.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/builder-info-hint.tsx:1) | info `i` pill | help_action | Reveal contextual guidance | `<details>` popover | Open and close locally | Shared help primitive throughout builder | Should not duplicate always-visible copy | duplication varies by caller; needs review | no | no | n/a | yes | yes | P2 |
| lesson-builder shared | [components/structured-lesson-builder.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder.tsx:1) | Open builder / Hide builder | toggle_action | Expand compact builder | client event local state | Show or hide compact builder body | Local state only | Preserve current block state | local state only; needs manual verification | no | yes local UI | n/a until parent save | shared builder shell | yes | P1 |
| lesson-builder shared | [components/structured-lesson-builder.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder.tsx:1) | Show preview / Hide preview | toggle_action | Show or minimise full preview workspace | client event local state | Meaningfully hide or show preview/workspace area | Local state toggle; recently tightened in QA | Preserve builder state when toggled | needs manual verification after recent fix | no | yes local UI | n/a until parent save | shared builder shell | yes | P1 |
| lesson-builder shared | [components/structured-lesson-builder.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder.tsx:1) | Lesson builder help / Lesson template help | help_action | Explain save flow and presets | `<details>` popovers | Open help on demand | Shared hint primitive | n/a | local only | no | no | n/a | shared help primitive | yes | P2 |
| lesson-builder shared | [components/structured-lesson-builder.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder.tsx:1) | Load preset / preset chip | row_action | Load starter lesson blocks | client event local mutation | Replace current local lesson with preset | Local builder state update | If load fails, preserve current state | no explicit failure path; local only | no | yes local UI | yes after parent save | shared lesson preset grammar | yes | P1 |
| lesson-builder shared | [components/structured-lesson-builder.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder.tsx:1) | + block buttons | row_action | Add new lesson block | client event local mutation | Append block instantly | Local builder state update | Should not lose current block state | local only | no | yes local UI | yes after parent save | block palette pattern | yes | P2 |
| lesson-builder shared | [components/structured-lesson-builder-editor-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-editor-list.tsx:1) | Up / Down / Duplicate / Remove | reorder_action / row_action / destructive_action | Reorder or alter lesson blocks | client event local mutation | Update block list immediately | Local-only block mutations | Keep local state stable if invalid | local only; no explicit error layer | no | yes local UI | yes after parent save | repeated block-card action pattern | yes | P1 |

### Child learning surfaces

| Route/page | Component/file | Visible label or icon | Action type | User intention | Current implementation mechanism | Expected success behaviour | Current success behaviour | Expected failure behaviour | Current failure behaviour | Route bounce | Optimistic | Persists after hard refresh | Shared pattern | Should standardise | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /learn | [app/learn/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/page.tsx:1) | Open this week | secondary_navigation | Jump to weekly child surface | link navigation | Open week planner | Link button | n/a | yes | no | yes | shared button style | yes | P2 |
| /learn | [app/learn/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/page.tsx:1) | Open course | secondary_navigation | Enter a child course | link navigation | Open chosen course | Icon link | n/a | yes | no | yes | open icon grammar | yes | P2 |
| /learn/courses/[courseId] | [app/learn/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/courses/%5BcourseId%5D/page.tsx:1) | pre-submit checklist actions | form_submit | Save draft or submit child work | form submit with `formAction` in shared component | Preserve text or send for review | Shared checklist component handles dual submits | Show validation and keep response | needs manual verification | likely yes | no | yes | shared `PreSubmitChecklist` pattern | yes | P1 |
| /learn/courses/[courseId] | [app/learn/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/courses/%5BcourseId%5D/page.tsx:1) | complete recurring/completion task | form_submit | Mark task done | server action form submit | Mark complete and show reward/status | Form submit to `completeCourseTask` | Show failure and keep task incomplete | needs manual verification | likely yes | no | yes | repeated child completion pattern | yes | P1 |
| /learn/modules/[moduleId] | [app/learn/modules/[moduleId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/page.tsx:1) | Add selected to my week | form_submit | Bulk add checked tasks to weekly plan | hidden form submit | Add selected tasks and stay on module | Server action form submit | Show failure without dropping selection unexpectedly | needs manual verification | likely yes | no | yes | bulk child planning pattern | yes | P1 |
| /learn/modules/[moduleId] | [app/learn/modules/[moduleId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/page.tsx:1) | task checkbox selector | toggle_action | Choose tasks for bulk add | form-associated checkbox | Toggle selected tasks locally | Local checkbox selection | Preserve checked state while browsing module | needs manual verification | no | yes local UI | n/a | row checkbox pattern | yes | P2 |
| /learn/modules/[moduleId] | [app/learn/modules/[moduleId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/page.tsx:1) | Open | secondary_navigation | Open child task | link navigation | Open task detail | Link button | n/a | yes | no | yes | standard open button | yes | P2 |
| /learn/modules/[moduleId] | [app/learn/modules/[moduleId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/page.tsx:1) | Add to my week | form_submit | Add a single task to week | server action form submit | Add task and show saved feedback | Form submit | Show failure clearly | needs manual verification | likely yes | no | yes | child planning button family | yes | P1 |
| /learn/modules/[moduleId]/tasks/[taskId] | [app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/page.tsx:1) | Back to module / Back to task list | secondary_navigation | Leave task detail | link navigation | Return cleanly | Text links | n/a | yes | no | yes | shared child back-link pattern | yes | P2 |
| /learn/modules/[moduleId]/tasks/[taskId] | [app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/page.tsx:1) | Add to my week | form_submit | Add current task to weekly plan | server action form submit | Add task and preserve context | Form submit action | Show failure clearly | needs manual verification | likely yes | no | yes | same child planning pattern | yes | P1 |
| /learn/modules/[moduleId]/tasks/[taskId] | [app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/page.tsx:1) | Submit response / Mark done | form_submit | Submit lesson/test response or mark task complete | server action form submit | Save response or completion and show status/reward | Form submit action | Keep work if validation fails and show clear error | needs manual verification | likely yes | no | yes | repeated child completion/response pattern | yes | P1 |
| /learn/week | [components/learn-week-planner.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/learn-week-planner.tsx:1) | week/day view toggle | toggle_action | Switch planner display | client event local state | Swap planner view instantly | Client state | Preserve selection and current task detail | needs manual verification | no | yes local UI | n/a | planner-specific toggle | yes | P2 |
| /learn/week | [components/learn-week-planner.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/learn-week-planner.tsx:1) | complete task / submit task / open practice / close task details | mixed | Complete or respond to week tasks, open practice, close details | mixed form submit, link nav, client event | Complete work or navigate without confusion | Mixed mechanisms in one planner | Failures should preserve entered state and context | mixed; needs manual verification | mixed | mixed | yes for persisted actions | mixed local/shared patterns | yes | P1 |

### Review, insights, practice, and analyse surfaces

| Route/page | Component/file | Visible label or icon | Action type | User intention | Current implementation mechanism | Expected success behaviour | Current success behaviour | Expected failure behaviour | Current failure behaviour | Route bounce | Optimistic | Persists after hard refresh | Shared pattern | Should standardise | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /courses/review | [app/courses/review/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/page.tsx:1) | Open review thread | secondary_navigation | Open a queued submission review | link navigation | Open detailed review page | Link card/button pattern | n/a | yes | no | yes | review list link grammar | yes | P2 |
| /courses/review/[submissionId] | [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1) | Back to review / Open lesson / Analyse | secondary_navigation | Move between review helper surfaces | link navigation | Open destination without losing child scope | Link buttons | n/a | yes | no | yes | review nav link grammar | yes | P2 |
| /courses/review/[submissionId] | [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1) | Approve review | form_submit | Finalise review and approve submission | server action form submit | Approve review and update submission state | Form submit action | Show validation/blocker failure clearly | needs manual verification | likely yes | no | yes | review primary action pattern | yes | P1 |
| /courses/review/[submissionId] | [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1) | Return to child | destructive_action | Send work back for correction | server action form submit | Return work with note and updated state | Form submit action | Preserve note and show error if return fails | needs manual verification | likely yes | no | yes | review secondary/destructive submit | yes | P1 |
| /courses/review/[submissionId] | [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1) | Delete this work | destructive_action | Remove submission from review | server action form submit | Delete only with strong guard | Form submit; no explicit confirmation visible in code | Require confirmation or very clear irreversible warning | no explicit confirmation visible | likely yes | no | yes | review destructive action | yes | P0 |
| /courses/review/[submissionId] | [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1) | Add missed word / Add manual writing issue | form_submit | Record extra review findings | server action forms | Persist additional review issue | Form submit action | Show form validation clearly | needs manual verification | likely yes | no | yes | review add-item forms | yes | P1 |
| /courses/review/[submissionId] | [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1) | confirm/dismiss prompt; bulk confirm/dismiss | row_action / destructive_action | Resolve positive-evidence watchouts | form submit and `formAction` submits | Resolve selected items and update state | Form submits with bulk variants | Keep selection/history clear on failure | needs manual verification | likely yes | no | yes | review micro-action family | yes | P1 |
| /courses/review/[submissionId] | [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1) | accept suggestion / reject suggestion | row_action / destructive_action | Convert or reject spelling review suggestion | server action forms | Update suggestion state and durable issue model | Form submit actions | Show failure without losing review context | needs manual verification | likely yes | no | yes | review issue-action family | yes | P1 |
| /insights | [app/insights/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/insights/page.tsx:1) | convert bars to coins | form_submit | Convert reward currency | server action form submit | Persist conversion and refresh balances | Form submit action | Show balance or validation failure clearly | needs manual verification | likely yes | no | yes | reward action pattern | yes | P1 |
| /insights | [app/insights/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/insights/page.tsx:1) | request Gold Coin transfer | form_submit | Ask parent to transfer coins | server action form submit | Persist request and show status | Form submit action | Show validation or limit error | needs manual verification | likely yes | no | yes | reward action pattern | yes | P1 |
| /insights | [app/insights/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/insights/page.tsx:1) | confirm visible matches / confirm single | row_action | Confirm positive evidence from insights | form submit actions | Mark evidence confirmed | Form submit action | Show failure without losing context | needs manual verification | likely yes | no | yes | evidence-confirm family | yes | P1 |
| /insights | [app/insights/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/insights/page.tsx:1) | open work | secondary_navigation | Jump to source review item | link navigation | Open source submission review | Link button | n/a | yes | no | yes | review-link grammar | yes | P2 |
| /insights | [app/insights/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/insights/page.tsx:1) | approve / decline transfer request | destructive_action / primary_action | Decide parent coin transfer request | server action form submit | Persist decision and update request state | Form submit actions | Show failure and preserve decision context | needs manual verification | likely yes | no | yes | approval/decline pair | yes | P1 |
| /practice | [app/practice/practice-session.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/practice/practice-session.tsx:1) | practice flow buttons | mixed | Reveal prompt, submit word, continue, close session states | mixed client events and form submit | Advance session with clear correctness feedback | Mixed local state and form submit flow | Preserve session state on failure | needs manual verification | mixed | mixed | yes for persisted practice submissions | practice-session-specific controls | yes | P1 |
| /analyse and /analyse/review | [app/analyse/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/analyse/page.tsx:1), [app/analyse/review/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/analyse/review/page.tsx:1), [components/analyse-bulk-review.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/analyse-bulk-review.tsx:1) | analyse nav links and bulk review buttons | mixed | Navigate analysis workflow and bulk-classify review items | mixed link navigation and form submit | Move through intake/review and persist classifications | Mixed forms and links | Show failure without losing selected items | needs manual verification | mixed | no | yes | analysis-specific patterns | yes | P1 |

## Summary

### 1. Repeated actions with inconsistent behaviour

- Row-level reorder is local-first on covered builder surfaces, but delete is still mixed:
  - local-first in deeper module editor
  - legacy form-submit in Step `3`
- Inline edit save uses hidden or detached forms in several builder tables, while full-page editors use more conventional visible forms.
- Child-facing completion and response actions use repeated form-submit flows with inconsistent immediate feedback patterns.
- Review and insights actions use many near-equivalent confirm/dismiss/approve flows without one clearly shared control grammar.

### 2. Buttons that should use shared primitives

- builder row icon buttons:
  - edit
  - move up
  - move down
  - delete
  - add
- builder text buttons:
  - back
  - cancel
  - close edit
- primary submit buttons:
  - create
  - save
  - approve
  - submit
- child planning buttons:
  - open
  - add to my week
  - complete

### 3. Destructive actions needing confirmation or standard delete behaviour

- delete child
- delete course
- bulk delete selected tasks
- delete submission from review
- archive child may also deserve the same confirmation grammar if treated as high-impact
- Step `3` delete and course-list delete should align with the same destructive-action standard

### 4. Reorder actions still using legacy form-submit or route-bounce behaviour

- Covered reorder surfaces are already modernised and local-first:
  - final review
  - Step `3`
  - deeper module editor
  - phased module ordering
- The remaining mismatch is not reorder itself so much as **equivalent row delete** still using legacy form-submit on Step `3`.

### 5. Help/hint controls that duplicate visible copy

- `BuilderInfoHint` is now the dominant shared help primitive, which is good.
- The risk is overuse:
  - course creation
  - shared task creator
  - task editor sections
  - module authoring help
  - lesson builder help
  - Step `3` help
- Future pass should check whether some help text merely restates nearby labels or counts.

### 6. Navigation buttons with inconsistent wording

- “Open”, “Edit”, “Back to module”, “Back to course”, “Close add task”, “Stop editing”, and icon-only close/edit controls currently mix:
  - icon-only affordances
  - text buttons
  - text+icon buttons
  - query-driven close links
- Child mode also mixes:
  - “Open this week”
  - “Open”
  - “Add to my week”
  - “Back to module”

### 7. Recommended shared button/control components

- `AppIconButton`
  - variants: neutral, accent, destructive, success
  - sizes: xs, sm, md
- `AppTextButton`
  - back, cancel, close, secondary navigation
- `AppPrimarySubmitButton`
  - handles pending and disabled states consistently
- `AppDestructiveSubmitButton`
  - optional confirmation support or confirm wrapper
- `AppRowSelectionCheckbox`
  - row and bulk selection grammar
- `AppHelpHint`
  - likely extend current `BuilderInfoHint` or generalise it
- `AppModeSwitch`
  - shared mode-pill toggle grammar

### 8. Recommended Playwright tests to add after the audit

- course list:
  - create course
  - edit/save course
  - delete course
  - parent visibility toggle
- course builder:
  - phased module reorder
  - Step `3` reorder and delete
  - final review reorder
- deeper module editor:
  - task reorder
  - task delete
  - focus-block reorder
  - focus-block delete
- task editor:
  - save and cancel
  - lesson builder preview toggle
  - preset load and block mutation persistence
- child learn:
  - add task to week
  - bulk add to week
  - complete task
  - submit response
- children:
  - create child
  - edit child
  - make active child
  - archive/delete child with confirmation once standardised
- review:
  - approve review
  - return to child
  - delete submission
  - confirm/dismiss evidence
  - accept/reject suggestion
- insights:
  - confirm visible matches
  - request transfer
  - approve/decline transfer

## Recommended next implementation pass

Run one bounded **Global Action Grammar and Interaction Standardisation** pass with this order:
1. standardise destructive-action behaviour and confirmation rules
2. align row-level local-first interaction behaviour on equivalent builder surfaces
3. extract shared button and icon-button primitives
4. deduplicate help and hint usage where visible copy already explains the same thing

Do not combine that pass with broader route decomposition or action-owner refactors.
