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

## Owner review decisions and editor recovery — 28 November

Superseding application release: `f56dc96a4dff0c72d50e96cf0ba9983315cb93c2`,
deployment `dpl_EMdfqtY8BFkJxgMvoWpZoxUuR15Q`.

Recorded completion of vis, dict, spect, aud, min and max. Dismissed 25
currently unlinked candidates (vis 7, spect 3, min 15); assigned words were
compared before/after and preserved. Dismissals fingerprint the displayed
word facts so changed breakdowns return for review. Completion is stored
separately, including roots with no remaining candidates. Production browser
readback shows all six complete and 77 distinct words across the 18 groups.
Port remains open for review.

The incorrect legacy `port_noun_base_family` (free base, “to carry”) now has
an explicit reviewed succession to `port_root_port_carry_root_base_family`.
The shared dictionary word and anchored harbour noun family are preserved.
Validation allows this cross-kind succession only for an unanchored legacy
duplicate of the same word and equivalent meaning, with an explicit reason.
An implicit cross-kind merge was tested and rejected in a savepoint.

Family-summary reads now use service-only bounded RPC wrappers over the
existing views, disabling JIT locally. Staging equality checks compared both
wrappers with their source views and verified empty scopes return no rows.
The word editor catches unavailable family reads and presents a retry message
while retaining other editor sections; strict consumers still fail closed.
This addresses the observed family-summary failure, not unrelated auth/network
timeouts. No learner evidence or published lesson pool was changed.

Migrations 20261128080000, 20261128080500 and 20261128081000 were applied and
recorded in staging and production. Staging reproduced the duplicate with an
explicit disposable fixture, applied the owner decisions and checked page
load/reload. Regression, TypeScript and targeted lint checks passed. The
server-only regression runs with `NODE_OPTIONS=--conditions=react-server`.
Authenticated staging readbacks covered both review pages and port, reported
and transport entries. Production browser verification loaded/reloaded port
and transport, showed transport linked to “port (bound root) — Carry”, retained
both port senses, and reloaded the completed-review page successfully.
Receipts and screenshots: `outputs/root-review-decisions-20261128/`.

Exact-SHA approval `3e9f5b9d-bdaf-4534-a7d8-ff9811bf8fc9` cites owner standing
permission dated 2026-10-09. Candidate and public HEAD identity checks passed
before policy/scheduler cutover. Policy revision
`9df17f0a-0aef-4b6e-b7ed-f8e2f7800cd3` uses unchanged provider terms and limits.
Recovery request 47837 returned 200; safety monitor passed with zero unrecorded
sends. Existing Latin activation `266ed9f2-3bf1-41b6-b0dd-ed78dda5c62e` remains
enabled and its published manifest is unchanged.

## Port/Pict completion and Cred support entry

On the owner's subsequent instruction, completed port and pict review and
dismissed five currently unlinked Production candidates. Assigned words were
compared before/after and preserved. Pict continues to include the existing
picto family. Cred remains open for reviewing member words.

No existing cred word or family was found. Created approved bound-root support
entry `07cae33d-a686-4b5f-8dc1-824d2ab516b2`, meaning **to believe or trust**,
with root-only parts `cred → cred`. Created approved family
`cred_root_root_base_family` with Latin historical language. The canonical
language classification view maps it to
`D4_MOR_ROOTS_COMMON_LATIN_ROOTS`. This creates curriculum support, not an
ordinary spelling target or publication of member words.

Operator script: `scripts/review-port-pict-create-cred-20261128.mts` (rollback
by default, explicit `--production --apply` for the authorised content change).
Staging and Production rollback plans passed before each apply. Staging page
load/reload passed; a disposable staging learning-item attempt was rejected
with `ROOT_SUPPORT_ONLY` and its fixture rolled back. Production browser
readback verified the approved meaning, linked family, selected Latin origin
and successful reload. TypeScript and targeted script lint passed. Receipts:
`outputs/port-pict-cred-20261128/`. This is a content-only change using existing
review functions; the live application deployment and published Latin pool
remain unchanged.

## Clear resolved sections from the review page

Application SHA `7cd194ea5fb3dc5c9785fe1a266f8a1cd8945aa4`, deployment
`dpl_HkBo2BtngH6izkjzaz4UdF1rnqQJ`, hides completed groups from the default
view and jump links. A group is complete when its recorded review is complete
and no unlinked candidates remain. New unlinked candidates reopen it. The
`?completed=1` view restores completed groups through “Show completed”; “Hide
completed” returns to the pending view. Counts reflect the displayed groups.
No dictionary facts, assignments, completion records or lesson pools changed.

Eight completed groups are cleared: vis, dict, spect, aud, min, max, port and
pict. Cred's support entry is resolved but its member-word review is still
open. The live pending page shows 55 distinct words across ten groups: scribe,
struct, cred, initi, ple, popul, pos, sci, soci and vent.

Regression covers empty completed groups, linked completed groups, unfinished
groups and new candidates reopening a completed group. TypeScript, targeted
ESLint and the React review passed. Authenticated staging load/reload verified
10 default groups and all 18 with completed groups included; the other page
also loaded. Production browser checks verified both links and the final
pending view after reload. Receipts: `outputs/root-review-cleanup-20261128/`.

Exact-SHA approval `aff053f4-3320-4b41-aff7-316e2fb004cb` cites standing owner
permission of 2026-10-09, preserving terms and limits. Candidate/public HEAD
checks passed before cutover to policy revision
`2367fb2f-66f1-4087-aaa4-c111146005ff`. Recovery request 47904 returned 200,
monitor passed and unrecorded sends remained zero. The existing Latin lesson
activation and manifest remain unchanged.
