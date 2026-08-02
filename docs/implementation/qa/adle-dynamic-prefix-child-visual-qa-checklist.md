# Dynamic Prefix child visual and interaction QA checklist

Scope: the unchanged normal learner renderer opened from the staging-only
`/admin/adle-dynamic-prefix-qa` launcher. A compiler/data-caused difference is
a migration blocker. A pre-existing renderer defect is recorded separately and
does not authorise a renderer change in this stage.

## Profiles and immutable counts

| Order | Profile | Expected items |
|---:|---|---:|
| 1 | `D4_MOR_PREFIXES_UN` (`un-`) | 16 |
| 2 | `D4_MOR_PREFIXES_DIS_MIS` (`dis- / mis-`) | 16 |
| 3 | `D4_MOR_PREFIXES_IN_IM_IL_IR` (`in- / im- / il- / ir-`) | 16 |
| 4 | `D4_MOR_PREFIXES_RE_PRE` (`re- / pre-`) | 16 |
| 5 | `D4_MOR_PREFIXES_SUB_INTER_SUPER` (`sub- / inter- / super-`) | 18 |

## Repeat for every profile

- [ ] Open the launcher-returned normal `/learn/week/adle` child-session link.
- [ ] Confirm profile copy, four-word order and activity order against the
  persisted Prefix V2 payload.
- [ ] Inspect the introduction and profile-specific explanation.
- [ ] Complete the first Cleaver and verify the exact instructed cut.
- [ ] Inspect every profile-specific Cleaver arrangement; no duplicate or
  skipped split activity.
- [ ] Complete meaning sort where present and verify bins and choices.
- [ ] Complete every build and verify prefix choices and no early disclosure.
- [ ] Complete controlled spelling, Cover Check, each dictation and reflection.
- [ ] Verify correct-answer and incorrect-answer feedback, audio triggers and
  animation triggers.
- [ ] Reload mid-lesson after a persisted activity; verify resume starts at the
  next incomplete activity with no duplicate attempt.
- [ ] Finish the lesson; verify completed state, reflection and reload.

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
