# Contextual advisory current-state handoff — 25 September 2026

This is the current-state handoff for the global contextual-writing advisory
path. It does not amend the historical receipts linked below: those remain
accurate records of their respective points in time.

## Current decision

The contextual advisory pathway is implemented but is **not active for
learners**. The sole-owner advisory-use exception is approved, the relevant
additive Production Supabase migrations have been applied, and the contextual
learning handoff is implemented. The single global
`writing_context_advisory_control.enabled` switch remains **OFF**. No
learner-facing contextual advisory activation has occurred.

The frozen V4 analyser is not safely deployable in a Vercel Hobby 2 GB
Function in its current form. Consequently:

- Hobby deployment of frozen V4 is blocked.
- No paid Vercel plan has been authorised.
- No separate parser service has been authorised.
- No low-memory loader modification has been authorised.
- No Production or Preview contextual advisory activation occurred.
- No learner writing was used in the hosting investigation.

The existing Preview deployment is not analyser-assisted: its Node runtime has
no executable pinned Python runtime for the frozen V4 adapters. It may still
show the non-analyser product path while the global switch is off.

## Governance and feature state

The global contextual-review implementation uses immutable writing snapshots
and exact UTF-16 occurrences. It records an advisory observation separately
from the parent's contextual decision, a child repair attempt, the parent's
confirmation of that repair, and any optional Admin diagnostic promotion.
Machine output is advisory only; the parent remains the authority.

The current learning handoff permits a parent-confirmed contextual `INVALID`,
when categorised through the ordinary learning flow (for example, as a concept
gap with an existing homophone microskill), to create the existing governed
learning need / Known Error / Golden Nugget input / ADLE teaching requirement
where the established authority permits it. A prompted word-only retry remains
`REPAIR_ONLY`; it is not independent contextual mastery, authentic use,
transfer, proficiency, or retirement evidence.

The Production Supabase preflight recorded the relevant 15 additive migrations
from `20260906100000` through `20260924130000` as applied, including the
global contextual-review and parent-confirmed learning-handoff schema. The
control was read back as disabled, with no contextual parent decisions at that
time. This was schema preparation, not analyser or learner-facing activation.

For the authoritative implementation and governance details, see:

- [Global contextual parent-review implementation receipt](whole-writing-global-context-parent-review-implementation-2026-09-24.md)
- [Contextual parent learning-handoff receipt](whole-writing-contextual-parent-learning-handoff-receipt-2026-09-24.md)
- [Sole-owner advisory exception and Preview preflight](whole-writing-global-context-advisory-exception-proposal.md)
- [Production-trial rollback runbook](../operations/global-contextual-review-production-rollback.md)

## Frozen V4 identity and evidence boundary

No frozen V4 analyser behaviour, parser version, fallback policy, release
manifest, family rule, evaluator behaviour, release state, dispatch, or Stage
A evidence was changed for hosting work. Hosting measurements are operational
experiments, not new qualification evidence and not a modification of frozen
V4 behaviour.

The pinned adapter identities are:

| Role | Runtime identity |
| --- | --- |
| Primary | Python 3.12.14; spaCy 3.8.16; `en_core_web_sm` 3.8.0; model tree SHA-256 `a07424822a13ad5bd9cb7a021e219c77279a907c58171c52846448b832107ed4` |
| Gated fallback | Python 3.12.14; spaCy 3.8.16; `en_core_web_trf` 3.8.0; model tree SHA-256 `0f6894e257827c6ad731b5cb9d1162bffd308fd0e99444d51b822890c4bb9d6e`; wheel SHA-256 `272a31e9d8530d1e075351d30a462d7e80e31da23574f1b274e200f3fff35bf5` |

The four V4 release identities and manifest fingerprints remain unchanged:

| Release key | Release ID | Manifest fingerprint |
| --- | --- | --- |
| `s8-v4-there-their-theyre` | `81000000-0000-4000-8000-000000000013` | `bafbde65cefab052a37d9cebdb8a5ffc74e4641a41c01450bbd3d5e3b0d42a70` |
| `s8-v4-to-too-two` | `81000000-0000-4000-8000-000000000014` | `d6e6fe6ec73073e8f3601538a046aae7c183da90e6f4de523df157ec4bbf2731` |
| `s8-v4-your-youre` | `81000000-0000-4000-8000-000000000015` | `1bc1b382b991bebbdf393568fce813aad661c7044a0c8a98db0959682f8c2fea` |
| `s8-v4-its-its` | `81000000-0000-4000-8000-000000000016` | `da03bebde5b8dc76619e6fc19af773ef105e182a646e13cf9ed35c202cc083da` |

Exact-span synthetic counterfactual probes passed with the pinned adapters
under adequate memory. The contextual advisory-routing regression passed. The
host-side adapter regression cannot run without configuring the required
pinned Python executable, which is an expected fail-closed absence rather than
evidence of a changed frozen release.

Relevant implementation sources:

- [Frozen transformer adapter](../../python/s8-v4-spacy/transformer-adapter.py)
- [Frozen V4 runtime identities and local-process boundary](../../lib/writing-engine/whole-writing/context-structure-v4.ts)
- [Frozen V4 implementation-freeze receipt](whole-writing-s8-v4-implementation-freeze-2026-09-22.md)

## Hosting investigation: superseding operational finding

The earlier [parser-hosting proof](whole-writing-contextual-advisory-parser-hosting-proof-2026-09-24.md)
is a historical intermediate record. Its then-open 2 GB question has now been
tested. The measurements below are **local Linux-container measurements, not
Vercel deployment measurements**. They used synthetic counterfactual inputs,
not learner writing, and the exact pinned model identities stated above.

| Measured stage | Observed memory |
| --- | ---: |
| Python runtime alone | ~16 MiB RSS |
| spaCy imported for transformer path | ~276 MiB RSS |
| Small model loaded / after inference | ~147 / 149 MiB RSS |
| Transformer settled after load | ~1.19 GiB RSS |
| Transformer cold-load peak, short input | ~2.37 GiB RSS |
| Transformer cold-load peak, 488-token input | ~2.61 GiB RSS |
| Transformer first / subsequent short inference | ~1.21 / 1.09 GiB RSS |
| Node runtime alone / with a 128 MiB buffer | ~43 / 173 MiB RSS |
| Node plus exact transformer adapter, one request | ~2.80 GiB combined peak |
| Node plus exact transformer adapter, 32 requests | ~2.91 GiB combined peak |

The exact standalone Python transformer adapter was killed under a 2 GB
container cap with exit status 137. The combined Node-and-adapter process also
reached the cap and returned no analyser result under that limit.

The dominant problem is transformer **cold model loading**, not steady-state
inference. The loader reads and deserialises the approximately 475 MiB model
into runtime structures and tensors, causing a short-lived peak above the
Hobby memory limit. The exact frozen transformer does settle below that peak,
but this does not provide safe operating headroom for a cold Function.

Isolated experiments excluding NER and reducing processing batch size did not
materially remove the cold-load peak. They were not adopted because the frozen
V4 identity includes the complete pipeline and parser batch size. No memory
mapping, safetensors, quantisation, reduced-precision, ONNX, replacement
weights, or custom low-peak loader has been accepted: any such route requires
a separately governed semantic-equivalence claim. A larger package or
container bundle allowance would not change the runtime RAM limit.

Splitting Node and Python into separate Hobby Functions is not a solution in
the current form: the pinned Python transformer adapter alone exceeds the
2 GB limit while loading. Such a split would additionally require an
authenticated text-and-span transport, privacy-safe logging, bounded payloads,
and exact semantic-equivalence and provenance checks; it is not authorised by
this handoff.

## Unapproved future possibilities

The following are options for a separately authorised investigation only. None
is implemented, selected, funded, or approved here:

1. An isolated low-peak loader experiment, with exact adapter-output and
   semantic-equivalence proof against the frozen V4 contract.
2. Higher-memory hosting, after a separate cost, deployment, and operational
   approval.
3. An alternative hosting platform that can run the exact pinned transformer
   with verified memory, privacy, provenance, and rollback controls.
4. A separately governed AI/API contextual-analysis benchmark. It would be a
   comparison exercise, not an implicit replacement for V4 and not an
   authority for learning or qualification evidence.

## Repository baseline

Immediately before this documentation update, the worktree was clean and both
local `HEAD` and `origin/codex/global-contextual-parent-review` resolved to:

```
1fdcd4de51e972c44a5bc9d4483a5e93b2a4a552
```

This handoff itself is documentation only. It does not authorise a deployment,
feature enablement, release approval, parser modification, or further work.
