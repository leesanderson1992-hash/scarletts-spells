# Next Teaching Dictionary 1,000-word batch

This folder is a deterministic **human-review candidate**, not an approved or
importable production package.

## Current result

- new word candidates: 1,000
- metadata candidates: 1,000
- proposed word-to-micro-skill mappings: 1,001
- draft dictation rows: 1,000
- existing-row repair decisions: 16
- forced learner-demand words: 6
- exact MorphoLex matches: 986
- candidates with verified prefixes: 69
- candidates with verified suffixes: 281
- production mutation authorised: no

The candidate validator reports `valid_human_review_required`. The canonical
Teaching Dictionary validator intentionally rejects the draft package because
the word, mapping, metadata, and dictation review statuses remain `in_review`.

## Review authority

`Teaching Dictionary - Next 1000 Review.xlsx` is the human review surface.
Every required review column must be `approved`, with `reviewed_by` and
`reviewed_at` populated. Reviewers must replace every generic dictation
placeholder with a contextual sentence and resolve the `wordfreq` source/legal
gate. An automated proposal must not be approved merely to satisfy a learner
item or to complete the batch count.

The workbook-driven finalizer fails closed until all selection, metadata,
mapping, dictation, source, and existing-repair gates pass. It then emits a
separate `approved-csv/` folder; it never imports or mutates a database.

## Reproduction

The generation environment needs the pinned packages in
`scripts/requirements-teaching-dictionary.txt`, plus local source copies of:

- open-dict-data `ipa-dict` en_UK
- CMUdict
- MorphoLex-en

Run, from the repository root:

```bash
node --env-file=.env.local scripts/snapshot-next-teaching-dictionary-production.mjs \
  docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-next-1000-word-batch/production-snapshot.json

python3 scripts/build-next-teaching-dictionary-batch.py \
  --snapshot docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-next-1000-word-batch/production-snapshot.json \
  --ipa /path/to/ipa-dict/data/en_UK.txt \
  --cmudict /path/to/cmudict.dict \
  --morpholex /path/to/MorphoLEX_en.xlsx \
  --output docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-next-1000-word-batch \
  --limit 1000

python3 scripts/validate-next-teaching-dictionary-batch.py \
  docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-next-1000-word-batch \
  --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-next-1000-word-batch/candidate-validation-report.json
```

After named human review:

```bash
python3 scripts/finalize-next-teaching-dictionary-batch.py \
  --workbook "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-next-1000-word-batch/Teaching Dictionary - Next 1000 Review.xlsx" \
  --candidate-csv docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-next-1000-word-batch/csv \
  --output docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-next-1000-word-batch/approved-csv

python3 scripts/validate-teaching-dictionary-csv.py \
  docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-next-1000-word-batch/approved-csv \
  --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-next-1000-word-batch/approved-validation-report.json
```

Staging import, lesson proof, separately confirmed production import, and
protected-table reconciliation occur only after the approved validator report
has zero errors.
