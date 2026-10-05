# Comparative and superlative ADLE v1 — local implementation receipt

Date: 2026-09-29. Status: implemented locally; inactive and not deployed.
This receipt is not a policy owner or human content approval.

## View the real templates

- Full lesson: http://127.0.0.1:3000/dev/adle/comparative-superlative
- Existing menu: http://127.0.0.1:3000/dev/adle/template-menu

Both are development-only. The full preview selects any of the four rules and
2/3/4 queued targets, freezes a six-word fixture in browser storage, resumes on
reload and records an idempotent local Finish count. These are synthetic
fixtures, not learner evidence or database assignments.

## Reuse boundary

One `FirstImpressionLesson` shell delivers two TeachingPages, Meet the Words,
six sentence builds, four-form BinSort, 2–4 queued cleaver demonstrations,
six CoverShutter attempts, two paired SentenceDictation tasks and Reflection.
Only `sentence_suffix@1`, `transform_target@1` and `paired_word_gaps@1` are new
activity modes. Their menu fixtures use the registered real renderers.

The revised local interaction follows the lesson-owner's target-first steering:
Task 1 animates the approved base-to-degree letter change after ending selection,
joins the ending, then turns that same visual into the draggable word. It has no
second displayed answer or separate "Your word is ready" card. A wrong ending
can be retried from the feedback.
Task 3 uses the existing SplitHandle rail on the full target (`happier`, not
`happy`), derives the cut before the reviewed ending, then composes
SpellingTransformationReveal to slowly restore the base (`happi` → `happy`,
`bigg` → `big`, `nic` → `nice`). Its question follows the reveal. Existing
suffix/base cleaver modes are unchanged. Reflection keeps independent spelling
mistakes in activity order and shows correct-but-
swapped words separately as sentence placement feedback. The template menu
contains selectable reflection examples using the existing canonical renderer.
All four comparative rules now use the owner's shared memory-cue reflection
question verbatim, without the generic helper copy below it; older frozen
lesson snapshots retain their authored prompt.

The compiler freezes selected family content, teaching, rule questions,
dictation/audio order and exact queued-learning-item references in Specialist
Snapshot v3 (22–24 bindings). No companion intake is permitted. Atomic Finish
stores raw attempts and four separate placement outcomes, schedules only
eligible queued targets, and uses existing policy integrations. Checked
answers are locked. Finish/retry replays idempotent follow-ups after a lost
response or post-commit failure.

## Dictionary enrichment

Drafts in `lib/adle/inflection/content.ts` contain all requested families:
regular fast/tall/small/long/old/cold; drop-e nice/large/brave/wide/safe/close;
y-to-i happy/funny/busy/easy/heavy/pretty; doubling big/hot/sad/thin/wet/red.

`comparative-superlative-candidate-audit.json` reports 24 families/72 forms.
The repository British Hunspell dictionary/affix rules attest generated forms
and flag bulk candidates; they do not approve adjective usage or gradability.
The owner approved the 72 spellings on 2026-09-29. Katie Sanderson subsequently
approved the 25 missing forms' proposed factual, morphology, dictation and
source-use rows on the same date. This does not approve lesson content or
activation. A read-only inventory on 2026-09-29 found 47 existing active approved
canonical forms and the same 25 missing forms in both staging and production.
The 47 shared canonical IDs and compared factual fields agree across the two
environments. `outputs/comparative-superlative-2026-09-29/dictionary-enrichment-review.xlsx`
records the ID reconciliation and the 25 new-word review fields. The signed-off
surface is `outputs/comparative-superlative-2026-09-29/comparative-dictionary-approved.xlsx`.
Do not create
new IDs for existing forms, use the Dashboard SQL Editor as an importer, or
populate the spelling word map merely to make this route run.

The new forms are longer, longest, older, oldest, colder, coldest, wide,
wider, widest, safer, safest, close, happiest, easier, easiest, heaviest,
prettier, prettiest, thinner, thinnest, wet, wetter, wettest, redder and
reddest. The 25 new entries now have named factual review and a prepared,
checksummed canonical package at
`docs/implementation/seed-data/teaching-dictionary/releases/2026-09-29-comparative-degree-canonical-v2`.
Its package SHA-256 is `5f8c745ea7690bf137fd914158fcddb9d3452ff4b98838e13b1b93624065ec7d`.
The earlier v1 package was never imported and is superseded because its
shared release role conflicted with Base Word family grants.
The package has now been staged and published to production with matching
verified receipts. The existing 47 forms were reused, not overwritten or
included as new canonical rows. Exact-ID reads confirmed all 72 forms in both
environments. Lesson-content release and route activation remain separate.
Family approval, checked content and resolved IDs remain separate inactive
release gates; draft `candidate:` IDs do not acquire runtime authority.

The production-bound candidate enrichment now reuses the same British IPA,
CMUdict, MorphoLex, wordfreq, UK spelling-age and AoA sources as the earlier
Teaching Dictionary batch. It proposes frequency, age and complexity bands,
British IPA, syllable/stress/schwa facts, structured morphology/word sums,
contextual dictation, exact token bindings and audio text for all 25 new words.
The original candidate workbook preserved the `in_review` state; the approved
workbook records Katie's named approval. The British IPA
dataset exactly covers 24/25; `close` uses a separately cited, sense-specific
adjective pronunciation candidate. Six IPA/CMU syllable comparisons need
checking. MorphoLex has no adjective tag for `close` or `wetter`, so those
senses were included in the approval. Eleven age estimates are direct; fourteen
are base-form proxies. External raw MorphoLex segmentation and POS evidence
remain in the review workbook and are not imported into the canonical package.
`validate-adle-comparative-dictionary-candidates.py` reports
`valid_human_review_required` with 25 complete candidate rows and no binding
errors. The prepared canonical package passes the release and CSV validators.
It has no publishing or lesson activation effect until the guarded release
commands pass on staging and then on production.

Read-only commands:

```sh
npm run adle:comparative-enrichment -- --summary --dictionary /absolute/path/inventory.json --hunspell /absolute/path/en_GB-large.dic --aff /absolute/path/en_GB-large.aff
npm run adle:comparative-package -- --families /absolute/path/reviewed-families.json --approvals /absolute/path/approvals.json --release-key reviewed-release-key
```

The audit inventory contains `canonicalWordId`, `word`, `dialect`, `active`,
`approved` and `adjectiveVerified`. The reviewed family input uses
`AdjectiveFamilyV1`, including updated companion IDs and paired bindings.
Packaging rejects incomplete review and emits checksummed inactive content;
the CLI neither publishes nor activates. Failed review never substitutes words.

## Local verification

Latest local results: 816 pure assertions; 28 comparative browser cases verified
across desktop/touch runs (including corrected-fixture reruns); nine existing
cleaver browser checks passed; PostgreSQL Finish/replay for all four profiles in three
outcome cases each; root/script type checks and scoped lint. These are local
verification results, not staged learner or Production approval.

- Pure regression enumerates every pair in each six-family pool with 2/3/4
  queued targets, same-family rejection, third-family deferral, frozen replay,
  invalid content/modes and separate swap/misspelling attribution.
- Desktop and touch-layout browser flows exercise all six tasks for all four
  rules through Finish/reload, keyboard/tap placement and reduced motion.
  Additional tests cover drag placement, hidden-answer save-failure/retry,
  unavailable audio, forward letter-change animation, full-target splitting
  and base restoration, mistake-order/placement reflection and menu selection.
- Disposable PGlite PostgreSQL executes both new migrations, inactive package
  publication/replay, immutable records, assignment/replay, answer locks and
  atomic Finish/replay for every rule with swaps, misspellings and no-schedule
  outcomes. Its isolated predecessor fixture schema is **not** a real Supabase
  migration-chain verification or staging proof.
- Existing Prefix/Base/Affix/Compound snapshots, generic replay, renderer
  registry, catalogue and shared Cover/Dictation regressions are retained.

Commands: `adle:comparative-regression`, `adle:comparative-browser-regression`,
`adle:comparative-sql-regression`, `typecheck:scripts`, `adle:authority-docs-check`.

## Unfinished release gates

The 25-row canonical dictionary package is approved and verified in staging
and production. No lesson-content publication, deployment or activation has
occurred. The repository-wide migration history still needs separate
reconciliation before ordinary full-repository migration pushes are safe.

1. Resolve the 47 existing plus 25 new canonical IDs into reviewed adjective
   families. Have an identified reviewer approve eligibility, British meanings/contexts,
   transformations, all questions/sentences and audio text for all 24 families.
2. Verify the migrations against the actual staging predecessor chain, then
   publish the checksummed reviewed package **inactive**. Record all hashes.
3. Deploy a bounded staging Preview and explicitly activate only the disposable
   fixture scope through existing revision/CAS authority.
4. For **each** of Regular, Drop-e, Y-to-i and Doubling, record an assignment and
   exact queued lineage; complete all activities through Finish; reload and
   retry; verify persisted frozen snapshot/checkpoints, completion, independent
   attempts, placement facts, queued-only schedules/learning transitions and
   no duplicate reward/receipt effects. Include 3/4-target and third-family
   deferral checks, failures and swaps. Browser loss is recoverable, not proof
   completion. Preserve authentic raw spelling evidence privately.
5. Only after every proof passes, request separate Production publication and
   activation authority. Do not promote synthetic review references.
