# S8 V4 spaCy structural adapter

This optional, fail-closed development-candidate dependency emits structural
facts only. It is not a spelling corrector and never emits an ADLE decision.

Create an isolated Python 3.12.14 environment, install `requirements.lock`, and
set `S8_V4_PYTHON` to its Python executable for V4 regressions. Stanza, UD
treebanks and LanguageTool are excluded from this runtime.

The batch process reads JSON from stdin and writes JSON to stdout. The
TypeScript boundary enforces timeout and response validation. Before parsing,
the adapter verifies spaCy 3.8.16, `en_core_web_sm` 3.8.0, and the installed
model package-tree SHA-256.

The frozen V4 development candidate also has an optional, narrowly gated
transformer structural fallback. Install `requirements-transformer.lock` in a
separate Python 3.12.14 environment and set `S8_V4_TRANSFORMER_PYTHON` to its
Python executable. `transformer-adapter.py` emits the same normalized ADLE
contract and verifies spaCy 3.8.16, `en_core_web_trf` 3.8.0, its wheel hash,
its installed package-tree hash, the complete pipeline, and parser batch size.

Only ADLE's typed THERE-contraction and TO-governed-infinitive ambiguity gates
may invoke this adapter. Missing, timed-out, malformed, or different-scope
fallback results retain the small-model `UNCERTAIN` result. YOUR/ITS, numeral,
protected, unsupported, evaluator-conflict, and semantic-ambiguity paths are
small-only. Process hosting (always-hot, queued, or on-demand) is deliberately
outside the semantic contract; callers submit bounded batches and exact source
spans, and source persistence never depends on either parser.
