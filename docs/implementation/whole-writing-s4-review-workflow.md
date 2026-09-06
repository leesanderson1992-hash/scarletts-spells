# S4 — governed word–micro-skill review workflow

This slice completes the admin review/publication path for S4's existing
`explicit_reviewed_association` source. It reuses Phase B as the derived read
authority and does not create a new knowledge graph or proficiency formula.
The [proficiency contract](../contracts/adle-spelling-proficiency-contract.md)
§ Canonical Word–Skill Relationship remains authoritative. The unconfirmed
Context Resolver and dirty authority proposals are unchanged.

## Workflow and persistence

`/admin/word-skill-review` uses the existing admin allowlist and authenticated
server actions. Every mutation checks the admin session before creating a
service client; actor and environment come from the server, never hidden inputs.

1. Import 1–1,000 enumerated candidates, each with canonical word ID, micro-skill
   key, role, source, licence and generation method. Supplied approval fields are
   ignored. No runtime AI is used; batch AI may supply candidates only.
2. Inspect canonical labels, exact IDs, the hypothetical Phase B decision and
   existing source provenance for each pair. An unavailable authority blocks
   publication. No generic support duplicate is required for specialist truth.
3. Explicitly approve or reject every pair and record a review note. The package
   and final review are immutable. Corrections require a new package.
4. Separately publish approved pairs. The action re-reads all Phase B sources,
   rejects a changed displayed fingerprint, and blocks unknown identities or
   conflicting roles. Publication revalidates active word/skill identities in
   the database and calls the existing release publisher transactionally.
5. Withdraw through the existing immutable withdrawal source. Subsequent
   authority reads exclude the release; prior interpretations remain intact.

Migration `20260906140000_add_word_skill_review_workflow.sql` adds service-only
controls, candidate packages, final review receipts and package/publication
lineage. Publication is idempotent per package, including concurrent calls.
Approved subsets alone enter the existing release/pair tables. Rejected pairs
remain in the review record. Authenticated parents and anonymous clients cannot
read or invoke these administration tables/RPCs.

The existing release publisher retains its trusted service boundary for other
governed tooling. New controls govern this admin workflow; they do not redefine
legacy service publication policy. Runtime Phase B still fails closed on any
later source conflict or withdrawal. A saved reconciliation fingerprint explains
the publication-time read; it is not an immutable lock over all source systems.

## Controls, operations and rollout

`adle_word_skill_review_controls` has independently default-off `review_enabled`,
`publication_enabled` and `withdrawal_enabled` per explicit environment. The
environment uses `ADLE_ROUTE_ACTIVATION_ENVIRONMENT`; missing configuration fails
closed. Controls are service-managed and absent from learner/parent forms.

Publication retains the existing bounded shadow replay work and recovery
scheduler. It does not enable any learner capture/evidence controls, qualify
performances, queue lessons or deliver rewards, proficiency or scheduler events.
Automated withdrawal replay and mass candidate generation remain E1 work.

The admin page exposes candidate/review counts, blocked-pair reasons, exact
source decisions and the Phase B reconciliation receipt. Action failures log
fixed codes only. No learner writing is loaded into this admin page. Package
lists are paginated and reference-label queries use bounded batches.

Shadow occurrence interpretations now retain Phase B decisions and blocked
reasons alongside admitted relationships and their authority fingerprint.
`scripts/adle-word-skill-reconciliation.ts --include-reviewed-associations`
reconciles the published source through the same read authority when used live.

Rollout: additive migration → default-off Preview → disposable admin proof →
explicit operational activation. Real curriculum publication still requires
human approval of the exact package. Rollback disables the workflow controls;
withdraw affected releases through their authority if necessary. Never delete
genuine knowledge/evidence history or reverse learning consequences automatically.

## Verification

- Application and scripts TypeScript checks; focused ESLint.
- `NODE_OPTIONS=--conditions=react-server npx tsx scripts/word-skill-review-regression.ts`:
  candidate approval boundary, complete pair decisions, conflicts, contrast-only
  exclusion, withdrawal and pair-local approval.
- Existing Phase B regression remains unchanged and passes.
- `WRITING_PROOF_RUNTIME=/tmp/scarlett-writing-proof-runtime node --import tsx --conditions=react-server scripts/prove-whole-writing-local.mjs`:
  23 foundation checks plus 12 S4 database proofs, including atomic/concurrent
  publication, inactive identities, immutable review facts, rejected subsets,
  controls, environment isolation and denied parent access.
- Read-only staging source reconciliation: 1,082 source rows, 44 admitted exact
  pairs, 27 contrast exclusions, 997 unreviewed/unreleased exclusions, six blocked
  identities, zero ambiguous pairs. Fingerprint:
  `e9970379e0d876cddc4f8e1053848cb320faa617115844a03b890a013df08e97`.
  No unapproved knowledge was promoted to improve these counts.

The [staging completion receipt](whole-writing-s4-staging-receipt.md) records the
successful browser flow, runtime reuse, withdrawal, reload, database verifier and
cleanup. Local fixtures do not establish full production-schema coverage.

## Next dependency

E1 mass-enrichment candidate generation/curation and S5 longitudinal shadow
inspection can build on this workflow. S6+ remain the existing ordered roadmap.
Owner gates G1–G5 are unchanged; no qualification, feedback tolerance, Stability,
numeric proficiency policy or historical learning-consequence decision is made
by this slice.
