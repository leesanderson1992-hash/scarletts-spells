# Lesson Design Contract

## Purpose

This contract defines the native design elements that structured lessons must use in Scarlett's Spells.

The goal is:
- one branded lesson language
- one builder vocabulary
- no return to free-form HTML as the primary authoring model

Design references for this contract:
- [problem_lesson_paste_ready.html](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/reference/problem_lesson_paste_ready.html:1)
- archived lesson HTML references are historical migration material, not active design canon

## Visual rules

Structured lessons should inherit the default Scarlett lesson theme:
- pink and cream palette
- serif hero titles
- uppercase eyebrow labels
- soft rounded cards
- branded section dividers
- black input text
- calm spacing rhythm with clear content hierarchy

The builder should expose the structure directly rather than expecting HTML knowledge.

## Native block set

The structured lesson system should support these native layout elements:
- `heading`
  - main branded lesson title
- `section_intro`
  - eyebrow, section title, and intro paragraph
- `rich_text`
  - supporting prose or explanation
- `callout`
  - highlighted note, example, reminder, or framed quote
- `action_link`
  - a noticeable “go read this” or “open this source” button
- `info_cards`
  - learning cards shown in a 2-column or 3-column responsive grid
- `titled_divider`
  - section line with centred pill title
- `question_text`
  - short answer
- `question_textarea`
  - paragraph answer
- `question_choice_single`
  - one answer choice
- `question_choice_multi`
  - multiple answer choices
- `question_table`
  - structured rows and columns
- `question_repeatable_interview`
  - repeated interview capture
- `comprehension_quiz_group`
  - native quiz with correctness, score, and understanding band
- `carry_forward_reference`
  - previous-lesson context
- `divider`
  - plain visual break when no title is needed

## Builder expectations

Parents should be able to create the lesson shape without raw HTML by:
- adding the right block
- reordering blocks
- duplicating blocks
- previewing the branded lesson
- deciding whether an answer block should feed spelling review

Parents should not need to:
- write HTML wrappers
- invent CSS classes
- create visual grids manually
- wire answer ids by hand

Future builder feature:
- for answerable blocks that can plausibly contain child writing, the builder should expose a parent-facing checkbox or equivalent toggle for “include this in spelling review”
- unticking that control should set the block’s canonical `exclude_from_spelling` flag instead of relying on hard-coded block defaults alone

## Pattern guidance

Use these block combinations as the default lesson grammar:

### Hero section
- `heading`
- optional `action_link`

### Standard section opening
- `titled_divider` or `section_intro`

### Explanation plus support
- `section_intro`
- `rich_text`
- `callout`

### Reading or interview guidance
- `info_cards`

### Comprehension lesson
- `heading`
- `action_link`
- `section_intro`
- `comprehension_quiz_group`
- reflection questions

### Writing lesson
- `heading`
- `section_intro`
- alternating `callout` and writing questions

## Migration rule

When converting pasted HTML lessons into structured presets:
- prefer native blocks first
- use `rich_text` only for real prose, not to fake layout structures
- do not collapse card grids or section intros into oversized generic callouts unless there is no native block available

## Done when

This contract is being followed when:
- the parent builder can reproduce the main lesson layouts from the reference lessons
- structured presets use native layout blocks rather than generic workarounds
- lesson screens look intentionally designed, not like form dumps
