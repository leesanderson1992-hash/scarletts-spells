# Reviewed pilot: -able/-ible lesson membership audit

The Production Teaching Dictionary contains approved, typed Overview morphology
and one current approved family for each of the 14 reviewed pilot words. The
reviewed CSV assigns 13 of those words to `D4_MOR_SUFFIXES_ABLE_IBLE`.
Read-only Production inspection of the active, production-enabled profile found
only three current members from that set: **readable, comfortable, enjoyable**.
The other ten have a reviewed word-skill pair but no current suffix-profile
member, so the specialist ADLE lesson cannot select them as reviewed members.

The audit tool `scripts/audit-canonical-pilot-route-memberships.mts` prepares
route facts from the reviewed CSV's canonical Overview and the active profile's
single meaning group. All ten proposed route drafts pass the current structural
`routeBlockers` check. This check verifies spelling, joins, provenance and
required fields; it does **not** decide whether a word's meaning fits the lesson.

| Word | Reviewed base to visible letters | Approved word meaning | Lesson review |
| --- | --- | --- | --- |
| available | avail → avail | Ready for someone to use, take or have. | Fits the current `can_be` group. |
| reliable | rely → reli | Able to be trusted to work well or do what is promised. | Fits; preserve the reviewed spelling change. |
| adorable | adore → ador | Very cute and easy to love. | Fits; preserve the reviewed final-e change. |
| reasonable | reason → reason | Fair or sensible in a particular situation. | Keep the reviewed skill assignment; use the broader approved suffix meaning. |
| noticeable | notice → notice | Easy to see or recognise. | Fits. |
| understandable | understand → understand | Easy or reasonable to understand. | Fits; `understand` remains one base. |
| desirable | desire → desir | Worth wanting or having. | Fits; preserve the reviewed final-e change. |
| respectable | respect → respect | Behaving properly and deserving respect. | Review teaching phrasing before release; “deserving respect” is close to “suitable for.” |
| applicable | apply → applic | Relevant to a particular situation or able to be used there. | Fits; preserve the reviewed `apply` → `applic` change. |
| considerable | consider → consider | Quite large or important in amount or size. | Keep the reviewed skill assignment; use the broader approved suffix meaning. |

The owner clarified that the -able/-ible profile meaning should be **“Capable
of, fit for, or able to be”**. The new active Production profile now uses that
wording in its suffix meaning, meaning bin and both target choices. This was a
profile-level correction; it did not change the reviewed Overview suffix gloss
“able to be or suitable for” or remove any reviewed word-skill pairs.

`scripts/revise-able-ible-profile-meaning.mts` creates a new immutable profile
revision, copies the current members with their teaching and morphology facts,
and supersedes the previous profile. Production transaction rollback verified
the revision over all six current members. The pinned staging database lacks
this skill and profile, so a disposable four-member fixture was created and
the same revision passed inside a staging transaction that was rolled back.
The revision was applied to Production as profile
`abd3c9a9-ba0a-4953-bf9e-47d5bfeccc5c`, retaining all six current members.
The previous profile `97c9011c-f5b2-4485-95aa-192789e6f883` is superseded
and disabled. Read-only post-release inspection found exactly one active
profile, the updated wording in all three fields, and the same three pilot
members; the ten remaining pilot members still need lesson publication.

Runtime commit `118bd064bb143ef425bb2a006208748199740843` was built as
Preview `dpl_9JoNi9LhifMHoN3TmZdjRTyAHBaN` and promoted to Production as
`dpl_DdR54QqF8a51BWXMcemL5bNjMWiA`. Authenticated candidate and public
HEAD checks returned the exact SHA, expected runtime fingerprint, valid
identity and release hold disabled. The Production safety monitor passed,
authenticated recovery GET was idle, scheduler job 73 was enabled and bound
to the new SHA, its 15:55 UTC run succeeded, AI control remained disabled,
and unrecorded sends stayed at zero.

The existing `launch_teaching_dictionary_lesson_v2` path accepts a set of
reviewed content versions for one profile in one transaction. It can therefore
publish the approved pilot lesson rows as a batch after editorial review and
compiler preflight. The current staging database has only two of the 14 pilot
word identities and no current pilot morphology, so an end-to-end staging proof
requires synchronising the reviewed pilot facts into staging first. No missing
suffix member was published by this audit.

This audit separates three checks that were conflated during the pilot:

1. **Dictionary approval:** typed Overview facts and current family evidence.
2. **Lesson suitability:** an approved word-skill pair and teaching meaning that
   fits the lesson's meaning group.
3. **Lesson readiness:** reviewed route content, current profile member, compiler
   witnesses and a staged lesson launch.

For the full import, generate lesson candidates from Overview in groups, review
only semantic exceptions and teaching-only fields, and launch each profile's
reviewed set together. Keep the Overview import batches at or below 500 rows;
use smaller human-review groups within each technical batch.

## Batch export improvement pending release

The Overview CSV now suggests `none` for each missing join only when the
existing visible part strings concatenate to the display word exactly and no
join evidence exists. It leaves `analysis_status=in_review` and asks the human
reviewer to check the joins. A read-only Production scan found 262 active words
with multiple parts and zero join rows; 256 meet this exact suggestion rule.
The remaining six still need manual join entry. This reduces repetitive typing
without treating historical morphology as approved.
