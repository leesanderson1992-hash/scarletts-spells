# Next Teaching Dictionary 1,000-word batch

This folder is a deterministic **human-review candidate**, not an approved or
importable production package.

The immutable approved release produced from this candidate lives at:

```text
docs/implementation/seed-data/teaching-dictionary/releases/2026-07-26-next-1000-canonical-words-v2/
```

Only that fingerprinted package may enter the staging/production release
pipeline. See `docs/operations/teaching-dictionary-release-runbook.md`.

## Current result

- new word candidates: 1,000
- metadata candidates: 1,000
- reviewed linguistic-morphology and word-sum decisions: 1,000
- proposed word-to-micro-skill mappings: 0
- draft dictation rows: 1,000
- existing word-fact repair decisions: 3 (`govern`, `governor`, `tall`)
- forced learner-demand words: 6
- exact MorphoLex matches: 986
- candidates with verified prefixes: 69
- candidates with verified suffixes: 281
- production mutation authorised: no

The candidate validator reports `valid_human_review_required`. This is a
canonical-word-only package: it contains no teaching content, support links,
learning items, assignments, evidence, proficiency, rewards or Word Treasure
records. MorphoLex is raw linguistic evidence; it is never automatically made
into a child-facing word sum or a micro-skill route.

## Review authority

`Teaching Dictionary - Next 1000 Review.xlsx` is the human review surface.

- **Canonical word review** — review identity, selection evidence, pronunciation,
  British English, accessibility and source/licence evidence.
- **Linguistic morphology & word sums** — preserve the raw MorphoLex evidence,
  then explicitly approve a structured analysis and child-facing word sum,
  mark it `not_applicable`, or reject it. Feature keys such as `suffix:ing` and
  `base:vis` are future transfer-selection capability, not lesson assignments.
- **Dictation review** — replace every generic sentence; the target must occur
  once at its recorded token index and audio text must match.
- **Sources & licence** and **Existing word-fact repairs** — named review only.

Every required review column must be approved with `reviewed_by` and
`reviewed_at` populated; morphology must additionally end in an explicit
decision. Reviewers must resolve the `wordfreq` source/legal gate. A word must
not be approved merely to satisfy a learner item or to complete the batch.

The workbook-driven finalizer fails closed until all canonical-word, morphology,
dictation, source, and existing-repair gates pass. It then emits a
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

The approved workbook’s three existing-row entries contain reviewed repair
intentions but no factual before/after metadata fields. They are retained in
the release as deferred repair intentions and are not counted or imported as
completed repairs.
