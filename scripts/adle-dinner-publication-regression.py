#!/usr/bin/env python3
"""Guard Dinner publication against unbound pronunciation, stale facts, and bad cuts."""

import csv
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path


def write_csv(path, row):
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(row))
        writer.writeheader()
        writer.writerow(row)


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    audio = root / "audio"
    audio.mkdir()
    clip = b"approved review fixture clip"
    digest = hashlib.sha256(clip).hexdigest()
    (audio / "word-id.mp3").write_bytes(clip)
    source = {
        "word": "dinner", "micro_skill_key": "D4_SCHWA_FINAL_ER_FINAL", "canonical_word_id": "word-id",
        "source_fingerprint": "1" * 64, "reviewed_pronunciation_id": "", "current_pronunciation_id": "",
        "pronunciation_variant_status": "not_registered", "approved_word_audio_sha256": digest,
        "proposed_sound_type": "unstressed_schwa_/ə/", "owner_confirmed_word_sense": "", "current_word_sense": "",
    }
    sheet = {
        "word": "dinner", "micro_skill_key": source["micro_skill_key"], "review_scope": "Review",
        "assignment_status": "assigned", "editor_decision": "KEEP", "dinner_decision": "Approve",
        "source_fingerprint": source["source_fingerprint"], "target_span_to_review": "er [4,6)",
        "dinner_spoken_syllable_count": "2", "dinner_target_syllable_1based": "2",
        "dinner_written_breakdown_candidate": "din·ner", "dinner_accepted_cut_variants_review": "",
    }
    source_path, sheet_path = root / "source.csv", root / "sheet.csv"
    command = ["python3", "scripts/prepare-dinner-release.py", "--sheet", str(sheet_path),
               "--source", str(source_path), "--audio-root", str(audio)]

    def check(expected_code, expected_text):
        write_csv(source_path, source)
        write_csv(sheet_path, sheet)
        result = subprocess.run(command, text=True, capture_output=True, check=False)
        assert result.returncode == expected_code, result.stdout + result.stderr
        assert expected_text in result.stdout, result.stdout
        return json.loads(result.stdout)

    check(1, "register and bind the reviewed pronunciation")
    source["reviewed_pronunciation_id"] = "registered-dinner-uk-v1"
    assert check(0, '"approved": 1')["written"] is False
    sheet["source_fingerprint"] = "2" * 64
    check(1, "stale sheet fingerprint")
    sheet["source_fingerprint"] = source["source_fingerprint"]
    sheet["dinner_accepted_cut_variants_review"] = "dinne·r"
    check(1, "target spelling crosses a cut")

print("Dinner publication review gate regression passed.")
