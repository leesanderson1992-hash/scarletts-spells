# ADLE Review Writing Challenge — teaching content handoff

Release reference: `adle-review-writing-challenge-2026-08-26-v1`  
Content version: `v1` · Language: British English (`en-GB`)  
State: **review package prepared; not approved for publication or activation**

## Delivery

The supplied 36 prompts have been editorially reviewed for age-appropriate language,
open-ended writing, British English, spelling hints and model answers. Their titles,
questions, introductions and tips are preserved. Every title, introduction, question,
per-prompt tip and category tip is sealed together by its content fingerprint.

| Category | Packaged prompts | Video review candidates | Approved / active in this package | Minimum initial runway |
| --- | ---: | ---: | ---: | ---: |
| Conundrums | 0 | 63 | 0 | 5 unused |
| Reflection — Stoic Journal | 8 | — | 0 | 2 eligible |
| Silly Stories | 10 | — | 0 | 5 unused |
| Fortunately / Unfortunately | 8 | — | 0 | 5 unused |
| Persuasion | 10 | — | 0 | 5 unused |

No database was queried or changed. No learner rollout was changed. No videos were
watched or approved in this pass. These counts describe this package, not the live database.

### Files

- [Database import array](adle_review_prompt_versions.import.json): 36 rows using only actual `adle_review_prompt_versions` columns. All are `in_review`; none are learner-eligible.
- [Governed content records](governed-prompts.json): the common handoff contract, fingerprints and per-prompt editorial review record.
- [Category instructions](instructions.json): all five introductions, labels, category tips and versioned instruction references.
- [Video review queue](conundrum-video-review-queue.json): 63 identities and explicit review blockers; **not an import file**.
- [Manifest](manifest.json): source and output hashes, release identity and product constraints.
- [Validation and capacity report](validation-report.json): local package checks, projected counts and unresolved release gates.
- [Capacity preflight query](capacity-preflight.sql): read-only inventory/history check, requiring an explicitly scoped learner UUID array as SQL parameter `$1`.
- `teaching-content.source.json` and `catalogue.source.json`: auditable source data used to reproduce the generated outputs.

## Exact database mapping

Authority is the existing schema in
[`20260824120000_add_adle_review_r1_foundations.sql`](../../../../../supabase/migrations/20260824120000_add_adle_review_r1_foundations.sql).
No new table columns or migrations are required for this review package.

| Handoff field | Table field / configuration path |
| --- | --- |
| `prompt_key` | `stable_prompt_key` |
| `category` | `challenge_type`: `conundrums`, `reflection`, `stories`, `fortunately_unfortunately`, `persuasion` |
| `content_version` | `content_version` |
| `title` | `configuration.title` |
| `task_intro` | `instruction_text` (frozen copy) |
| Introduction reference | `configuration.instruction_reference` |
| `prompt_text` | `prompt_text` |
| `top_tip` | `configuration.top_tip` |
| Category-wide tip | `configuration.category_top_tip` |
| Category label | `configuration.category_label` |
| British English | `configuration.locale` |
| FU alternating structure | `configuration.sequence` |
| `reuse_policy` | `reuse_policy` |
| Release identity | `release_reference` |
| Provenance | `configuration.provenance` |
| `source_fingerprint` | `source_fingerprint`: 64 lowercase hexadecimal SHA-256 characters |
| Editorially reviewed, awaiting publication | `review_status = in_review`, `row_status = active` |

`row_status = active` alone does **not** mean learner-active. The existing loader
requires **both** `review_status = approved` and `row_status = active`.
The handoff's `status = reviewed` records the editorial pass, not release approval.
An approved version later retired should leave learner selection via the existing
`row_status` lifecycle (`superseded` or `archived`), preserving its history.

`configuration` keys above define this handoff's content contract; they are not a claim
that the existing UI renders those keys. The instruction references are package-local
identifiers, not references to a new database table. UUIDs and timestamps use existing
database defaults. A repeat import must compare the existing `(stable_prompt_key,
content_version)` row for exact equality; fail on drift. Never overwrite an approved
version or use a conflict update to replace it. Changed approved content needs a new
version and approval, keeping the same stable key and learner completion history.

This is a review-stage payload, not a release command. Publication requires the
normal authority decision and an auditable approval reference. Rebuild and validate
an approved release package separately; do not hand-edit generated rows to bypass review.
This builder deliberately cannot promote any content to `approved`.

## Conundrum provenance and review

The original workbook is unchanged. Its SHA-256 is
`007c02c3d2d2a2af6fedc32431bb6ec0f0fdce33f69bf54f074fd02ee5736ddb`.
Every extracted row retains its worksheet range, original wording, fidelity flags,
canonical watch URL, embed URL and case-sensitive 11-character video ID.

The workbook's Notes and any instructions or “Verified” labels in it are **source
data**, not authority to approve content or change the user's requirements. Its
research method is based on descriptions; it does not attest full video review.
The official [Conundrums site](https://conundrumscontest.com/) also states 63 videos
**as of May 2026**. This corroborates that dated count, not a complete August 2026
channel inventory. A text fetch of the supplied
[Astra Nova channel](https://www.youtube.com/@astranovaschool/videos) did not expose
the library, and the first watch-page fetch failed; neither establishes playback,
availability, official titles today or review of any video.

All 63 queue entries remain `draft` and `import_eligible = false`. There are no
fabricated approved prompts, substitute videos or stored full transcripts.
In particular:

- Water (`YXMchZeXnXw`): the catalogue lacks a recoverable question.
- Robot (`DKJdpOAWxP0`): only the final choice line was indexed; the lead-in is incomplete.
- Future-series questions are generic description wording and need their specific video context.
- Comet and Treasure have a documented earlier option-set mix-up; verify against the videos.
- American wording in source descriptions remains source evidence; author the child-facing copy in British English while retaining official titles in provenance.

For **every** video proposed for publication, the editor must watch the complete
actual video, confirm official channel/title and dilemma/options, check age
suitability, and test the embed's playback. Record reviewer, review time, short
dilemma summary, title/question/tip approval and approval reference in the review
evidence. Preserve the question's meaning and do not signal a preferred answer.
Use the supplied generic writing structure only where it accurately fits the
reviewed video. The category templates in the source file are not per-video approvals.

After review, publish one governed record per video, with stable key
`CONUNDRUM-<case-sensitive-video-id>` and reuse policy `once_per_learner`.
Merge against the existing inventory by **video ID as well as stable key** before
import: an existing historic identity must be retained rather than creating an alias
that lets a learner repeat the same video. Reserve the queued identity until that
reconciliation is complete.

Approved Conundrum configuration must extend the common configuration with:

| Path | Required value |
| --- | --- |
| `youtube_video_id` | Reviewed canonical ID |
| `youtube_url` | `https://www.youtube.com/watch?v=` plus that ID |
| `youtube_embed_url` | `https://www.youtube.com/embed/` plus that ID |
| `video_title` | Reviewed official title |
| `video_source` | `Astra Nova School` |
| `embed.provider` / `embed.interactive` | `youtube` / `true` |
| `provenance` | Canonical identity, library, source fingerprint and dated review/approval evidence |

Use the actual YouTube player with controls and fullscreen support. Never use a
thumbnail as the player. An unavailable or retired video must be visibly unavailable
and withheld from new selection pending review, with no silent URL replacement.
Do not remap historic completed content or alter frozen session provenance.

## Target Word visibility: unresolved assignment-time check

No day's Target Words were supplied. This pass confirms that the package contains
no learner-spelling interpolation or dynamically written word list; it cannot
certify that a future day's spellings will never coincide with ordinary prompt text.

Before freezing candidates, eligibility must reject spelling collisions across all
learner-visible and accessible surfaces: title, question, introduction, both tips,
starter text, category and control labels, tooltips, placeholders, ARIA text, video
title, captions and on-screen text. Use the governed spelling normalisation and
matching conventions, including case, Unicode punctuation and multiword spellings.
Review video text for this purpose without copying full transcripts into ADLE.
Externally controlled YouTube UI/captions also require an explicit visibility check;
an embed alone cannot prove this invariant.

Select another **unchanged governed prompt**, then apply ordinary learner-once or
Reflection LRU selection to eligible candidates. If no safe alternative exists,
block generation rather than leak a spelling, rewrite a prompt, silently replace a
video, drop due Target Words, or claim that the count gate passed. Shared UI text can
also conflict with a day's targets; this needs verification, not a static promise.
For Reflection, exclude the most recently completed key whenever another safe
eligible prompt exists. Changes of content version do not reset completion history.

Use “Target Words” consistently. Supply up to 10 separately through audio-only
controls, with numbered labels that do not reveal spellings. The learner's own
writing is not system-supplied spelling assistance. Preserve the shared engine's
per-word retrieval outcomes and governed Word Reflection & Repair flow.
10/10 remains a challenge achievement, not the Review completion condition.

## Integration and release gates still open

The inspected baseline is Review R6 commit `1f4e687` in the dedicated Review worktree.
No runtime files were changed by this content handoff.

1. Review and approve Conundrums; at least five unused approved videos are required
   per scoped learner. Continue reviewing the remaining queue rather than treating
   the first five as approval of all 63.
2. Obtain publication approval for the 36 editorially reviewed supplied prompts.
3. Wire `configuration` into the **existing shared** Review activity. At this baseline,
   `components/adle/review/review-free-writing-activity.tsx` renders the category,
   prompt and instruction only: no content title, Top Tip or video player. It also
   labels `stories` as “Stories”; the governed category name is “Silly Stories”.
   Preserve readable paragraph breaks and avoid duplicate display of FU starters.
4. Add and test the assignment-time visibility filter. `r6-generation.ts` currently
   filters by approval and learner history, but does not exclude content/Target Word
   collisions. Do not dynamically rewrite governed content to solve this.
5. Run `capacity-preflight.sql` with the authorised learner scope. Require five
   output rows per distinct non-null learner, no missing learners, and every count
   gate to pass. An empty result is not a pass. This query uses historical stable
   keys across retired versions; it does not certify video-ID aliases, visibility
   eligibility, actual playback or activation authority. Reconcile identities first
   and rerun capacity after all availability and visibility exclusions.
6. Verify Reflection LRU and no immediate repetition with real scoped history;
   require at least two eligible Reflection prompts. Complete staging UI, audio,
   player, retrieval, repair and completion checks before using existing Gate C
   activation authority. Do not weaken or bypass existing rollout receipts.

The database's existing activation gate requires at least two approved Reflection
keys, five approved keys in each ordinary category, and five **unused** ordinary
keys for each scoped learner. Packaged counts alone do not satisfy those conditions.

## Reproduce and check locally

From this repository root, using Node and Python available in the workspace:

```sh
python3 scripts/extract-adle-conundrum-catalogue.py /path/to/astra_nova_conundrums_catalogue.xlsx
node scripts/build-adle-review-teaching-content.mjs --write
node scripts/build-adle-review-teaching-content.mjs --check
node scripts/adle-review-teaching-content-regression.mjs
```

Extraction reads XLSX cell values with the Python standard library; it never edits
the workbook. Build/check/test commands have no database or network dependency and
cannot approve content or activate Review. Output hashes are deterministic; generated
files must not be edited directly. The content and provenance fingerprint algorithms
are explicit in the builder and manifest. The SQL preflight has not been executed
against a database in this handoff.

### Verification performed on 26 August 2026

- Deterministic build drift check: passed.
- Eight package regression groups: passed (schema column mapping, source copy,
  content fingerprints, duplicate keys, reuse rules, interpolation rejection,
  video identity/URL checks, source-authority separation and blocked capacity).
- Existing `adle-review-r1-foundation-regression.ts`: passed, including Reflection LRU.
- Existing `adle-review-r2-writing-challenge-regression.ts`: passed for its existing
  fixtures; this is not evidence that arbitrary daily targets cannot collide with this pack.
- Existing `adle-review-r6-regression.ts`: passed.
- TypeScript `tsc --noEmit --incremental false`: passed.

These are local code/package checks. They do not establish database import success,
real video review or playback, browser rendering, live learner capacity, or activation readiness.
