"""Version the inactive homophone candidate with Cover Check for every word."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREVIOUS = ROOT / "data/adle/candidates/d4-hom/v3/lessons.json"
OUTPUT = ROOT / "data/adle/candidates/d4-hom/v4/lessons.json"


def build():
    previous = json.loads(PREVIOUS.read_text())
    assert previous["contentVersion"] == "d4-hom-v3"
    assert len(previous["lessons"]) == 14
    lessons = previous["lessons"]
    for lesson in lessons:
        lesson["coverCheck"] = [word["word"] for word in lesson["words"]]
    content_hash = hashlib.sha256(
        json.dumps(lessons, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()
    return {
        **{key: value for key, value in previous.items() if key != "lessons"},
        "schemaVersion": 4,
        "contentVersion": "d4-hom-v4",
        "reviewStatus": "approved_balloon_prompts_full_cover_check_candidate_inactive",
        "runtimeEnabled": False,
        "previousContentSha256": previous["contentSha256"],
        "contentSha256": content_hash,
        "lessons": lessons,
    }


if __name__ == "__main__":
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n")
