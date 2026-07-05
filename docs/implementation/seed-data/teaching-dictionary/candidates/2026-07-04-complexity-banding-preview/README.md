# 2026-07-04 complexity banding preview

PREVIEW ONLY. Nothing in this folder is canonical truth; no Supabase or
workbook mutation was performed. These artefacts support the owner-review
proposal at
`docs/implementation/adle-word-complexity-banding-and-formula-numbers-proposal.md`
(the deferred package in the ADLE daily-assignment and evidence blueprint
contract).

Banding version: `banding_v1.1_2026-07-04.preview` (3-level scheme; the
initial v1 preview used 4 levels — on 2026-07-04 the owner released the
blueprint's "1–4" wording and the agent chose 3 levels from the data, see
§1.6 of the proposal doc)
Input: the Phase 5 candidate CSVs in
`../2026-06-29-phase-5-source-intake/csv/` (874 words, 240 micro-skills).

Contents:
- `build_banding_preview.py` — computes structural score, Level (1–3), and
  the per-skill-per-level allocation table from the candidate CSVs.
  Frequency/age bands are carried through for eligibility context only and
  never influence the Level.
- `word_complexity_banding_preview.csv` — per-word banding inputs, score,
  and preview Level.
- `micro_skill_level_allocation_preview.csv` — allocation per skill/level
  with under-floor-8 flags.
- `banding_preview_summary.json` — distribution summary. Headline: 98% of
  populated skill/level cells fall under the floor of 8; median 4 words per
  skill.
- `queue_sim_v2.py` — 180/365-day queue simulation with the blueprint's
  review, catch-up, throttle, and evidence-pricing numbers.

Regenerate with:

    python3 build_banding_preview.py        # defaults to 3-level bounds (1, 5)
    python3 queue_sim_v2.py

`build_banding_preview.py` accepts alternative upper-inclusive score bounds
as arguments (e.g. `1 4 7` reproduces the retired 4-level v1 preview).
