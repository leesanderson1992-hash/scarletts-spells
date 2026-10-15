# Teaching Dictionary to ADLE launch — staged implementation

Owner approval: the Teaching Dictionary to ADLE launch plan in this task, including the later decision to keep homophone/comparative paired passages and add group variation. The owner authorised the production-linked Preview proof with Test 2. This receipt does not authorise changing another child's queue.

## Stages

| Stage | Implementation | Verification status |
|---|---|---|
| Schema and shared readiness | Immutable shared reviews, dictation pools, real route compilers, complete member witnesses, typed field-linked issues | Five targeted forward migrations applied; no content/activation changed; compiler tests passed |
| Approved editor | Compact horizontal Overview, parts/syllable builder, canonical meaning suggestions, linked families, micro-skill table, activity matrix, collapsed lesson/activity sections | Typecheck, lint and production build passed; Preview visual proof pending |
| Dictation variation | Exact occurrence/audio checks; frozen Overview pools for affix/base/compound/ing, paired group pools for homophone/comparative | Native compiler and old snapshot tests passed; Preview proof pending |
| Atomic launch and rollback | Protected affix replacement; governed package adapters; exact head/profile checks; immutable compiler witness audit; restore previous authorities and shared facts | Disposable PostgreSQL regression passed; controlled Preview release proof pending |
| Global enabled route scope | Keep enabled status and queue policies; use all_eligible, retain emergency disable; no activation of inactive routes | Existing -ing routes still have limited scope; change only after controlled route proof |

## Local evidence

- `npx tsc --noEmit` and `npx tsc -p tsconfig.scripts.json --noEmit`.
- ESLint of the changed editor and manager modules.
- `npm run build`.
- `npx tsx scripts/teaching-dictionary-workspace-regression.ts`: occurrence selection, phrases, all variants, stable selection, syllables and compiler witnesses beyond the removed 120-combination cutoff.
- `NODE_OPTIONS=--conditions=react-server npx tsx scripts/teaching-dictionary-governed-regression.ts`: real governed compilers, every dictation variant, paired passage variations/conflicts, unchanged prior snapshots.
- `npx --yes --package=@electric-sql/pglite@0.5.8 -c 'node scripts/teaching-dictionary-workspace-sql-regression.mjs'`: protected responsible replacement, stale/duplicate launches, head CAS, atomic pool/content release, global replacement scope, audited rollback and prior dictionary fingerprint restoration.
- Existing manager, candidate-loader, affix release SQL, -ing (434 checks), comparative (1,359 checks) and homophone regressions passed.
- The first four forward migrations passed a transaction dry run against the actual production schema, then were applied from commit e627260. The separately tested compatibility migration from 749e187 preserves the new fields when the earlier editor omits them. No content or route activation changed in either schema deployment.

## Remaining release gates

The five named schema migrations are applied. Deploy the editor to Preview. Verify responsible, an unpublished affix member and representative governed groups. Confirm admin preflight creates no assignment, then run normal queued selection for Test 2 and check its frozen lesson content. Record the exact Preview SHA and proof receipts here. The public production code release remains subject to the repository's exact-SHA writing-context AI gate.


## Live inventory findings during integration

The live package heads for homophone, comparative, compound and base routes are enabled. All four -ing heads are enabled with a limited scope. Preflight separates unchanged released members from unrelated unreviewed historical drafts; a draft cannot borrow another version's editorial approval or another word's compiler witness. Native Base Word member applicability is scoped to the requested micro-skill, and component words are not misclassified as whole compound targets. Existing approved affix row/source reviews remain valid for unchanged imported members; a newly proposed analysis still requires explicit version review.
