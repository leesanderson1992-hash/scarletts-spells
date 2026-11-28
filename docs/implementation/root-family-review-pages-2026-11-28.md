# Root-family dictionary review — 28 November 2026

The owner requested a focused audit for vis, dict, spect, aud, min, max, port,
pict, scribe, struct, cred, initi, ple, popul, pos, sci, soci and vent.

`/admin/teaching-dictionary/root-review` searches existing active en-GB dictionary
entries and current reviewed root-family memberships. It displays the reviewed
meaning-specific word sum and part roles, with spelling-level facts explicitly
labelled when no reviewed meaning analysis exists. Letter matches are
unverified candidates. They do not confer family or micro-skill approval.
Whole bases, nested bases, absent root parts, alternate forms and unreconstructed
word sums are flagged for editorial review. A valid Base analysis is not
silently replaced. Root-only teaching entries are excluded as ordinary targets.

Pict includes the existing picto family; pos includes pose. Scribe searches
scribe, scrib and script. These are review groupings, not canonical renames or
approval of alternate forms. Missing reviewed root families remain visible,
including groups with no ordinary word candidates. No new words are created.

`/admin/teaching-dictionary/root-review/other` groups current Common Latin root
family members outside the requested set. Existing exclusions/deassignments
remain visible and are distinguished from linked words without an exclusion.
Reviewers open the word's existing editor to decide its parts, family and
micro-skills. Neither audit page mutates assignments or publishes content.
The existing published Latin pool and learner evidence remain unchanged.

Both routes require administrator authentication and read server-side data.
Dictionary searches are paginated; reviewed facts are fetched in bounded
batches. Editor links preserve sense IDs and disable prefetch to avoid starting
a large number of expensive word-page requests. The Common Latin bulk-review
workspace links to both pages. No schema migration is required.

Local and staging checks are recorded under
`outputs/root-family-review-20261128/`. The pure regression covers the focus
partition, alias groupings, false letter matches, nested bases and related root
forms. Existing ADLE authority, evidence, progression and reward contracts are
unchanged.

Production application SHA `ba9c236d2074b8893bab027efb1705ea5a0cac6f` is live
through deployment `dpl_CXYdXZEgQFjzAL1WwCkZ7Z9psWyL`. TypeScript, targeted
ESLint and the audit regression passed. The authenticated Preview proof loaded
and reloaded both pages, checked all group headings, kept focus groups out of
the other page and verified sense-specific word-editor links without writes.

Authenticated Production browser readback found 102 distinct candidate words
across the 18 requested groups. The other page has nine groups: ceive, fect,
ject, numer, poten, stat, tend, un and veget. Affect and effect are explicitly
shown as excluded. The requested spect, aud, min, max, scribe and cred groups
currently have no reviewed Latin-root family; aud and max have no ordinary
active dictionary candidates. Related-form groupings remain editorial hints.
Both live pages were left open for the owner.

Exact-SHA provider approval `5ce08138-23e3-4fed-97a4-68705c321ecf` cites the
owner's 2026-10-09 standing permission. Candidate and public authenticated HEAD
readbacks matched SHA, runtime and disabled hold before the policy/scheduler
cutover. Approved terms, model, rate card and limits were preserved. Policy
revision `144c1529-20f3-414d-84bb-5b177a943ee3` and scheduler job 154 are active.
The recovery delivery returned 200 and the safety monitor passed with zero
unrecorded sends. The Latin lesson activation and published pool are unchanged.
