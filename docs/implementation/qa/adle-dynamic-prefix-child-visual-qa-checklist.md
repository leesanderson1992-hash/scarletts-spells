# Dynamic Prefix child visual and interaction QA checklist

Scope: the unchanged normal learner renderer opened from the staging-only
`/admin/adle-dynamic-prefix-qa` launcher. A compiler/data-caused difference is
a migration blocker. A pre-existing renderer defect is recorded separately and
does not authorise a renderer change in this stage.

## Profiles and expected counts

| Order | Profile | Expected items |
|---:|---|---:|
| 1 | `D4_MOR_PREFIXES_UN` (`un-`) | 16 |
| 2 | `D4_MOR_PREFIXES_DIS_MIS` (`dis- / mis-`) | 16 |
| 3 | `D4_MOR_PREFIXES_IN_IM_IL_IR` (`in- / im- / il- / ir-`) | 20 |
| 4 | `D4_MOR_PREFIXES_RE_PRE` (`re- / pre-`) | 16 |
| 5 | `D4_MOR_PREFIXES_SUB_INTER_SUPER` (`sub- / inter- / super-`) | 18 |

## Repeat for every profile

- [ ] Open the launcher-returned normal `/learn/week/adle` child-session link.
- [ ] Confirm profile copy, four-word order and activity order against the
  persisted Prefix V2 payload.
- [ ] Inspect the introduction and profile-specific explanation.
- [ ] On genuine Learn 2/3, verify one separate meaning/rule card per target prefix.
- [ ] Complete the first Cleaver and verify the exact instructed cut.
- [ ] Inspect every profile-specific Cleaver arrangement; no duplicate or
  skipped split activity.
- [ ] Deliberately choose one wrong Meaning Sort category and verify feedback describes only the selected prefix and ends `Try again.`
- [ ] For in-/im-/il-/ir-, perform the genuine Prefix Form Sort equivalent and do not label it Meaning Sort in child copy.
- [ ] Confirm no Prefix Meaning Sort results/overview card appears.
- [ ] Complete every build and verify prefix choices and no early disclosure.
- [ ] Verify every Build has at least three unique reviewed choices, all profile targets, and one correct choice.
- [ ] Complete controlled spelling, Cover Check, each dictation and reflection.
- [ ] Verify Cover remains open at 79%, snaps fully closed at 80%, protects the answer, and does not complete before Check.
- [ ] Verify Reflection begins `Today we studied:`, reuses the Learn cards, contains the meaning and rule prompts, and retains typed text after reload.
- [ ] Verify correct-answer and incorrect-answer feedback, audio triggers and
  animation triggers.
- [ ] Reload mid-lesson after a persisted activity; verify resume starts at the
  next incomplete activity with no duplicate attempt.
- [ ] Finish the lesson; verify completed state, reflection and reload.

Use these neutral reflection drafts for the retained staging evidence so resume
and completion can be compared deterministically:

| Profile | Reflection draft |
|---|---|
| `un-` | `I will remember that un- goes at the beginning and changes the meaning.` |
| `dis- / mis-` | `I will check whether the word means not or wrongly.` |
| `in- / im- / il- / ir-` | `I will look at the first letter of the base word.` |
| `re- / pre-` | `I will check whether the word means again or before.` |
| `sub- / inter- / super-` | `I will remember under, between and above or beyond.` |

## Viewport and accessibility pass

Run the complete profile checklist at desktop (`1440 × 900`) and mobile
(`390 × 844`) widths.

- [ ] No clipped text, controls, focus ring, tile, drawer or horizontal page
  overflow.
- [ ] Keyboard order follows visual order; every interactive control is
  reachable and operable without a pointer.
- [ ] Visible focus is retained through activity transitions.
- [ ] Buttons, inputs, bins, audio and progress controls have correct accessible
  names and state announcements.
- [ ] Copy, meanings, choices, dictations, word order and cut positions are
  exact at both widths.
- [ ] Audio and animation do not fire early, repeat unexpectedly or disclose an
  answer.
- [ ] No activity is duplicated, skipped or completed before its intended
  evidence is captured.

## Receipt classification

Record for each profile: assignment ID, owner, child, plan date, direct URL,
created/existing status, item count, desktop result, mobile result,
reload/resume point, completion result and defect classification. Retain only
the explicitly named manual-QA assignments; clean disposable automation rows.

The completed 2026-08-03 engineering pass is recorded in the
[staging receipt](adle-dynamic-prefix-pedagogy-ux-2026-08-03/staging-receipt.md)
and [25-image evidence index](adle-dynamic-prefix-pedagogy-ux-2026-08-03/adle-dynamic-prefix-pedagogy-ux-2026-08-03.md).
The final human screenshot and child acceptance pass completed on 2026-08-03.
The checklist remains reusable for later production observation, but it is no
longer an open gate for the completed staging stage. Accepted commit:
`f2b86d2037a4780a2cf3e3642f75e15319e5f199`. The authorised 2026-08-03
production attempt was rolled back because the live QA URL redirected to login
instead of returning the required HTTP `404`. Production is shadow with prior
profile content restored, so natural production observation has not begun.
See the [rollback receipt](adle-dynamic-prefix-pedagogy-production-rollback-receipt-2026-08-03.md)
and [production publication handoff](../dynamic-prefix-pedagogy-production-publication-handoff-2026-08-03.md).
