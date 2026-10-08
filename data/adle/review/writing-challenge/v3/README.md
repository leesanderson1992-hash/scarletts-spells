# ADLE Writing Challenge — complete signed-off content

**Production scope:** only the prior v2 subset of 98 rows has been released, as
approved/archived inactive content. The Water addition in this v3 package is not
released. Review v3 remains inactive; see the
[production receipt](../releases/2026-08-26-production-v2-inactive/README.md).

The user-supplied Water question resolves the final missing content row.
The [import package](adle_review_prompt_versions.import.json) now contains
**99 content-approved prompts: 36 writing prompts and 63 Conundrums**.

## Water Conundrum

At the moment, no one outside the researchers and the people of the Astra Mountains knows about it. So what should happen next?

Option A: Silence — Allow the people of the Astra Mountains to continue drinking their water and do not share the research findings.

Option B: Share - publish the findings to the wider world.

What do you think should happen with the discovery of the water? Are you team Silence or team Share?

The wording and both options are preserved. Only transport formatting (HTML space
entities and a trailing Markdown line-break marker) is removed. No answer is
preferred, no model response is added, and the existing title, introduction and
Top Tip remain unchanged.

The stable identity remains `CONUNDRUM-YXMchZeXnXw`, linked to the same
[Astra Nova video](https://www.youtube.com/watch?v=YXMchZeXnXw) and its canonical
embed URL. The reuse policy remains `once_per_learner`. The research placeholder
is retained only in historical provenance, never in the learner-facing question.

## Versioning and evidence

- The earlier v1 and v2 packages are unchanged.
- All 98 previously approved import rows retain their exact content, v2 versions,
  release references and fingerprints. They have not been republished under new identities.
- Water is the only new row, using `content_version = v3` and release reference
  `adle-review-writing-challenge-2026-08-26-v3`.
- The [Water source](water-question.source.json) and [approval receipt](water-approval.source.json)
  record the user's response to the missing-question clarification and its hash.
- The [manifest](manifest.json) lists the combined package, its mixed content
  versions, approval references and output hashes.

The existing versioned Conundrum introduction reference is reused; its complete
text remains in this package's `instructions.json`. Content/approval changes after
this point must not reuse the captured source receipt.

## Release state

**Content complete; not imported or activated.** There are no missing learner
questions in this package. Raw category counts meet the initial inventory minimums.

The remaining checks are unchanged: actual video playback/embedding and historic
identity reconciliation, shared UI rendering, daily Target Word visibility checks,
learner-specific unused capacity and Reflection LRU, staging verification and
explicit release/activation authority. Independent video watching or playback is
not claimed. No database or rollout changes were made.

All Target Word, retrieval-evidence, repair and shared-engine product rules from
the signed-off handoff remain intact.

## Local verification

```sh
node scripts/build-adle-review-complete-content.mjs --check
node scripts/adle-review-teaching-content-regression.mjs
```

The complete-content builder's `--write` option regenerates only this v3 package.
It cannot import database rows or activate learners.
