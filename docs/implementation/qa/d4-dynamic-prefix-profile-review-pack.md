# Dynamic Prefix Word Lab v2 — Profile Review Pack

Status: **content review requested**. Nothing in this pack is production-enabled.

## Review decisions recorded 2026-07-22

| Profile | Content decision | Remaining gate |
|---|---|---|
| `D4_MOR_PREFIXES_DIS_MIS` | Approved | Dictation/audio and metadata/banding review |
| `D4_MOR_PREFIXES_IN_IM_IL_IR` | Approved | Dictation/audio and metadata/banding review |
| `D4_MOR_PREFIXES_RE_PRE` | Approved; `predict` root handling approved | Dictation/audio and metadata/banding review |
| `D4_MOR_PREFIXES_SUB_INTER_SUPER` | Approved; long-word suitability and the `subway`/`marine` decisions approved | Dictation/audio and metadata/banding review |

Source-backed morphology structure comes from
`data/adle/approved/d4-mor/v1/d4-mor-v1-word-analyses.json` and the approved
D4 teaching content package. The child meanings and dictation sentences below
are proposed review text; approve, amend, or reject them before dictionary
import. Each listed word is proposed as a safe same-profile transfer as well as
an eligible verified target if a real misspelling event exists. The cleaver
boundary is derived from the reviewed prefix part's `displayRange.end`; the
morphology record is the single source of truth.

## 1. `D4_MOR_PREFIXES_DIS_MIS`

Teaching message: `dis-` means *not/opposite*; `mis-` means *wrongly/badly*.
Build choices: `dis-`, `mis-`, and no prefix.
Meaning bins: **Not or opposite** / **Wrongly or badly**.
Reflection: “How did `dis-` and `mis-` change the meaning of the base word?”

| Word | Approved split | Proposed child meaning | Proposed reviewed dictation |
|---|---|---|---|
| disagree | dis + agree | not agree | “They disagree about the game.” |
| disappear | dis + appear | go out of sight | “The rabbit can disappear behind the hedge.” |
| dishonest | dis + honest | not honest | “It is dishonest to tell a lie.” |
| dissatisfied | dis + satisfied | not pleased | “She felt dissatisfied with the untidy work.” |
| misbehave | mis + behave | behave badly | “Do not misbehave in the library.” |
| mislead | mis + lead | lead someone the wrong way | “The sign did not mean to mislead us.” |
| misspell | mis + spell | spell wrongly | “Check that you do not misspell the word.” |

Review focus: preserve both letters at joins in **misspell** (`mis + spell`) and
avoid adding a second `s` in **disappear**.

## 2. `D4_MOR_PREFIXES_IN_IM_IL_IR`

Teaching message: the negative prefix changes shape to match the first letter
of the base: `in-` generally, `im-` before *m/p*, `il-` before *l*, and `ir-`
before *r*. Build choices: `in-`, `im-`, `il-`, `ir-`, and no prefix. Meaning bins: **in-/im- form**, **il- form**, **ir- form** — all
mean *not*; the sort teaches the spelling form, not different meanings.
Reflection: “Which form of the ‘not’ prefix did each base word need?”

| Word | Approved split | Proposed child meaning | Proposed reviewed dictation |
|---|---|---|---|
| illegal | il + legal | not allowed by law or rules | “Parking there is illegal.” |
| impatient | im + patient | unable to wait calmly | “He grew impatient in the long queue.” |
| impossible | im + possible | not able to happen or be done | “It is impossible to be in two places at once.” |
| incorrect | in + correct | not right | “The answer is incorrect.” |
| invisible | in + visible | unable to be seen | “The tiny insect was almost invisible.” |
| irregular | ir + regular | not even or following the usual pattern | “The shape has an irregular edge.” |
| irresponsible | ir + responsible | not showing sensible care | “It is irresponsible to leave litter behind.” |

Review focus: **illegal** has `ll` and **irregular/irresponsible** have `rr` at
the join; these are not letters to remove.

## 3. `D4_MOR_PREFIXES_RE_PRE`

Teaching message: `re-` means *again* or *back*; `pre-` means *before*.
Build choices: `re-`, `pre-`, and no prefix.
Meaning bins: **Again/back** / **Before**.
Reflection: “When did the prefix mean ‘again/back’, and when did it mean
‘before’?”

| Word | Approved split | Proposed child meaning | Proposed reviewed dictation |
|---|---|---|---|
| predict | pre + dict | say what you think will happen | “Can you predict tomorrow’s weather?” |
| preheat | pre + heat | heat before using | “Please preheat the oven first.” |
| preschool | pre + school | a school for children before primary school | “Her brother goes to preschool.” |
| preview | pre + view | see before the full thing | “We watched a preview of the film.” |
| rebuild | re + build | build again | “Workers will rebuild the wall.” |
| replay | re + play | play again | “Please replay that part of the song.” |
| return | re + turn | go or give back | “Please return the book tomorrow.” |

Review focus: approve whether **predict** is suitable for the same base/root
interaction (`dict` is an approved root rather than a standalone base word).

## 4. `D4_MOR_PREFIXES_SUB_INTER_SUPER`

Teaching message: `sub-` means *under*, `inter-` means *between*, and `super-`
means *above/beyond*. Build choices: `sub-`, `inter-`, `super-`, and no prefix.
Meaning bins: **Under** / **Between** / **Above or beyond**.
Reflection: “What position or amount did each longer prefix add?”

| Word | Approved split | Proposed child meaning | Proposed reviewed dictation |
|---|---|---|---|
| interact | inter + act | act or communicate with each other | “The children interact during the game.” |
| international | inter + national | involving more than one country | “The airport has international flights.” |
| subheading | sub + heading | a smaller heading under a main heading | “Write a subheading for the next section.” |
| submarine | sub + marine | a boat that travels under the sea | “The submarine moved under the waves.” |
| subway | sub + way | an underground railway | “We took the subway across the city.” |
| superhero | super + hero | a hero with special powers | “The superhero saved the town.” |
| supermarket | super + market | a large food shop | “We bought fruit at the supermarket.” |

Review focus: approve the dialect/cultural suitability of **subway** and confirm
that the `marine` gloss “of the sea” is sufficiently clear for the child view.

## Approval checklist

- [ ] Every child meaning is accurate, age-appropriate, and distinct enough for discovery.
- [ ? ] Each sentence is UK-English, has the target token at a reviewed index, and has approved audio text.
- [ ? ] Each word has reviewed frequency, age, complexity and pronunciation/banding metadata.
- [Y] Prefix choices and meaning bins are pedagogically correct for the profile.
- [Y] `predict` root handling and the long-word suitability decisions are approved.
- [Y] Approve/reject each profile independently for dictionary import and staging proof.

Approval of this pack does **not** enable production. Each profile still needs
its own dictionary import, staging proof, and explicit written production
approval.
