#!/usr/bin/env python3
"""Validate a fresh review-sheet CSV against governed source facts before Dinner publication.

Dry-run by default. --write copies only hash-verified, approved word recordings
and writes the release after every approved row has passed validation.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
from pathlib import Path


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def cut_set(raw: str, spelling: str) -> list[int]:
    raw = raw.strip()
    if re.fullmatch(r"\d+(?:\s*,\s*\d+)*", raw):
        return [int(value.strip()) for value in raw.split(",")]
    if "·" in raw:
        pieces = raw.split("·")
    elif "|" in raw:
        pieces = raw.split("|")
    elif "-" in raw and "-" not in spelling:
        pieces = raw.split("-")
    elif "." in raw:
        pieces = raw.split(".")
    else:
        raise ValueError("use reviewed pieces joined by · or numeric letter-gap indexes")
    pieces = [piece.strip() for piece in pieces]
    if len(pieces) < 2 or any(not piece for piece in pieces) or "".join(pieces) != spelling:
        raise ValueError("cut pieces do not reconstruct the exact canonical spelling")
    cursor = 0
    result = []
    for piece in pieces[:-1]:
        cursor += len(piece)
        result.append(cursor)
    return result


def validate_cuts(cuts: list[int], spelling: str, count: int, target: dict, target_syllable: int) -> None:
    if len(cuts) != count - 1 or cuts != sorted(set(cuts)) or any(not 0 < cut < len(spelling) for cut in cuts):
        raise ValueError("cut positions do not make the approved spoken syllable count")
    bounds = [0, *cuts, len(spelling)]
    if not (bounds[target_syllable - 1] <= target["start"] and target["end"] <= bounds[target_syllable]):
        raise ValueError("target spelling crosses a cut or sits outside its reviewed spoken syllable")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet", type=Path, required=True, help="Fresh CSV export of Word activity review")
    parser.add_argument("--source", type=Path, required=True, help="Current governed word/skill/pronunciation export")
    parser.add_argument("--audio-root", type=Path, required=True, help="Approved standalone word MP3 directory, named by canonical ID")
    parser.add_argument("--output", type=Path, default=Path("content/secret-life-of-vowels/dinner-approved.json"))
    parser.add_argument("--public-dir", type=Path, default=Path("public/audio/secret-life-of-vowels/dinner"))
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    source_by_pair: dict[tuple[str, str], list[dict[str, str]]] = {}
    for row in rows(args.source):
        source_by_pair.setdefault((row["word"], row["micro_skill_key"]), []).append(row)

    approved = []
    copies: list[tuple[Path, Path]] = []
    errors = []
    skipped = 0
    for line_number, sheet in enumerate(rows(args.sheet), start=2):
        decision = sheet.get("dinner_decision", "").strip()
        if not decision.startswith("Approve"):
            skipped += 1
            continue
        label = f"sheet row {line_number}: {sheet.get('word', '?')} / {sheet.get('micro_skill_key', '?')}"
        try:
            if sheet.get("review_scope") != "Review" or sheet.get("assignment_status") != "assigned" or sheet.get("editor_decision") != "KEEP":
                raise ValueError("approved Dinner row is not a current KEEP assignment")
            if sheet["word"] == "brochure":
                raise ValueError("brochure is owner-excluded from the cleaver task")
            matches = source_by_pair.get((sheet["word"], sheet["micro_skill_key"]), [])
            if len(matches) != 1:
                raise ValueError("missing or ambiguous governed source row")
            source = matches[0]
            if source["source_fingerprint"] != sheet.get("source_fingerprint"):
                raise ValueError("stale sheet fingerprint; re-export and review the changed source")
            digest = source.get("approved_word_audio_sha256", "")
            if not re.fullmatch(r"[a-f0-9]{64}", digest):
                raise ValueError("approved word recording hash is missing")
            # The owner approved the exact British clip. Give its word/clip
            # binding a stable technical ID without requesting a new listening review.
            bound = hashlib.sha256(f"{source['canonical_word_id']}|{digest}".encode()).hexdigest()[:20]
            pronunciation_id = source.get("reviewed_pronunciation_id") or (
                source.get("current_pronunciation_id") if source.get("pronunciation_variant_status") == "registered" else ""
            ) or f"gb-word-{bound}"
            if pronunciation_id.startswith("candidate-"):
                raise ValueError("candidate pronunciation ID cannot be published")
            spelling = sheet["word"]
            span = re.fullmatch(r"(.+?)\s+\[(\d+),(\d+)\)", sheet.get("target_span_to_review", "").strip())
            if not span:
                raise ValueError("column H needs the full reviewed target span: text [start,end)")
            target = {"text": span.group(1), "start": int(span.group(2)), "end": int(span.group(3))}
            if spelling[target["start"]:target["end"]] != target["text"]:
                raise ValueError("full target spelling and zero-based span disagree")
            final_vowel = {
                "D4_SCHWA_FINAL_AR_FINAL": "a", "D4_SCHWA_FINAL_ER_FINAL": "e", "D4_SCHWA_FINAL_OR_FINAL": "o"
            }.get(sheet["micro_skill_key"])
            selection_target = None
            if final_vowel:
                suffix = f"{final_vowel}r"
                if (spelling[-2:].lower() != suffix or target["text"].lower() != suffix or
                        target["start"] != len(spelling) - 2 or target["end"] != len(spelling)):
                    raise ValueError(f"final -{suffix} Dinner needs the reviewed full ending at the word's end before its vowel-only answer can be published")
                selection_target = {"text": spelling[target["start"]], "start": target["start"], "end": target["start"] + 1}
            count = int(sheet["dinner_spoken_syllable_count"])
            target_syllable = int(sheet["dinner_target_syllable_1based"])
            if count < 1 or not 1 <= target_syllable <= count:
                raise ValueError("spoken count or target syllable is invalid")
            # AK overrides the AG candidate. A blank AK means M approves AG as shown.
            raw_cuts = sheet.get("dinner_accepted_cut_variants_review", "").strip() or sheet.get("dinner_written_breakdown_candidate", "").strip()
            if not raw_cuts:
                raise ValueError("review and enter at least one syllable cut")
            cut_sets = []
            for raw_variant in re.split(r"[;\n]+", raw_cuts):
                if not raw_variant.strip():
                    continue
                cuts = cut_set(raw_variant, spelling)
                validate_cuts(cuts, spelling, count, target, target_syllable)
                if cuts not in cut_sets:
                    cut_sets.append(cuts)
            if not cut_sets:
                raise ValueError("no valid reviewed cut variant")
            audio = args.audio_root / f"{source['canonical_word_id']}.mp3"
            if not re.fullmatch(r"[a-f0-9]{64}", digest) or not audio.is_file() or hashlib.sha256(audio.read_bytes()).hexdigest() != digest:
                raise ValueError("approved standalone recording is absent or has changed")
            sound_type = source.get("reviewed_sound_type", "")
            if sound_type not in {"schwa", "other_unstressed"}:
                raise ValueError("reviewed sound type must distinguish schwa from another unstressed vowel")
            output_audio = args.public_dir / f"{digest[:16]}.mp3"
            approved.append({
                "schemaVersion": "call_it_to_dinner_round_v1", "contentVersion": "dinner-reviewed-release-v3",
                "reviewStatus": "approved", "canonicalWordId": source["canonical_word_id"], "spelling": spelling,
                "microSkillKey": sheet["micro_skill_key"],
                "wordSense": source.get("owner_confirmed_word_sense") or source.get("current_word_sense") or None,
                "pronunciationId": pronunciation_id, "sourceFingerprint": source["source_fingerprint"],
                "recording": {"src": f"/audio/secret-life-of-vowels/dinner/{output_audio.name}", "sha256": digest, "reviewStatus": "approved"},
                "spokenSyllableCount": count, "acceptedCutSets": cut_sets,
                "target": {**target, "syllableIndex": target_syllable, "soundType": sound_type},
                **({"selectionTarget": selection_target} if selection_target else {}),
            })
            copies.append((audio, output_audio))
        except (KeyError, ValueError) as error:
            errors.append(f"{label}: {error}")

    result = {"approved": len(approved), "skipped": skipped, "errors": errors, "written": False}
    if errors:
        print(json.dumps(result, indent=2))
        return 1
    if args.write:
        args.public_dir.mkdir(parents=True, exist_ok=True)
        for source, destination in copies:
            shutil.copy2(source, destination)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({"schemaVersion": "dinner_release_v1", "rounds": approved}, ensure_ascii=False, indent=2) + "\n")
        result["written"] = True
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
