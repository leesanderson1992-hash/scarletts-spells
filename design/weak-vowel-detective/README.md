# Vowel Detective layout proposals

Each option has a light and dark PNG and an editable SVG. Regenerate the SVGs with `python3 design/weak-vowel-detective/generate-mockups.py`; the PNGs were rendered with the repository's Sharp dependency. Option 3 is now implemented in the weak-vowel lesson route, with a live preview at `/dev/adle/weak-vowels/detective-layout`.

- **Option 1 — Focused steps:** full-width game and how-to cards above a single question board.
- **Option 2 — Two-card lesson:** matches the selected Call It To Dinner layout, with game and instructions side by side.
- **Option 3 — Investigation desk:** left challenge board and a locked family-investigation preview on the right.

All options keep **Hear the word** beside the question, present A/E/I/O/U/Y, and hide family spellings until the first answer. The sample `hum_n` is illustrative. Runtime words, family availability, and word counts must come from the selected assignment. The family stage remains optional when approved family evidence is unavailable.

The live Option 3 keeps the HU-MAN spelling tip behind the first answer. It appears during family exploration; when there is no family to explore, it appears with the completed result. It is hidden during the final answer-from-memory attempt.
