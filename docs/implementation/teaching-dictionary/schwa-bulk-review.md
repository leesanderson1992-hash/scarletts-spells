# Schwa Bulk review

The ten supported Schwa/weak-vowel patterns share the existing Bulk review flow:
export or download a blank workbook, review Dictionary facts and annotations,
upload, resolve family dependencies, recheck, then publish ready words.

## Authority

- The selected approved Dictionary sense supplies the definition, pronunciation,
  spoken syllable count, stress and dictation sentence. New route publications
  carry that sense ID and a server-generated fingerprint of just that sense and
  its pronunciation. Other senses and unrelated historical rows cannot invalidate it.
- Reviewed word parts and family links remain in the Dictionary. Activity cuts
  are a separate phonological annotation; they are never inferred from morphology.
- A word–skill annotation selects an exact written span, its occurrence and sound
  (schwa or another unstressed vowel). The workbook uses middle-dot syllables,
  accepting hyphens on import and `|` between reviewed alternatives.
- Reviewed clips are reused only when the selected facts match their source.
  Changed sentences do not retain old sentence audio. The existing approved
  device-speech mechanism supplies a fallback; no external paid generation occurs.
- Optional family exploration requires a current sense-specific approved family,
  its Dictionary base/root entry and at least two approved members. Linking a
  family does not imply a shared pronunciation or a vowel alignment.
  This is independent of core readiness: a selected family that is not yet ready
  shows **Waiting** while the core word can be published and remain **Active**.
  Each new lesson reads the current approved family. Once it has enough members,
  exploration becomes **Ready** and is included without re-upload or re-publish.
  **Not used** remains an explicit opt-out. Saved lessons retain their snapshots.
  The database writer requires a valid current family when available and permits
  no family only while it is unavailable; a forged or stale family is rejected.
- Both target and practice eligibility come from the same current, approved,
  published Schwa pool. A generic legacy support row cannot admit another word.

## Save and publish

Import saves canonical reviewed facts before lesson publication, including
partial family dependencies. Saved dependencies retain the Schwa annotations so
approval of the missing base/root can resume the review. Incomplete activity
facts remain in the preview with editable controls and specific blockers.

One Publish action reviews and publishes up to 20 ready words. Retries reuse
unchanged drafts and published versions. The normal governed association,
sense-binding, route review, audio hash and publication checks remain in place.
The database assignment boundary independently checks canonical facts and family
membership. Existing immutable lesson snapshots and publication history remain.

Older reviewed publications retain compatibility reads. Their words remain in
Bulk review when canonical facts still need reconciliation. The retired
natural/actual skill is not reactivated; its replacement is final -al.

## Verification

`npx tsx scripts/schwa-workbook-regression.mts` checks all ten blank workbooks,
standardised dropdowns, readable annotation round trips, repeated-vowel
occurrences, alternatives, invalid targets/cuts and optional family handling.
Existing weak-vowel lesson, family and governed-content regressions also apply.

The staging pilot uses four word–lesson cases per pattern (40 cases), including
new and existing Dictionary entries. Initial-a invalid-target review is tested
before corrected publication. The occur family is created and occurred joins it;
both are tested with family exploration in a saved ADLE lesson. Generation uses
the normal preparation and database persistence boundary for ten disposable
learners. The staging test UI creates an explicitly labelled four-word test queue
instead of bypassing the real learner's diagnostic policy.

The release also requires signed-in workbook upload/save/publish verification,
canonical/family tamper rejection, retry checks and the repository's exact-SHA
production deployment gates. Local receipts are under
`outputs/schwa-bulk-workflow-20261121/`; these generated records are not committed.
