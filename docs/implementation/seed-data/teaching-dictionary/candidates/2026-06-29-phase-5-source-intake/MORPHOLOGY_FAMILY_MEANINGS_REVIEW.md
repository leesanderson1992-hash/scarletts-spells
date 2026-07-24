# Morphology family meanings: approval review

`csv/base_word_family_members.csv` now contains 227 concise, child-friendly
meaning drafts across 87 base-word families. Where an affix is transparent,
the idea is woven into the meaning (for example, *interact* is “to act or
communicate with each other” and *unhappy* is “not happy”).

## Recorded human decision

All 227 generated child-friendly meanings were reviewed and approved by Katie
Sanderson on 2026-07-24T15:53:22+01:00. The reviewed meaning-pair fingerprint
is:

```text
acdc53a6c5f8aa3cbb73908539d7dd0020307dcd948fc7b7791b676872b09221
```

The CSV records that reviewer and timestamp on every family-member row. This
approval is limited to the child-friendly meaning field. It does not approve
or assert the completeness of route activation, import batches, word support,
teaching-content versions, morphology transformations, dictation, or any
other Base Word runtime prerequisite.

## Reviewer decision for each row

1. Check that the meaning is accurate for the intended sense of the displayed
   word and is appropriate for the target learner.
2. Amend the wording where a more concrete or curriculum-aligned explanation
   is needed.
3. Check the meaning supports—not contradicts—the stated base-word family and
   word sum.
4. Record any later correction as a new named human decision, with an
   ISO-8601 timestamp and an updated meaning-pair fingerprint.

The runtime loader requires `approved_for_first_exposure`, as well as a
non-empty child-friendly meaning, before it can create a base-word-family
lesson snapshot. This approval records only one of the required inputs; it
does not authorise import, route activation, staging sync, or production
release.
