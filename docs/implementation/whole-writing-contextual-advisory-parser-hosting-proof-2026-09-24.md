# S8 V4 contextual advisory parser hosting proof — 24 September 2026

This is a deployment investigation, not a V4 candidate change or an approval
receipt. The global contextual-review control remains off. No learner writing
was used in the probes below.

## Current Preview boundary

The existing Vercel Preview deploys the Next.js application as Node functions.
A Preview-only diagnostic confirmed that `python3` is not executable in that
function. The diagnostic route was removed from the working tree after the
probe. The frozen V4 boundary calls `spawnSync` on local executables named by
`S8_V4_PYTHON` and `S8_V4_TRANSFORMER_PYTHON`; merely adding those variables
to the existing Node deployment cannot make the adapter available.

The Vercel team is on Hobby. Its function memory ceiling is 2 GB. The frozen
transformer process was previously measured near this limit, so a combined
Next.js-and-transformer function cannot be assumed safe without a full runtime
proof. No Production deployment setting was changed.

## Isolated pinned package proof

`python/s8-v4-spacy/Dockerfile.runtime` is a development packaging recipe.
Its Python base is pinned to the `python:3.12.14-slim` multi-architecture
digest `sha256:2f17fc044b579bab302c2e8054d3a686e2cb9a83de48e70534b94cd8ebbe06a9`.
The transformer image installs the exact PyTorch 2.14.0 CPU wheel by
architecture-specific SHA-256 before applying the frozen dependency lock, so
Linux dependency resolution does not install CUDA packages. It changes no
adapter, manifest, family rule, parser version, or release state.

Local image builds and non-learner counterfactual probes passed:

| Image | Local image ID | Adapter identity result |
| --- | --- | --- |
| `s8-v4-spacy-sm:local` | `sha256:fc2697db7498b7d7bddd915c9b4af442aa9a40a22ff42364d39fb01a190ad7c7` | Python 3.12.14, spaCy 3.8.16, `en_core_web_sm` 3.8.0, tree SHA-256 `a07424822a13ad5bd9cb7a021e219c77279a907c58171c52846448b832107ed4`; exact counterfactuals aligned. |
| `s8-v4-spacy-trf:local` | `sha256:e56d19d171c8678711468efab9d7541ea7a28ef4bc2d077a37896041d4e5aa21` | Python 3.12.14, spaCy 3.8.16, `en_core_web_trf` 3.8.0, tree SHA-256 `0f6894e257827c6ad731b5cb9d1162bffd308fd0e99444d51b822890c4bb9d6e`, wheel SHA-256 `272a31e9d8530d1e075351d30a462d7e80e31da23574f1b274e200f3fff35bf5`; exact counterfactuals aligned. |

The first small image was about 436 MB uncompressed and the initial
CPU-transformer image about 1.86 GB. A transformer probe succeeded with a
2 GB container memory limit, including a second probe with an additional
250 MB resident process, but its cgroup peak reached the limit. These are
local ARM64 proofs, not a Vercel x86-64 capacity or latency guarantee.

An experimental combined Next.js-and-Python image was **not** accepted: the
local Docker daemon stopped during its large build. The unverified root
Dockerfile, Docker ignore file, and Next.js standalone configuration were
removed. No such image was deployed.

## Next gate

Before enabling the global control, select and verify a hosting topology that
provides the exact local-process adapter contract. A combined Vercel image
would preserve the frozen call boundary but requires a successful full-image
build, x86-64 runtime identity and memory proof, and an authenticated Preview
end-to-end test. An isolated parser service would avoid sharing function
memory but requires a separately reviewed transport/security boundary and
semantic-equivalence proof; it must not be represented as a frozen V4 source
change. Until one path passes, Preview observations may be `NOT_ASSESSED` and
must not be described as analyser-assisted review.
