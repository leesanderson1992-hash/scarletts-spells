# ADLE Template Development Contract

## Purpose

This contract defines what every ADLE activity template must declare and prove before implementation.

## Template Declaration

Every template must declare:

- template key;
- template version;
- supported category/family keys;
- mode: discover, practise, recall, reflect, review, or probe;
- semantic payload schema;
- normaliser to renderer view model;
- answer-visibility policy;
- correctness policy;
- completion envelope;
- fallback ladder;
- accessibility requirements;
- evidence class label;
- scheduler/reward boundary statement.

## Template Versus Configuration

Use configuration when the cognitive task, interaction state machine, answer model, answer visibility, and evidence semantics are the same.

Create a new template only when one of those is materially different.

Themes, experience profiles, copy, examples, colours, animation, or scene style do not by themselves create a new template.

## Completion Envelope

Templates may capture interaction truth such as selection, typed text, tile order, split point, hint use, replay count, duration, and local completion.

Capturing interaction truth does not mean pricing it as proficiency evidence. Evidence semantics remain outside the renderer.

## Fallback Contract

Every template must declare:

```text
full interactive -> degraded interactive -> safe warm shell
```

Fallbacks must preserve answer-visibility policy, child safety, assignment completion, and existing scheduler semantics.

Missing data must never convert hidden recall into visible copying.

## Proof Before Enablement

Before runtime enablement, a template needs representative proof for:

- schema validation;
- fallback safety;
- answer visibility;
- keyboard/touch use;
- reduced motion;
- sound-off operation;
- mobile layout;
- attempt capture compatibility;
- evidence/scheduler/reward non-regression.
