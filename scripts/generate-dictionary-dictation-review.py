#!/usr/bin/env python3
"""Generate review-only, per-word dictation sentence drafts.

The output is deliberately not an import or approval action. It gives editors
one reviewable sentence per active canonical word; only rows marked approved in
the CSV may later be imported into the canonical sentence catalogue.
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORDS = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv/canonical_words.csv"
DEFAULT_OUTPUT = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv/dictation_sentences.csv"

# Editorially supplied exemplars replace the generic draft pattern for the
# words used by the first staging pilot. Additional reviewed overrides belong
# here only when they are also copied to the CSV for provenance and approval.
CURATED_SENTENCES = {
    "player_en_gb": "I am a professional football player.",
    "government_en_gb": "The government announced a new plan.",
    "governor_en_gb": "I am going to vote for our new governor.",
}


def tokenise(sentence: str) -> list[str]:
    return [token.lower() for token in re.findall(r"[A-Za-z]+(?:['’][A-Za-z]+)?", sentence)]


def sentence_for(word: str, word_key: str) -> str:
    curated = CURATED_SENTENCES.get(word_key)
    if curated:
        return curated
    # These are explicitly AI-assisted review drafts. They are grammatically
    # safe for any word form, while the editor can replace them with richer
    # contexts before approval. Select wording that does not repeat a target
    # such as "found" or "read" in the surrounding sentence.
    candidates = [
        f"Look at {word}.",
        f"Say {word} aloud.",
        f"Read {word} carefully.",
        f"Write {word} on your page.",
        f"Try using {word} today.",
        f"We can use {word} in class.",
        f"I noticed {word} in a book.",
        f"Our teacher chose {word} for us.",
        f"The class discussed {word} together.",
        f"Remember the word {word}.",
    ]
    target = tokenise(word)
    for candidate in candidates:
        tokens = tokenise(candidate)
        if sum(tokens[index:index + len(target)] == target for index in range(len(tokens) - len(target) + 1)) == 1:
            return candidate
    raise ValueError(f"No single-occurrence draft template is available for {word!r}.")


def target_index(sentence: str, word: str) -> int:
    target = tokenise(word)
    tokens = tokenise(sentence)
    matches = [index for index in range(len(tokens) - len(target) + 1) if tokens[index:index + len(target)] == target]
    if len(matches) != 1:
        raise ValueError(f"Sentence must contain {word!r} exactly once: {sentence!r}")
    return matches[0]


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the review-only canonical dictation sentence CSV.")
    parser.add_argument("--words", type=Path, default=DEFAULT_WORDS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--review-source", type=Path, help="Optional reviewed CSV whose sentence fields replace generated drafts.")
    args = parser.parse_args()

    with args.words.open(newline="", encoding="utf-8") as handle:
        words = list(csv.DictReader(handle))
    active = [row for row in words if row["row_status"] == "active" and row["review_status"] == "approved_for_first_exposure"]
    if len(active) != len({row["word_key"] for row in active}):
        raise ValueError("Active canonical words must have unique word keys.")

    review_rows: dict[str, dict[str, str]] = {}
    if args.review_source:
        with args.review_source.open(newline="", encoding="utf-8-sig") as handle:
            review_rows = {row["word_key"]: row for row in csv.DictReader(handle)}
        active_keys = {row["word_key"] for row in active}
        if set(review_rows) != active_keys:
            raise ValueError("Review source must contain exactly the active canonical word keys.")

    fields = [
        "word_key", "display_word", "age_band", "complexity_band", "dictation_sentence",
        "dictation_target_token_index", "audio_text", "source_category", "source_name",
        "source_url", "source_licence", "source_use_note", "confidence", "review_status",
        "reviewed_by", "reviewed_at", "review_notes",
    ]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in active:
            reviewed = review_rows.get(row["word_key"])
            sentence = reviewed["dictation_sentence"] if reviewed else sentence_for(row["display_word"], row["word_key"])
            audio = reviewed["audio_text"] if reviewed else sentence
            writer.writerow({
                "word_key": row["word_key"],
                "display_word": row["display_word"],
                "age_band": row["age_band"],
                "complexity_band": row["complexity_band"],
                "dictation_sentence": sentence,
                "dictation_target_token_index": target_index(sentence, row["display_word"]),
                "audio_text": audio,
                "source_category": "ai_assisted_draft",
                "source_name": "Scarlett's Spells dictation-sentence draft generator",
                "source_url": "",
                "source_licence": "internal",
                "source_use_note": (reviewed or {}).get("source_use_note") or "AI-assisted draft for human editorial review; do not import until approved.",
                "confidence": "low",
                "review_status": "ai_draft",
                "reviewed_by": "",
                "reviewed_at": "",
                "review_notes": (reviewed or {}).get("review_notes") or "Replace generic contexts with a natural child-friendly UK-English sentence before approval.",
            })
    print(f"Generated {len(active)} review rows at {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
