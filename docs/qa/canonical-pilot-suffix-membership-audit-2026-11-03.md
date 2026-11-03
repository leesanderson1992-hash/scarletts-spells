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
| reasonable | reason → reason | Fair or sensible in a particular situation. | Editorial decision: this meaning is not “can be reasoned.” |
| noticeable | notice → notice | Easy to see or recognise. | Fits. |
| understandable | understand → understand | Easy or reasonable to understand. | Fits; `understand` remains one base. |
| desirable | desire → desir | Worth wanting or having. | Fits; preserve the reviewed final-e change. |
| respectable | respect → respect | Behaving properly and deserving respect. | Review teaching phrasing before release; “deserving respect” is close to “suitable for.” |
| applicable | apply → applic | Relevant to a particular situation or able to be used there. | Fits; preserve the reviewed `apply` → `applic` change. |
| considerable | consider → consider | Quite large or important in amount or size. | Editorial decision: this meaning is not “can be considered.” |

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
