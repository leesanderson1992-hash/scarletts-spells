# ADLE Proficiency Task and Evidence Matrix

## Authority and scope

Classification: `APPROVED_TARGET_NOT_YET_IMPLEMENTED`

Model: `ADLE_PROFICIENCY_MODEL_V1`

This is the canonical activity-effects matrix for the target proficiency
model. It refines, but does not change, current runtime in this documentation
pass. The canonical identity, projection, dimension, and Word Treasure
boundaries are owned by
`docs/contracts/adle-spelling-proficiency-contract.md`. Exact calculations are
owned by `docs/implementation/adle-proficiency-v1-maths.md`. Word graduation,
review progression, recovery, regression, and controlled return are owned only
by `docs/contracts/adle-word-progression-and-review-contract.md`.

## Terms used in the matrix

- **Eligible positive** means an independently recorded, canonical, correctly
  produced word with the verification required for its source.
- **Breadth +1 if new** means one distinct word for each genuinely demonstrated
  governed word/skill relationship. Repetition never adds breadth.
- **Coverage** means the word's representative group and skill-relative
  complexity band are marked demonstrated; it is not extra points.
- **Independent retrieval** is correct production without a displayed answer.
- **Causal negative** requires governed resolver/error attribution. Unknown is
  retained as unknown and never blanketed across the word's skills.
- **Instructional state** means the five-state teaching decision model:
  `INTRODUCTION_REQUIRED`, `GUIDED_PRACTICE`, `RETRIEVAL`, `CONSOLIDATION`, and
  `MAINTENANCE`. Evidence environments such as isolated retrieval or
  contextual transfer are not replacement instructional states.
- **WT** means Word Treasure. Its canonical rules remain in the reward-system
  contract.

## Environment hierarchy

```text
controlled lesson < isolated independent retrieval < contextual transfer < authentic writing
```

This is a semantic ordering, not a numeric multiplier table. Contextual
Transfer is close to authentic writing but remains different because ADLE
selects the word opportunity. Repair sits outside the ordering because it is
targeted reacquisition after failure.

## Complete target matrix

The matrix begins from immutable learner outcomes and versioned word-route
facts. It maps them to proficiency effects; it does not calculate the
word-route facts.

| Activity or outcome | Environment | Breadth | Diversity / complexity | Transfer | Stability | Negative evidence | Word Treasure | Instructional-state effect | Proficiency eligibility |
|---|---|---|---|---|---|---|---|---|---|
| Assignment created, scheduled, selected, displayed, or skipped with no attempt | `EXPOSURE_ONLY` | None | None | None | None | None | None; metadata cannot create a Nugget or Forge event | May explain why a task is queued; cannot prove a state transition | Ineligible |
| Review challenge/prompt selected or writing timer started, with no word outcome yet | `EXPOSURE_ONLY` | None | None | None | None | None | None | No state transition | Ineligible |
| First-impression explanation or modelling only | `CONTROLLED_EXPOSURE` | None | None | None | None | None | None | Supports `INTRODUCTION_REQUIRED`; does not prove application | Ineligible |
| Correct governed controlled production attached to a `controlled_pass` word fact | `CONTROLLED_LESSON` | +1 if new, once per word/skill | Marks governed group/band demonstrated | None | Starts a positive observation day; a causal failure in another production remains fragility until later independent evidence resolves it | Preserve any causal failure from another production | If the word is already a Nugget, a relevant attempted ADLE word may enter Forge; no Golden Bar use | Supports movement from `INTRODUCTION_REQUIRED`/`GUIDED_PRACTICE` toward `RETRIEVAL`; invoke `ADLE_CONTROLLED_GRADUATION_V1_OR` for route action | Eligible controlled positive; the matrix does not derive the pass |
| Governed controlled-production failures attached to a `controlled_not_passed` word fact | `CONTROLLED_LESSON` | No positive breadth | No positive coverage | None | Governed causal failures add current fragility | Preserve each attempt outcome; project each only to its causal skill | May enter the verified misspelling/correction-attempt Treasure path; never a Golden Bar | Supports controlled reacquisition under the word-progression policy | Negative events eligible where causal; no positive controlled event |
| Later clean answer-hidden controlled production after reacquisition | `CONTROLLED_REACQUISITION` | +1 if this is the first clean successful demonstration | Marks governed group/band | None | New controlled observation; prior failures remain | No new negative | Source-specific Forge engagement; no Golden Bar use | Invoke the word-progression policy with the new controlled outcome | Eligible controlled positive; not transfer |
| Scaffolded activity with answer visible, copying, tracing, matching, recognition, or guided segmentation | `CONTROLLED_SCAFFOLDED` | None by default | None by default | None | None | A wrong interaction is formative, not proficiency-negative unless the task explicitly required independent spelling and causal attribution exists | May count engagement/correction attempt only under reward contract; not Golden Bar use | Supports `GUIDED_PRACTICE`; cannot establish independent retrieval | Not positive proficiency evidence by default |
| Scaffolded activity ending in a clearly separated, answer-hidden production | `CONTROLLED_LESSON` for final attempt only | +1 if new from the final production | Marks group/band | None | Positive observation day; same-session repeats dedupe | Causal negative if the answer-hidden spelling is wrong and attributable | Existing Nugget may enter Forge; no Golden Bar use | It affects graduation only when it is the governed Cover–Write slot; other scaffolded finals do not replace either required production | Final attempt eligible; scaffolding interactions ineligible |
| Other controlled spelling production or dictation from memory | `CONTROLLED_LESSON` | +1 if new | Marks group/band | None | May support basic persistence when on a later distinct day; no contextual/authentic count | Causal negative on a verified misspelling | Existing Nugget may enter Forge; no Golden Bar use | Does not alter the word-route fact unless the Word Progression contract classifies the task as a governed opportunity | Eligible positive/negative with lineage; no independent route authority |
| Ordinary isolated retrieval on a later day, including an unused Review target checked directly | `ISOLATED_RETRIEVAL` | +1 if new | Marks group/band | Counts as independent retrieval, not contextual or authentic transfer | Counts as a later observation day and span when spaced | Causal negative if wrong | No authentic-use increment; may be an ADLE Forge attempt if reward rules otherwise qualify | Correct supports `RETRIEVAL`; repeated spaced success may support `CONSOLIDATION` | Eligible, but cannot satisfy contextual/authentic gates |
| Contextual Transfer Review: target spelled correctly in the original creative/problem-solving writing | `CONTEXTUAL_TRANSFER` | +1 if new | Marks group/band; can satisfy transfer-at-complexity coverage | +1 distinct contextual word for every governed demonstrated skill | Counts as independent transfer, observation day, and elapsed span | None | Not authentic/original Golden Bar use by default because ADLE selected the opportunity; may preserve Forge context | Supports `CONSOLIDATION` and, with other gates, `MAINTENANCE` | Strong eligible positive |
| Contextual Review target absent from writing, followed by direct correct retrieval | `ISOLATED_RETRIEVAL` | +1 if new | Marks group/band | Independent retrieval only; zero contextual count | Counts if spaced | None | No authentic-use increment | Supports independent retrieval, not contextual transfer | Eligible isolated positive |
| Attributable scheduled-review failure with `controlled_reacquisition_required` fact | Actual independent check environment | No positive breadth; historical breadth remains | No positive coverage | No positive transfer | Opens or retains current instability | Negative only for the resolver-attributed causal skill | Reward contract only | Supports `GUIDED_PRACTICE`/`RETRIEVAL` need; route action is owned by `ADLE_SPACED_REVIEW_REGRESSION_V1` | Eligible causal negative; original outcome immutable |
| Attributable scheduled-review failure with `recovery_scheduled` fact | Actual independent check environment | No new breadth; historical breadth remains | No positive coverage | No positive transfer | Adds causal recurrence and an unresolved lapse | Negative only for the resolver-attributed causal skill | Reward contract only | Supports `CONSOLIDATION` with a nearer retrieval need; route action is owned by the word-progression policy | Eligible causal negative |
| Independent recovery check with `recovery_passed` fact | `ISOLATED_RETRIEVAL` unless delivered contextually | No additional breadth for the same word | Existing coverage unchanged | Counts only according to actual recovery environment; isolated recovery is not contextual/authentic | Resolves the current failure episode while preserving lapse-then-recovery history | Earlier negative remains historical | No authentic-use increment | Supports continued `RETRIEVAL`/`CONSOLIDATION`; route action is owned elsewhere | Eligible independent success; never rewrites failure |
| Independent recovery check with `recovery_failed` fact | Actual independent check environment | No positive breadth | No positive coverage | None | Adds causal recurrence; episode remains unresolved | Causal negative only | Reward contract only | Invoke `ADLE_SPACED_REVIEW_REGRESSION_V1`; the matrix does not compute the next rung | Eligible causal negative |
| Contextual Review original target unaccounted for, with no governed attribution | `UNKNOWN` | None | None | None | None until resolved | No guessed skill penalty | No automatic Treasure mutation | Keeps a review/verification need; does not invent instructional diagnosis | Ineligible until governed resolution |
| Immediate Review repair/follow-up spelled correctly | `REPAIR` | None, including when no earlier clean success exists | None | None | Records repair only; does not resolve the episode or reset consecutive failures | Preserves original negative event | May count correction engagement under reward rules; never an authentic Golden Bar use | May complete the immediate repair interaction, but cannot restore Review progression or controlled graduation | Reacquisition metadata only; ineligible for breadth/transfer/stability |
| Review repair attempted but not secured | `REPAIR` | None | None | None | Original causal error remains unresolved | No second synthetic failure; retain repair outcome separately | Correction engagement only if reward rules qualify | Keeps/reopens guided practice and schedules later reacquisition | Not a new negative proficiency event unless a separately governed independent attempt exists |
| Later independent success after a previous Review failure | Source-specific: isolated, contextual, or authentic | +1 only if still new | Marks coverage for the later event's source | Counts according to the later environment | Resolves current instability only when it is the state machine's scheduled/recovery check; history remains | Does not delete the earlier negative | Source-specific reward effect | May move from reacquisition back toward transfer/maintenance | Eligible new event; repair is excluded |
| Verified authentic correct use in learner-chosen writing | `AUTHENTIC_WRITING` | +1 if new for every governed demonstrated skill | Marks group/band and authentic-at-complexity coverage | +1 distinct authentic word for every governed demonstrated skill | Strong observation day/span; repeated later uses strengthen stability | None | After Forge, parent-confirmed eligible use may increment this exact word's Golden Bar counter once per governed task field | Strong evidence for `CONSOLIDATION`/`MAINTENANCE`, even without a prior lesson | Strongest ordinary eligible positive after verification |
| Suspected but unverified correct authentic use | `AUTHENTIC_CANDIDATE` | None until verified | None until verified | None until verified | None until verified | None | May appear as suspected reward evidence but cannot increment canonical use count | No instructional-state transition | Ineligible pending verification |
| Verified authentic misspelling with governed causal mapping | `AUTHENTIC_WRITING` | No positive breadth | No positive coverage | No positive transfer | Adds recurrence/unresolved slip to causal skill | Causal negative only | After correction engagement may discover/update the exact word's Nugget journey | Creates/reactivates instructional need for the causal skill; does not demote unrelated skills | Eligible causal negative |
| Authentic misspelling without governed cause | `AUTHENTIC_UNKNOWN` | None | None | None | No skill recurrence until governed | Retain word-level issue; no guessed skill negative | May begin word-specific verification/correction workflow under reward rules | Requires review/diagnosis; no guessed teaching route | Ineligible at skill level pending authority |
| Same-session self-correction after an initial misspelling | `SELF_CORRECTION` | No positive breadth from the corrected form by itself | None | None | Records responsiveness; does not erase causal error | Preserve original causal negative; do not create a second failure | May support correction-attempt/Nugget semantics; no Golden Bar use | Can move the immediate workflow into guided reacquisition | Not positive proficiency evidence by itself |
| Later independent correction in a new scheduled/recovery task after a prior error | Source-specific | +1 if new | Marks coverage | Counts according to the new task environment | Resolves the open episode and resets consecutive failures | Earlier negative remains in history | Source-specific | Supports progression from the current rung | Eligible as the new independent event |
| Repeated correct use of the same word on the same day | Source-specific | No additional breadth | No additional band/group coverage | No additional distinct-word transfer count | Same-day occurrences dedupe for observation-day gates; preserve raw lineage | None | Reward dedupe remains Word Treasure + task-field scoped | No automatic transition | Raw events retained; derived counts dedupe |
| Repeated correct use of the same word on a later day | Source-specific | No additional breadth | No additional coverage identity | Does not add a distinct transfer word, but may mature that word's transfer history | Adds an observation day/span and may resolve a prior slip if independently produced | None | Authentic later task fields may increment the exact Treasure under reward rules | Supports maintenance/retention | Eligible for stability only, plus source-specific transfer maturity |
| Parent verifies a suspected authentic correct use | `VERIFICATION_TRANSITION` | Activates the underlying authentic event if all other gates pass; no extra event | Activates that event's coverage | Activates that event's authentic transfer | Activates that event's timestamp; verification time does not replace occurrence time | None | Converts suspected evidence into canonical Word Treasure evidence where the reward contract permits | Allows evidence-informed state change; verification itself is not performance | Eligibility transition, never duplicate evidence |
| Parent verifies a causal misspelling/mapping | `VERIFICATION_TRANSITION` | None | None | None | Activates recurrence from the original occurrence time | Activates only the verified causal skill | Enables the separate verified-misspelling/correction Treasure path | Enables causal instructional routing | Eligibility transition, never duplicate failure |
| Lesson or Review completion boundary after all item outcomes are recorded | `COMPLETION_BOUNDARY` | None beyond the item outcomes | None beyond the item outcomes | None beyond the item outcomes | None beyond the item outcomes | None beyond the item outcomes | May allow reward-owned handling of already-recorded eligible word attempts; completion alone never mints a Golden Bar | May trigger scheduling/state recomputation from the outcomes; completion itself is not evidence | Ineligible as an additional proficiency event |
| Parent inspects/completes Review Work without changing evidence facts | `ADMIN_WORKFLOW` | None | None | None | None | None | None | None | Ineligible |
| Word-map/support/profile row exists with no learner event | `CONTENT_METADATA` | None | None | None | None | None | None | May make content selectable or a level certifiable; does not teach a child | Ineligible as learner evidence |

## Projection across multiple skills

For any positive-eligible row, the singular canonical word event is interpreted
once and then referenced by each positive-evidence-eligible
`CanonicalWordSkillRelationship`. Source strength does not change during
projection.

For negative rows, the singular event is projected only to the governed causal
relationship(s). A word with three positive relationships can therefore create
three positive projections when correct and one negative projection when a
specific mechanism causes its misspelling.

## Instructional-state guardrails

- Proficiency and instructional state are related projections, not aliases.
- A level does not by itself decide the next lesson; causal errors, prerequisite
  order, readiness, schedules, and content availability still matter.
- Successful immediate repair may close the repair interaction but cannot mark
  transfer secure.
- Later recurrence may reactivate teaching while preserving the highest
  historically attained evidence and Vault history.
- Assignment creation, metadata presence, lack of detected errors, and parent
  inspection alone never advance an instructional state.

## Current-runtime differences requiring convergence

- Current Slice 4/5 pricing collapses word histories to state-priced breadth;
  the target uses source effects across four dimensions without breadth
  multipliers.
- Current Review v3 already preserves original outcomes and separates repair,
  which aligns with the target.
- Review writing already provides a meaningful mixed writing challenge, but
  target proficiency must explicitly classify original writing outcomes as
  `CONTEXTUAL_TRANSFER` and direct unused-target checks as
  `ISOLATED_RETRIEVAL`.
- Prompted Review writing must not silently become authentic proficiency or
  Golden Bar evidence merely because an existing row/source uses an
  `authentic_use` name.
- Current authentic-writing confirmation boundaries remain valid and should be
  adapted, not bypassed.
