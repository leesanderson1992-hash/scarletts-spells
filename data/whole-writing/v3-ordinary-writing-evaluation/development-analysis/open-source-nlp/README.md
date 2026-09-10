# Open-source NLP development analysis

This directory is **development/regression evidence only**. It is derived from the already-exposed `THERE_THEIR_THEYRE` and `TO_TOO_TWO` V3 ordinary-writing holdouts. It is not holdout, approval, publication, selection, activation or release evidence and must not be shown to a future independent human reviewer.

No analyser prediction was used to create or change human gold. No analyser, manifest, release, candidate, gold, governed evaluation report or operational state was changed by this investigation.

## Files

- `failed-case-feature-comparison.jsonl` contains one compact record for every exposed decision that failed an applicable evaluator outcome, plus the separately requested successful gerund-structure diagnostic. Each record retains the governed evidence fingerprints, frozen V3 decision, root-requirement classification, spaCy/Stanza output for all finite family substitutions, LanguageTool target matches and a bounded structural-feature assessment.
- `failure-class-summary.json` aggregates the per-case evidence. “Sufficient structural signal candidate” means that a deliberately simple, gold-informed development signature was present only for the expected family substitution. It is not a new analyser result and must not be presented as precision, recall or approval evidence.
- `ud-english-ewt-summary.json` records relevant distributions and examples from the pinned local UD English-EWT checkout.
- `runtime-and-reproducibility.json` records versions, model fingerprints, resource measurements and the byte-identical repeat runs.

## Reproduction boundary

The research scripts are under `scripts/research/`. Dependencies were installed only in an isolated temporary virtual environment; none were added to the application dependency graph. The frozen candidate extraction is reproducible with:

```sh
S8_V3_EVALUATION_ROOT=data/whole-writing/v3-ordinary-writing-evaluation \
  npx tsx scripts/research/collect-whole-writing-v3-nlp-failures.ts /tmp/exposed-failures-input.jsonl
```

The parser and comparator scripts require separately installed, pinned local copies of spaCy, `en_core_web_sm`, Stanza English models, LanguageTool and Java. They make no network calls during evaluation. See the implementation report for the exact tested versions and deployment recommendation.
