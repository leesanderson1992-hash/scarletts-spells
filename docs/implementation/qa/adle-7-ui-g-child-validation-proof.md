# ADLE 7-UI-G genuine-child validation proof

Status: corrective unaided completion passed; comprehension capture and performance follow-up remain open.

This form is for one first-time, intended-age learner. It closes
`7UI-PROOF-D4-MOR-CHILD` only when the learner completes the lesson unaided and
meets the comprehension criteria below. One observation is qualitative pilot
evidence, not population-level usability evidence.

## Consent and privacy

- Obtain parental consent before the session.
- Record the app screen only: no camera and no identifying audio.
- Use an anonymised session ID; do not commit a child name, login, reflection,
  recording, deployment token or other identifying information.
- Store the recording outside the public repository. Record only its private
  retention location, checksum and consent confirmation.
- Do not demonstrate Word Lab beforehand and do not coach during the run.
- Stop if the learner asks to stop or wellbeing requires it. An inability to
  continue is a failed proof, not an invitation to prompt.

## Test-day runbook

Use the latest successful Vercel Preview for
`review/adle-7-ui-g-word-lab`, staging Supabase and a disposable QA family.
Chrome on the validated MacBook is the default; Safari is also accepted. A
phone, physical touch and performance throttling are not required for this
observation.

Before the learner arrives:

1. Create a fresh anonymised session ID in the form
   `UI-G-CHILD-YYYY-MM-DD-A`.
2. Create a disposable staging parent and child, allowlist only that child,
   seed the seven approved pilot words and generate an unused-date assignment.
3. Sign in, open `/learn/week/adle`, confirm the first Learn screen is visible,
   then make no further interaction.
4. Start a screen-only recording with no microphone or camera. Confirm that no
   account credentials, notifications or identifying filenames are visible.
5. Keep this form available to the observer on a separate device or on paper;
   do not cover or interrupt the learner's app screen to take notes.

Read this once, exactly, before handing over control:

> This is a spelling activity for you to try by yourself. Work through it in
> whatever way makes sense to you. I won't tell you any answers, but you can use
> anything the activity offers. You can stop at any time.

During the lesson, do not point, demonstrate, read text aloud, explain `un-`,
suggest a control or correct an answer. If the learner asks for help, record the
request and reply only: “I can't help with the activity, but you can decide what
to try next.” Stop for distress or a request to stop.

After the completed page appears, ask these neutral questions in order and
record only anonymised paraphrases:

1. “What is a prefix?”
2. “Where does `un-` go in a word?”
3. “What can `un-` mean?”
4. “Can you tell me what `un-` is doing in one of the words you saw?”
5. “Was there any part that was confusing or that you would change?”

After questioning, verify the database contract, capture the recording's
SHA-256 checksum, stop the recording, clean the fixture in `finally`, remove
the temporary allowlist/gate and confirm that no child-scoped rows remain.

## Session identity

| Field | Record |
|---|---|
| Session ID | Pending |
| Tested commit and preview | `UI-G-CHILD-2026-07-16-A` (pre-corrective `c12fd31`); corrective re-run on `ae1316e` staging Preview |
| Device / browser | Pending |
| Date / observer | Pending |
| Parental consent confirmed | Must be confirmed in the private observation record before the re-run |
| Screen-only recording checksum | Pending |
| Recording retained outside repository | Pending |
| Fixture and temporary allowlist removed | Pass after corrective re-run; disposable child, assignments, fixture rows, gate and allowlist removed |

## Timed observation

Add one row for every hesitation over five seconds, repeated tap, wrong chop,
unexpected replay, help escalation, misunderstood affordance or visible change
between productive exploration and confusion.

| Time | Phase | Observable behaviour | Duration / attempts | Productive exploration or confusion | Product response | Severity |
|---|---|---|---|---|---|---|
| During dictation | Dictation | Parent clarified one word after the learner could not make it out | 1 adult intervention | Confusion | Child continued after clarification | Blocking |
| Discover | Meaning change | Separated word parts were reported as confusing and not purposeful | Reported feedback | Confusion | Replace with meaning-change cards | Major UI-H / corrected in UI-G follow-up |
| Split | Cleaver | Child enjoyed chopping and requested louder sound and sparkles | Reported feedback | Productive exploration | Strengthen interaction sound and success effect | Minor UI-H / corrected in UI-G follow-up |
| Rebuild | `un + happy` | Child found the action unchallenging | Reported feedback | Confusion about purpose | Remove this transition | Major UI-H / corrected in UI-G follow-up |
| Corrective re-run | Whole lesson | Completed without adult intervention | 0 adult prompts | Productive completion | Lesson completed and saved | Pass |
| Split | Correct answer feedback | Sparkles remained visible on the held correct-feedback screen | Reported feedback | Minor visual persistence issue | Make sparkles a short-lived impact effect | Minor follow-up |
| Cover Check | Cover motion | Child liked the sliding cover motion | Reported feedback | Positive engagement | Keep the direct cover control and motion | Keep |
| Narration | Guide and dictation | Clearer, but the built-in voice sounded scary | Reported feedback | Tone concern; did not prevent completion | Replace with reviewed natural British narration | Major follow-up |
| Completion | Finish | Clearing/completion took noticeably too long | Reported feedback | Waiting / pacing concern | Measure and optimise Finish server-action path | Major follow-up |

## Completion and comprehension

| Criterion | Result | Observer evidence |
|---|---|---|
| Completed Learn through reflection without adult help | Pass on corrective re-run | No adult intervention reported. |
| No answer was exposed during recall | Pending | |
| No critical confusion or distress | Pending | |
| Understood how to operate Split and Rebuild | Mixed | Split was enjoyed; rebuild was not perceived as purposeful. |
| Reacted meaningfully to spelling/capital/punctuation recap | Pending | |
| Reflection supported review rather than assessment behaviour | Pending re-run | |
| Explained that a prefix is added at the start | Pending | Record a non-identifying paraphrase only |
| Explained that `un-` can mean NOT or REVERSE/OPPOSITE | Pending | Record a non-identifying paraphrase only |

Also record narration replays, mute use, Help use, wrong Split boundaries,
spelling corrections and whether the child could distinguish `unfair`/`unkind`
from `unlock`.

## Data result

Before cleanup, verify one completed header, 16 completed items, 14 attempts
(six guided, four controlled, four dictation), one private reflection and four
learning/taught/schedule rows. Reload must not change those counts. After
cleanup, verify that all disposable child-scoped fixture rows are absent.

## Decision and UI-H triage

Passing requires unaided completion, no answer exposure, no critical confusion
and an age-appropriate explanation of where `un-` goes and at least one of its
two authored meanings. Inability to complete, distress or fundamental
misunderstanding blocks UI-G. Minor wording, pacing and hesitation findings are
recorded below for UI-H rather than silently changing the frozen pilot.

Use these severity rules:

- **Blocking:** adult coaching is required; the learner cannot finish; an
  answer is exposed; distress occurs; the learner cannot explain that a prefix
  goes at the start or cannot give either the NOT or REVERSE/OPPOSITE meaning;
  or the database/privacy/cleanup contract fails.
- **Major UI-H:** the learner finishes unaided and meets comprehension, but a
  control causes repeated confusion, the same failed action recurs after
  scaffolding, or a hesitation materially interrupts the lesson.
- **Minor UI-H:** wording, pacing, visual preference or a brief recoverable
  hesitation that does not affect completion or comprehension.

| Finding | Severity | Blocks UI-G | UI-H action / owner |
|---|---|---|---|
| Dictation was unclear enough to require adult clarification | Blocking | Yes | Use reviewed friendly British narration clips at 0.7x; rerun unaided and record the result. |
| Discover meaning interaction and trivial rebuild lacked a clear purpose | Major UI-H / corrective UI-G follow-up | No | Replace with meaning-change cards and remove the `un + happy` rebuild; validate in re-run. |
| Cleaver sound/effects, post-sort overview and Cover Check pacing | Minor UI-H / corrective UI-G follow-up | No | Strengthen feedback, show summary after sort and make Cover Check direct; validate in re-run. |

| Final field | Record |
|---|---|
| Child proof decision | Provisional pass for unaided completion; do not close until comprehension answers and Finish latency follow-up are recorded. |
| Blocking issues | No adult intervention on the corrective run. Comprehension answers were not captured; Finish latency requires measurement. |
| Observer / date | Pending |

Do not change the proof register from `not_started` until the observation and
database cleanup both pass.
