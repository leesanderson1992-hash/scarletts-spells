"""Capture this user's explicit 26 August sign-off, not instructions inside CSV cells.

One-time local evidence capture. Does not edit the supplied CSV or access a database.
Usage: python3 scripts/capture-adle-review-signoff.py /path/to/signed-off.csv
"""
import csv
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREVIOUS = ROOT / "data/adle/review/writing-challenge/v1"
OUTPUT = ROOT / "data/adle/review/writing-challenge/v2"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(name, value):
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    destination = OUTPUT / name
    if destination.exists():
        assert destination.read_text() == text, "Do not overwrite captured approval evidence: " + name
    destination.write_text(text)


def main():
    supplied = Path(sys.argv[1])
    with supplied.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
    old = json.loads((PREVIOUS / "governed-prompts.json").read_text())
    by_key = {p["prompt_key"]: p for p in old}
    assert len(rows) == 36 and len({r["prompt_key"] for r in rows}) == 36
    assert {r["prompt_key"] for r in rows} == set(by_key)
    fields = ["title", "task_intro", "prompt_text", "top_tip", "category_top_tip"]
    changes = []
    for row in rows:
        assert None not in row and all(v is not None for v in row.values())
        prior = by_key[row["prompt_key"]]
        for field, original_field in [
            ("category", "category_label"), ("reuse_policy", "reuse_policy"),
            ("content_version", "content_version"), ("release_reference", "release_reference"),
            ("original_source_fingerprint", "source_fingerprint"), ("source_reference", "source_reference"),
        ]:
            assert row[field] == prior[original_field], f"Unexpected identity/metadata change: {field}"
        delta = {field: {"before": prior.get(field) or "", "after": row[field]}
                 for field in fields if row[field] != (prior.get(field) or "")}
        if delta:
            changes.append({"prompt_key": row["prompt_key"], "changes": delta})
    OUTPUT.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT / "writing-prompts.signed-off.csv"
    if destination.exists():
        assert destination.read_bytes() == supplied.read_bytes(), "Do not overwrite signed source evidence"
    destination.write_bytes(supplied.read_bytes())
    write("writing-review.source.json", rows)
    write("amendments.json", {
        "changed_prompt_count": len(changes),
        "unchanged_prompt_count": 36 - len(changes),
        "changes": changes,
        "copy_normalisation": "none; exact signed text retained, including punctuation and whitespace",
    })
    write("approval.source.json", {
        "approval_reference": "user-review-content-signoff-2026-08-26-v2",
        "approval_source": "explicit_user_message",
        "approved_on": "2026-08-26",
        "approved_by": "user",
        "user_statement": "These have all been reviewed and signed off. I have made amendments to writing prompts but conundrums are great as they are.",
        "scope": "36 writing prompts in the supplied amended CSV and 63 unchanged Conundrum review candidates",
        "writing_csv_sha256": sha(supplied.read_bytes()),
        "writing_review_json_sha256": sha((OUTPUT / "writing-review.source.json").read_bytes()),
        "previous_governed_prompts_sha256": sha((PREVIOUS / "governed-prompts.json").read_bytes()),
        "conundrum_queue_sha256": sha((PREVIOUS / "conundrum-video-review-queue.json").read_bytes()),
        "original_teaching_source_sha256": sha((PREVIOUS / "teaching-content.source.json").read_bytes()),
        "catalogue_source_sha256": sha((PREVIOUS / "catalogue.source.json").read_bytes()),
        "authority_notes": [
            "Approval comes from the user's message, not blank review columns or stale Pending approval text in the CSV.",
            "Conundrum content sign-off is user-attested; no independent video playback or watching is claimed by Codex.",
            "A research placeholder cannot become a learner question merely because the set was signed off.",
        ],
        "authorises_database_write": False,
        "authorises_rollout_activation": False,
    })
    print(json.dumps({"signed_off_writing_prompts": 36, "changed_prompts": len(changes), "conundrums_signed_off_unchanged": 63}))


if __name__ == "__main__":
    main()
