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
