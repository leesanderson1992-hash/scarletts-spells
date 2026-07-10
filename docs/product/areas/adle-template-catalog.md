# ADLE Template Catalog

## Purpose

This document lists 7-UI template concepts and prevents unnecessary template-key growth.

## Decision Rule

Prefer configuration when:

- the cognitive task is the same;
- the interaction state machine is the same;
- the answer model is the same;
- answer visibility is the same;
- evidence semantics are the same.

Create a new template only when one of those is materially different.

## Current D4_MOR Template Sequence

```text
MICRO_READ_ONLY_INTRO
LESSON_WORDS_INTRO
MOR_STRIP_BUILD
MOR_MEANING_MATCH
MOR_BUILD_WORD
CONTROLLED_SPELLING
DICTATION_NO_IMAGE
```

`DIAGNOSTIC_DICTATION_PROBE` may appear when composed.

Themes and experience profiles are configuration, not templates.
