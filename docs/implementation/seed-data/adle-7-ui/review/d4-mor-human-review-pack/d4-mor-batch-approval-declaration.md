# D4_MOR Category-v1 Batch Approval Declaration

Status: human approved for D4_MOR category-v1 content/schema preparation. This
approval does not activate content, make it runtime truth, or import it into
Supabase.

Source artifacts used:

- `docs/implementation/seed-data/adle-7-ui/generated/d4-mor-category-v1/d4-mor-content-candidate-v1.json`
- `docs/implementation/seed-data/adle-7-ui/generated/d4-mor-category-v1/d4-mor-word-analyses-candidate-v1.json`
- `docs/implementation/seed-data/adle-7-ui/generated/d4-mor-category-v1/d4-mor-morpheme-catalog-candidate-v1.json`
- `docs/implementation/seed-data/adle-7-ui/generated/d4-mor-category-v1/d4-mor-category-v1-review-queue.csv`

## Compact Approval Summary

| Measure | Count | Meaning |
|---|---:|---|
| Total word analyses | 168 | All generated D4_MOR candidate word analyses. |
| Straightforward batch-approval candidates | 157 | Exact reconstruction; no spelling transformation, connector/linking vowel, slash ambiguity, or root alias/variant marker requiring individual decision. Ordinary `none`, `space`, and `hyphen` joins remain eligible here. |
| Word analyses needing individual human decisions | 11 | Analyses with transformations, connector/linking-vowel modelling, slash ambiguity, or root alias/variant markers. |
| Existing review-queue items included | 20 | All current generated review-queue rows. |
| Exception review rows | 74 | Current review queue plus transformations, compounds, root/etymology checks, connector checks, and flagged teaching explanations. |
| Cluster spot-check rows | 18 | Approximately three representative checks per D4_MOR cluster. |
| Teaching-content micro-skills flagged for amendment | 20 | Micro-skills with potentially inaccurate, overly absolute, age-tone, etymology, or metaphor wording flags. |
| Micro-skills appearing approvable without changes | 4 | No wording flags from this preparation pass. |
| Micro-skills appearing approvable with changes | 20 | Likely approvable after wording review/amendment. |
| Blocked micro-skills | 0 | No structural blocker identified in this preparation pass. |

## Approval Declaration

I, the human curriculum reviewer, approve in one batch all D4_MOR category-v1
candidate word analyses that meet all of the following conditions:

- the candidate reconstructs the displayed word exactly;
- the analysis uses only ordinary `none`, `space`, or `hyphen` joins;
- any `splitPoints` are treated only as derived view-model data from the authoritative parts and joins;
- reusable morpheme references resolve to the generated candidate morpheme catalog;
- the row has no unresolved spelling transformation, root alias/variant ambiguity, slash-delimited meaning/gloss issue, connector/linking-vowel issue, or listed review-queue issue.

Items requiring individual decisions were reviewed in
`d4-mor-exception-review-table.csv` and approved for inclusion. The approved
amendment to the compound teaching explanation is recorded in
`d4-mor-micro-skill-approval-table.csv`.

This declaration does not activate content, change the existing active generic teaching dictionary, change runtime selection, write to Supabase, or change composer, renderer, registry, session runner, evidence, scheduler, or reward behavior.

## Reviewer Sign-off

Reviewer name: Katie Sanderson

Decision date: 2026-07-11

Batch decision: `approve_batch_scope_only`

Reviewer comments: Human-approved for D4_MOR category-v1 content/schema
preparation. The approved source remains not activated and is not current
runtime truth.

## Decisions Resolved By This Review

1. All 24 micro-skill approval rows are approved; one row is approved with an
   incorporated amendment.
2. All 74 exception review rows are approved for inclusion.
3. The cluster spot-check representative for
   `D4_MOR_WORD_FAMILIES_PRONUNCIATION_SHIFT` is `health`, replacing `heal`.
4. No blocking linguistic issue remains for D4_MOR category-v1 content/schema
   preparation.

## Later Runtime Boundary

This approval is sufficient for a later PR to create an approved/versioned
D4_MOR category source or human-review overlay. A separate PR is still required
before runtime activation, assignment payload emission, composer selection,
renderer work, or Supabase import.
