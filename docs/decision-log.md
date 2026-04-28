# Decision Log

## 2026-04-25 — Course builder reframed around Phased and Timed structures

### What changed
- The course model is now documented as two first-class setup types:
  - phased
  - timed
- `Phase` is now a first-class planning object for phased courses.
- Timed courses are now explicitly modelled around:
  - duration
  - cycles/blocks
  - recurring daily and weekly work
  - focus block per cycle
  - checkpoint/review period per cycle
- The task model direction was widened from simple writing tasks toward:
  - checklist
  - lesson
  - test
  - recurring daily
  - recurring weekly
  - checkpoint
- Reward level and optional phase completion badges were added to the documented product direction.

### What was intentionally not automated
- The app should not auto-generate a rigid full course calendar from measurable goals.
- It should not fabricate every future task instance across the whole period.
- It should not turn timed courses into a heavy scheduling engine.

### Why
- The previous documentation was structurally correct, but still too close to a database model.
- Real homeschool planning needs two distinct setup paths:
  - sequential staged learning
  - fixed-period training plans
- Parents need clearer authoring support for lessons and tests, not just checklist and writing stubs.
- Keeping recommendations separate from rigid scheduling preserves flexibility for real family life while staying deterministic and MVP-simple.

## 2026-04-23 — Course goals now guide planning instead of generating a rigid calendar

### What changed
- A new Course Goal layer was added to the course model.
- Course goals now support:
  - title
  - goal type
  - unit
  - target quantity
  - progress source
  - time span
  - success description
  - optional stretch target
  - status
- Course goals now produce structured planning guidance such as:
  - recommended task shape
  - suggested pace
  - tracking mode
  - mission suggestion
  - checkpoint suggestion
  - best next step for the parent

### What was intentionally not automated
- The app does not auto-generate every future task instance from a course goal.
- It does not create a rigid Monday-Sunday or 6-month task calendar from the goal automatically.
- It does not fabricate highly specific content tasks for skill goals.

### Why
- In homeschool planning, goals should guide structure without taking control away from the parent.
- A rigid generated calendar would feel brittle, over-automated, and hard to adjust around real family life.
- The parent needs to be able to use goals as planning guidance, then choose the actual recurring tasks, focus blocks, and checkpoints with intention.
- Keeping goals recommendation-based preserves the MVP-simple, deterministic product philosophy while making course setup clearer.

## 2026-04-23 — Product framed as homeschool course builder with universal progress psychology

### What changed
- The product is now explicitly framed as a parent-guided homeschool course builder with a spelling engine underneath.
- Courses, modules, tasks, recurring work, focus blocks, checkpoints, and writing submissions are now part of the main product story rather than a side extension.
- A universal progress psychology was added across all learning:
  - Golden Nuggets
  - In the Machine / Refining
  - Gold Bars
  - Proven Bag
- The child dashboard direction is now:
  - Today’s Training
  - Golden Nuggets in the Machine
  - Proven Bag
  - Reward Progress

### What was removed or replaced
- Replaced the older spelling-first framing where the broader course/task system felt secondary.
- Replaced the idea of separate reward logic for each learning area with one shared progress psychology across spelling and course work.
- Replaced any perfection-first reward framing with a model that values consistency, completion, and mastery.

### Why
- The platform is now growing into a homeschool system, not just a spelling tool.
- Parents need the product to support custom learning structure, not only spelling review.
- Writing created inside the platform should clearly be understood as the future bridge into spelling analysis.
- Children need a progress model where mistakes still feel valuable and in-progress work feels motivating, not like failure.

## 2026-04-27 — Reward system contract made canonical

### What changed
- A dedicated canonical reward doc was added at [docs/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/reward-system-contract.md:1).
- Reward language is now formally separated into:
  - progress state
  - reward currency
  - task reward rules
  - badges and collectibles
- Gold Coins are now the only spendable currency in the documentation contract.
- Gold Bars are now explicitly defined as mastery assets that can convert into Gold Coins.

### What was removed or replaced
- Replaced the earlier drift where some docs mixed progress-state labels with task reward labels.
- Replaced the old ingredient and voucher wording as the canonical model.
- Replaced the weaker informal daily reward description with a clearer default rule:
  - up to 1 Gold Coin per meaningful daily session

### Why
- The product had grown a strong emotional progress model, but the mechanics were still inconsistent across docs.
- Parents and future implementation work need one clear contract for:
  - mastery
  - currency
  - conversion
  - anti-gaming
  - pocket money transfer
- This gives the product one stable terminology set before the remaining ledger and conversion work is implemented.

## 2026-04-27 — Incorrect spelling golden path made canonical

### What changed
- The spelling workflow is now documented as:
  - child submits writing or parent uploads writing
  - likely misspellings detected
  - words already active in the queue are not duplicated
  - submission appears in `Review work`
  - parent checks highlighted text and adds missed words if needed
  - parent reviews correction, diagnosis, teaching mode, and lesson family
  - approved items generate practice automatically in the child queue
- The spelling review cadence is now documented as:
  - wrong word found -> review next day
  - if correct there -> next review in 3 days
  - if correct there -> next review in 7 days
  - if correct there -> next review in 14 days
  - if correct there -> Gold Bar
- Gold Bar regression is now documented:
  - misspelt again -> back to in progress
  - one later correct review can restore it
  - no extra Gold Coins for re-winning the same word

### What was removed or replaced
- Replaced the older vague “3 retrievals across time” wording as the main spelling mastery description.
- Replaced the older “parent sends selected writing into spelling review” flow as the only documented bridge.
- Replaced lingering task-reward wording that used progress-state labels instead of the canonical task reward rule terms.

### Why
- The docs had become directionally aligned but still contained small conflicting phrases that could confuse implementation.
- Parent review needs to stay explicit, but queue generation needs to be automatic once the parent has reviewed the item.
- The spelling cadence needed one deterministic documented schedule so product, code, and copy can converge on the same loop.

## 2026-04-23 — Parent review and child session phase completed

### What changed
- Parent review moved from a single crowded `/analyse` screen toward a clearer review flow with:
  - dedicated misspelling review
  - reviewed vs needs-review separation
  - lighter bulk actions
  - engine-mistake review
  - Supabase-first family selection
- Diagnosis became the main driver for:
  - teaching mode
  - family recommendation
  - parent-facing review wording
- Child mode `/practice` became a real 10-minute session with:
  - Start button
  - core six words
  - bonus words in a coherent order
  - lesson-type-specific interactions
  - reward feedback that should now be migrated toward the canonical Gold Coin contract
- Homophones became a first-class teaching mode instead of being treated as generic tricky words.

### What was removed or replaced
- Replaced the old idea of a flat daily approved lesson with a living spelling queue.
- Replaced the old assumption that every misspelling needs a strong lesson family with a more selective, teacher-like rule.
- Replaced the old habit of treating homophones as irregular/tricky by default with a dedicated `homophone` mode.
- Replaced heavy always-visible bulk review panels with lighter selection-first actions.

### Why
- The earlier model created too much noise in parent review.
- The engine needed a clearer distinction between:
  - what went wrong
  - how to teach it
  - how to group practice words
- Child practice needed to feel like a calm, real spelling session rather than an admin workflow.
- Parent trust improves when the UI is honest about weak diagnosis and only surfaces families when they are genuinely helpful.

---

## 2026-04-23 — Product direction expanded to include courses, modules, and tasks

### What changed
- The product direction was expanded from a spelling-first system into a broader parent-guided learning platform.
- A new course/module/task layer was added to the model:
  - courses
  - modules
  - tasks
  - recurring daily and weekly work
  - focus blocks
  - checkpoints
  - written submissions
- The intended long-term loop is now:
  course task writing -> submission saved -> spelling analysis -> spelling queue updated

### What was removed or replaced
- Replaced the narrow idea that all writing would mostly be pasted in manually by the parent.
- Replaced the assumption that spelling practice is the only child-facing structured workflow.

### Why
- The product needs to support longer-term learning, not just spelling remediation.
- Parent-created courses let the platform support subjects like chess, YouTube, and creative work.
- Writing inside tasks gives the platform its own meaningful writing inputs, which can later strengthen the spelling engine naturally.
- Separating the course/task model from the spelling queue keeps the architecture cleaner and easier to scale.
