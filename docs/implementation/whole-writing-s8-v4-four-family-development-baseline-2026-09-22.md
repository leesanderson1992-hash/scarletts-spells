# S8 V4 four-family development baseline — 2026-09-22

**DEVELOPMENT / REGRESSION — NOT APPROVAL EVIDENCE**

This receipt extends the default-off V4 structural candidate architecture to
`YOUR_YOURE` and `ITS_ITS`. It uses frozen G2 development regression evidence
and targeted engineering fixtures only. It creates neither a fresh holdout nor
an approval, selection, publication, activation, deployment, or learning
consequence.

## Architecture and candidate identity

The new candidates preserve the established source → ADLE span authority →
ADLE protection → spaCy structural facts → normalized ADLE feature contract →
ADLE finite-family arbitration path. The adapter supplies no correction or
classification. Both candidates are `DEVELOPMENT_CANDIDATE_DEFAULT_OFF` and
are absent from persisted release dispatch.

| Family | Release key | Release ID | Manifest fingerprint |
|---|---|---|---|
| YOUR_YOURE | `s8-v4-your-youre` | `81000000-0000-4000-8000-000000000015` | `c4c8dd2745dfc8244c60feb81ea5d3e79360f5c760ab0e55e3d37add92f2272b` |
| ITS_ITS | `s8-v4-its-its` | `81000000-0000-4000-8000-000000000016` | `902d1b1cb832e73e3715492130cc60fb946cb6cfc8b65bfd98c6c9b1bd87bdc1` |

The shared adapter DependencyMatcher frames now express generic possessive
nominal attachment and pronoun-subject contraction frames. Family rules still
require the relevant focus token, normalized dependencies, finite-family
counterfactuals, and a unique supported outcome. The shared contraction helper
also retains the existing `prepared`/`due` semantic abstention policy.

## Development results

| Family | Evidence / current path | Precision | Wilson lower 95% | Supported recall | Valid recognition | False VALID | Wrong alternative | Protected failure | Decisions (V/I/U) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| THERE | exposed ordinary corpus, V4-small | 100% | 97.49% | 86.63% | 79.84% | 0 | 0 | 0 | 198 / 149 / 182 |
| TO | exposed ordinary corpus, V4-small | 100% | 96.87% | 79.33% | 68.04% | 0 | 0 | 0 | 694 / 119 / 457 |
| YOUR | frozen G2, V4-small | 100% | 97.50% | 100% | 100% | 0 | 0 | 0 | 150 / 150 / 100 |
| ITS | frozen G2, V4-small | 100% | 97.44% | 97.33% | 97.33% | 0 | 0 | 0 | 146 / 146 / 108 |

The frozen G2 candidate schema does not contain a declared subtype field, so
G2 construction recall is the available governed breakdown. Engineering
fixtures cover the V4 subtypes without representing human evidence:

| Family | Construction recall |
|---|---|
| YOUR | possessive 100%; you-are contraction 100% |
| ITS | possessive 100%; it-is contraction 92%; it-has contraction 100% |

The previously recorded transformer figures are not integrated runtime
behaviour: development-only hypothetical fallback results were THERE 90.70%
supported recall / 87.50% valid recognition and TO 84.67% / 81.96%, with the
same three zero-safety outcomes.

## Fixtures and safety boundaries

`your-its-structural-feature-fixtures.json` records 22 bounded fixtures:
possessive modifier plus noun, adjective-plus-noun, coordination, progressive,
adjectival, passive, perfect `it has`, subordinate and coordinated clauses,
multiple exact focus occurrences, ambiguous predicates, and quotation
protection. It verifies every finite counterfactual span and adapter-unavailable
fail-closed behaviour. Fixture fingerprint:
`7738747f28fee3bb5f7c37f6454d05da4ceeba9e1fcaee21560d478e5b8dc533`.

The four-family baseline artifact fingerprint is
`a4cf8a27694104a2471a1ea5b0dcdc3a0d1676ae200d6a1049f73a8759fc0d49`.

## Residual profile

Counts below are remaining development failures, not correctly protected
abstentions. The protected controls for every new family remained `UNCERTAIN`.

| Family | Structural ambiguity | Family-rule | Protection/policy | Unsupported | Evaluator issue | Other |
|---|---:|---:|---:|---:|---:|---:|
| THERE — exposed ordinary V4-small | 41 | 17 | 15 | 0 | 0 | 0 |
| TO — exposed ordinary V4-small | 218 | 19 | 37 | 20 | 63 | 0 |
| YOUR — frozen G2 V4-small | 0 | 0 | 0 | 0 | 0 | 0 |
| ITS — frozen G2 V4-small | 0 | 8 | 0 | 0 | 0 | 0 |

Largest understood patterns are: TO counterfactual accommodation for governed
infinitives (156 exposed cases) and numerals (37); THERE possessive or
contraction competition; and ITS `it is` predicative `right`/`kind` frames
(eight G2 cases), where spaCy-small does not yield a governed adjective frame.
The latter remains `UNCERTAIN`; no closed adjective list was restored.

The shared mechanisms are possessive nominal attachment (`their`/`your`/`its`)
and pronoun + contracted `be` frames (`they're`/`you're`/`it's`). They are
implemented once in the normalized V4 family layer, with family-specific
construction policy retained at the selection stage.

## Verification and next boundary

Verified locally with the pinned spaCy-small development environment:

- V4 release identity and default-off dispatch regression;
- THERE/TO adapter fixtures and protection checks;
- YOUR/ITS 22-fixture structural, counterfactual-span, quotation, ambiguity,
  and adapter-unavailable checks;
- four-family frozen-G2 development regression;
- exposed THERE/TO development regression after the shared change;
- TypeScript and focused lint checks.

No `en_core_web_trf` dependency was added to V4 runtime closure. No parser
cost-minimisation bake-off was performed. The next bounded task is to compare
the now-understood four-family residual profile across parser configurations
without changing approval evidence or release dispatch.
