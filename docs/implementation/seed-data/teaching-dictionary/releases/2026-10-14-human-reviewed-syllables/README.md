# Human-reviewed syllable and phoneme release

Katie Sanderson supplied the reviewed selection in `Untitled spreadsheet - syllable-breakdown-review-2026-10-14.csv` on 2026-10-14. The `Human Selection` column is authoritative; where it contained alternatives, the first was used. Obvious one-syllable and spelling corrections were confirmed in conversation. The phoneme changes for `I'd` and `I'm` were explicitly excluded.

The manifest contains all 1,993 active en-GB words. It stores 1,991 written breakdowns and proposes 39 spoken syllable-count corrections and 32 phoneme-hint changes. `Mr` and `Mrs` have no letter-for-letter written breakdown and were left unchanged, as approved.

The release script creates a new metadata import batch, supersedes the prior active metadata rows, and stores the selected written divisions in `source_metadata.humanApprovedWrittenSyllableBreakdown`. Numeric `syllables` stays numeric for dictionary banding. Existing metadata rows remain available for audit.

Production batch: `5f8e16f4-f353-42ee-a94c-35266a8709ce`  
Manifest SHA-256: `9737d9a9ec47107a819a7878d5555d0ddca7c3ac08cc5cede131adfe136fd4b3`

Readback verified all 1,993 active words against the manifest after application.
