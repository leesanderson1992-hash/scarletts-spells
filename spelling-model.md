# Spelling Model — Scarlett’s Spells

## Purpose

This file explains how the spelling engine should think.

The system should not jump straight from wrong word to family.

It should use this sequence:

1. detect likely misspelling
2. suggest correction
3. diagnose what actually went wrong
4. assign teaching mode
5. choose best lesson family
6. generate practice words
7. place words into the spelling queue and child session

## Canonical incorrect spelling path

The default spelling golden path is:

1. Child submits writing, or parent uploads writing
2. Engine detects likely misspellings
3. Engine avoids duplicating words already active in the spelling queue
4. Submission appears in `Review work`
5. Parent sees:
   - incorrect-word count
   - highlighted likely incorrect words in the original text
   - ability to add missed words manually
6. Parent reviews:
   - suggested correction
   - what went wrong
   - teaching mode
   - lesson family
7. Approved items generate spelling practice automatically in the child queue
8. On next login, the child may see a small notice telling them how many Golden Nuggets were discovered yesterday and inviting them into daily spelling
9. If a Gold Bar word is misspelt again:
   - it drops back to `In the Machine`
   - it returns to next-day review
   - one later correct review can restore it to `Gold Bar`
   - no extra Gold Coins are earned for the same word

## Daily assignment behavior

The spelling queue is the source of truth.

That means:
- parent review approves which words enter the active queue
- words already active are not duplicated
- if no spelling assignment exists for today, the app should generate one automatically from the active due queue when the child opens spelling

The parent does not need to press a daily assignment button each morning just to keep the queue moving.

## Core distinction

### What went wrong
This describes the mistake.

### Teaching mode
This describes the teaching method needed.

### Lesson family
This describes the practice grouping.

These are related but not identical.

## Reward contract alignment

Spelling uses the shared reward contract in [docs/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/reward-system-contract.md:1).
Workflow and approval semantics use the shared progress contract in [docs/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/universal-progress-contract.md:1).

That means:
- Golden Nugget, In the Machine, Gold Bar, and Proven Bag are progress states
- Gold Coins are the only spendable currency
- Gold Bars represent mastery and can later convert into Gold Coins
- task reward rules and progress-state labels must stay separate
- `submitted`, `approved`, and `returned` are workflow states, not reward states

## Progress state path for spelling items

For misspelt words, the expected emotional journey is:

- likely misspelling identified -> Golden Nugget
- first real practice begins -> In the Machine
- secure retrieval across the scheduled review path -> Gold Bar
- wider secured collection or family completion -> Proven Bag

The word itself should stay visible historically even after later conversion activity in the reward system.

---

## Main teaching modes

### tricky_word
Use for:
- common irregular words
- high-frequency memory words
- words better learned as whole words with tricky parts

Examples:
- because
- friend
- people
- until

### rule
Use for:
- clear spelling rules
- doubling rules
- dropping/keeping letters before suffixes
- y-to-i changes
- soft c / soft g
- ck and similar teachable pattern mechanics

Examples:
- stopped
- carried
- moving
- taste
- chicken

### morphology
Use for:
- prefix/suffix/root structure
- meaning-bearing word parts
- spelling changes best understood through structure

Examples:
- happiness
- careless
- rewrite
- movement

### sound
Use for:
- wrong vowel grapheme
- weak/unstressed vowel issues
- sound-spelling comparisons
- phonic pattern errors

Examples:
- `tuday` -> `today`
- separate
- sweetener
- vowel-pattern confusion

### homophone
Use for:
- homophone confusion
- meaning-choice lessons where the spelling depends on sentence meaning

Examples:
- there / their / they’re
- to / too / two
- weather / whether
- whose / who’s

---

## Important principle

The family should be chosen from the actual error, not just the corrected word.

Bad approach:
- corrected word contains `ea`, so choose an `ee/ea` family

Better approach:
- compare wrong and correct forms
- identify what changed
- choose the most teachable family for that mistake

Diagnosis should drive:
1. teaching mode
2. family recommendation
3. parent review wording
4. child interaction style

---

## Useful diagnosis types

Current useful set:
- wrong_vowel_grapheme
- wrong_final_vowel_pattern
- missing_double_letter
- missing_final_e
- omitted_unstressed_vowel
- wrong_suffix_spelling
- wrong_prefix_spelling
- tricky_whole_word_error
- ck_pattern_error
- y_to_i_suffix_error
- homophone_confusion

Only leave `What went wrong` effectively unknown when the engine genuinely cannot identify a useful diagnosis.

---

## Teaching mode mapping

Preferred MVP mapping:
- wrong_vowel_grapheme -> sound
- wrong_final_vowel_pattern -> sound
- omitted_unstressed_vowel -> sound
- missing_final_e -> rule
- missing_double_letter -> rule
- ck_pattern_error -> rule
- y_to_i_suffix_error -> rule
- wrong_suffix_spelling -> rule
- wrong_prefix_spelling -> morphology
- tricky_whole_word_error -> tricky_word
- homophone_confusion -> homophone

Do not use `Careless performance error` as a generic fallback.
Only use it when the parent explicitly marks an item careless, or when there is strong evidence of a true slip.

---

## Family source of truth

Preferred source:
- Supabase `word_families`

Fallback:
- built-in family catalog

When Supabase data exists, prefer it for:
- family label
- teaching note
- example / practice words
- optional homophone sentence prompts

Built-in data should stay as safe fallback, not the primary catalog.

---

## Family recommendation principles

The lesson family should only be treated as a strong main field when:
- there is a clear teachable family
- that family can generate a sensible practice set
- it helps the parent understand the lesson

If no strong family exists:
- use a quieter fallback such as `tricky/common word`
- or `no specific family selected`
- do not pretend certainty

Homophones should use:
- the specific homophone set first
- then a broader homophone group if needed

---

## Child practice model

The child session is not just `look, cover, write, check`.

The app should use teaching-mode-specific flows before the write/check part:

### tricky_word
- Look
- Say
- Spot tricky bit
- Cover
- Write
- Check
- Use

### rule
- Show rule
- Compare example
- Say rule
- Cover
- Write
- Check
- Use

### morphology
- Break apart
- Explain parts
- Rebuild
- Cover
- Write
- Check
- Use

### sound
- Hear sound
- Compare spellings
- Choose grapheme
- Cover
- Write
- Check
- Use

Important:
- the child can get the spelling-pattern choice wrong
- the app should explain what was missed
- then continue into cover/write rather than hard-blocking the session

### homophone
- Read sentence
- Choose meaning word
- Say sentence
- Cover
- Write
- Check
- Use

Important:
- homophones are meaning-choice lessons
- sentence meaning matters more than spelling shape alone

---

## Queue and practice-set model

## Boundary with course-task motivation

The spelling system and the course/task system should stay separate.

That means:
- spelling queue rewards should continue to come from spelling practice
- course/task check-in rewards should come from logging course work
- both systems may reuse similar visual language, but they should not silently share completion logic

Preferred near-term rule:
- one daily course check-in reward max
- spelling rewards continue to be driven by spelling-session behavior

If the product later unifies these visually, keep the underlying triggers explicit and deterministic.

Every planned set should feel like a real lesson.

Preferred structure:
- 1 focus word
- 5 family words
- review words separate

Preferred child queue order:
1. focus word
2. same-family core words
3. same-family bonus words
4. due review words
5. closely related family words only if still needed
6. stop cleanly if nothing good remains

Do not jump to unrelated families just to fill time.

## Review cadence

Use this default review rhythm for spelling words:

- wrong word found -> due next day
- if correct there -> due again in 3 days
- if correct there -> due again in 7 days
- if correct there -> due again in 14 days
- if correct there -> Gold Bar

This is the canonical cadence for the docs.

Important:
- this cadence is for spelling review words, not course cycles
- the child should not be able to farm mastery by repeating the same word in a single burst
- each step should happen on a later review occasion

## Regression rule

If a word has already become a Gold Bar and is later misspelt again:
- it drops back to `In the Machine`
- it should re-enter the review path
- one later correct review can restore it to secure
- re-winning the same word must not mint extra Gold Coins

---

## Example interpretations

### tast -> taste
What went wrong:
- missing_final_e

Teaching mode:
- rule

Best family:
- silent_e_words

### chiken -> chicken
What went wrong:
- ck_pattern_error

Teaching mode:
- rule

Best family:
- ck_pattern

Fallback if unavailable:
- tricky_common_words

### realy -> really
What went wrong:
- missing_double_letter

Teaching mode:
- rule

Best family:
- double_letters

### happyness -> happiness
What went wrong:
- y_to_i_suffix_error

Teaching mode:
- rule or morphology
- for MVP, `rule` is acceptable

Best family:
- change_y_to_i

### tuday -> today
What went wrong:
- wrong_vowel_grapheme or unstressed-vowel-type error

Teaching mode:
- sound

Best family:
- schwa_unstressed_vowel or another fitting vowel family

Important:
Do not assume this is the same as `todai -> today`.

### todai -> today
What went wrong:
- wrong_final_vowel_pattern

Teaching mode:
- sound

Best family:
- a matching final-vowel-pattern family if available

### there -> their in sentence context
What went wrong:
- homophone_confusion

Teaching mode:
- homophone

Best family:
- the specific homophone set

---

## Confidence and honesty

The UI should not overstate certainty.

If diagnosis is still weak or unknown:
- show that clearly
- avoid presenting a strong-looking family as if it were definitely right

The goal is parent trust, not fake certainty.
