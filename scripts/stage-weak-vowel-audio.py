#!/usr/bin/env python3
"""Stage the exact reviewed British clips for a future governed weak-vowel release.

This copies immutable, hash-named public assets. It does not approve, publish or
activate lesson content. The source Sheet snapshot and dictionary export must
still match before any file is staged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from shutil import copyfile


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sheet", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--public-root", type=Path, required=True)
    args = parser.parse_args()

    rows = json.loads(args.sheet.read_text())["rows"]
    baseline = json.loads(args.baseline.read_text())
    authority = {(row["canonical_word_id"], row["micro_skill_key"]): row
                 for row in baseline["rows"]}
    if len(rows) != len(authority) or {(row["canonical_word_id"], row["micro_skill_key"])
                                      for row in rows} != set(authority):
        raise ValueError("The Sheet snapshot does not cover the full authority inventory")

    source_root = args.source_root.resolve()
    public_root = args.public_root.resolve()
    staged: dict[str, tuple[Path, str]] = {}
    manifest_rows = []
    for row in rows:
        pair = (row["canonical_word_id"], row["micro_skill_key"])
        current = authority[pair]
        if current["assignment_status"] != "assigned":
            continue
        if row["assignment_status"] != "assigned" or row["source_fingerprint"] != current["source_fingerprint"]:
            raise ValueError(f"Source changed for {pair}")
        assets = {}
        for kind, path_field, digest_field in (
            ("word", "word_audio_file", "word_audio_sha256"),
            ("sentence", "rhythm_recording_file", "rhythm_recording_sha256"),
        ):
            source = Path(row[path_field])
            source = (source if source.is_absolute() else source_root / source).resolve()
            if not source.is_relative_to(source_root) or not source.is_file():
                raise ValueError(f"Missing or untrusted {kind} clip for {pair}")
            digest = row[digest_field]
            if len(digest) != 64 or sha256(source) != digest:
                raise ValueError(f"Audio hash changed for {pair}: {kind}")
            relative = Path("audio/secret-life-of-vowels/reviewed") / kind / f"{row['canonical_word_id']}-{digest[:16]}.mp3"
            destination = public_root / relative
            url = f"/{relative.as_posix()}"
            if url in staged and staged[url][1] != digest:
                raise ValueError(f"Conflicting clip identity: {url}")
            staged[url] = (source, digest)
            assets[kind] = {"src": url, "sha256": digest}
        manifest_rows.append({"canonicalWordId": pair[0], "microSkillKey": pair[1],
                              "sourceFingerprint": row["source_fingerprint"], **assets})

    for url, (source, digest) in staged.items():
        destination = public_root / url.lstrip("/")
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if sha256(destination) != digest:
                raise ValueError(f"Existing staged clip has different content: {url}")
        else:
            copyfile(source, destination)
        if sha256(destination) != digest:
            raise ValueError(f"Staged clip failed readback: {url}")

    manifest = {"schemaVersion": "weak_vowel_audio_stage_v1",
                "sourceAuthorityFingerprint": baseline["reconciliation"]["sourceFingerprint"],
                "assignedPairCount": len(manifest_rows), "uniqueClipCount": len(staged),
                "rows": manifest_rows}
    output = public_root / "audio/secret-life-of-vowels/reviewed/manifest.json"
    output.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"assignedPairCount": len(manifest_rows), "uniqueClipCount": len(staged),
                      "manifest": str(output)}))


if __name__ == "__main__":
    main()
