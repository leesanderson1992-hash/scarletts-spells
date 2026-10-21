#!/usr/bin/env python3
"""Compile reviewable weak-vowel route facts from the approved Sheet snapshot.

This produces import candidates only. The target's sound class is read from
the selected IPA syllable and remains an explicitly labelled IPA-derived
candidate until governed route-content review and publication.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path

audit_path = Path(__file__).with_name("audit-weak-vowel-release.py")
audit_spec = importlib.util.spec_from_file_location("weak_vowel_release_audit", audit_path)
if audit_spec is None or audit_spec.loader is None:
    raise RuntimeError("Weak-vowel release audit could not be loaded")
audit_module = importlib.util.module_from_spec(audit_spec)
audit_spec.loader.exec_module(audit_module)
audit = audit_module.audit
cuts_for = audit_module.cuts_for


SHEET_URL = "https://docs.google.com/spreadsheets/d/1hFAJDCExNdlcLGC_xpxTfHCenm6DOU13hC7NOIOuUnQ/edit?gid=335559651"


def target_sound_from_ipa(row: dict) -> tuple[str, str]:
    ipa = row["pronunciation_candidate"].strip().strip("/")
    syllables = ipa.split(".")
    position = int(row["dinner_target_syllable_1based"]) - 1
    if len(syllables) == int(row["dinner_spoken_syllable_count"]):
        sound = syllables[position]
    elif row["word"] == "business" and ipa == "ˈbɪznəs" and position == 1:
        # The owner explicitly chose /ˈbɪznəs/; the undotted IPA still has
        # a final /əs/ containing the reviewed target's reduced vowel.
        sound = "nəs"
    else:
        raise ValueError("IPA_SYLLABLE_ALIGNMENT_NEEDS_REVIEW")
    if "ə" in sound and "ɪ" not in sound:
        return "schwa", sound
    if "ɪ" in sound and "ə" not in sound:
        return "other_unstressed", sound
    raise ValueError("TARGET_SOUND_NOT_UNAMBIGUOUS_IN_IPA")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sheet", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--audio-root", type=Path, required=True)
    parser.add_argument("--audio-manifest", type=Path, required=True)
    parser.add_argument("--definitions", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    report = audit(args.sheet, args.baseline, args.audio_root)
    if report["editorialBlockedCount"]:
        raise ValueError(f"{report['editorialBlockedCount']} assigned Sheet rows need repair")
    source = json.loads(args.sheet.read_text())
    baseline = json.loads(args.baseline.read_text())
    manifest = json.loads(args.audio_manifest.read_text())
    definitions_source = json.loads(args.definitions.read_text())
    definitions = {row["canonicalWordId"]: row for row in definitions_source["rows"]}
    if manifest["sourceAuthorityFingerprint"] != baseline["reconciliation"]["sourceFingerprint"]:
        raise ValueError("Staged audio belongs to a different authority export")
    clips = {(row["canonicalWordId"], row["microSkillKey"]): row for row in manifest["rows"]}
    rows = []
    for row in source["rows"]:
        if row["assignment_status"] != "assigned":
            continue
        pair = (row["canonical_word_id"], row["micro_skill_key"])
        staged = clips.get(pair)
        definition = definitions.get(pair[0])
        if not definition or not definition["definition"].strip():
            raise ValueError(f"Published shared definition is missing: {pair}")
        if not staged or staged["sourceFingerprint"] != row["source_fingerprint"] or \
            staged["word"]["sha256"] != row["word_audio_sha256"] or \
            staged["sentence"]["sha256"] != row["rhythm_recording_sha256"]:
            raise ValueError(f"Staged audio does not match reviewed content: {pair}")
        span = re.fullmatch(r"(.+?)\s+\[(\d+),(\d+)\)", row["target_span_to_review"])
        if not span:
            raise ValueError(f"Target span is not parseable: {pair}")
        start, end = int(span[2]), int(span[3])
        sound_type, sound_ipa = target_sound_from_ipa(row)
        variants = [part.strip() for part in re.split(r"[;\n]+", row["dinner_accepted_cut_variants_review"].strip() or
                    row["dinner_written_breakdown_candidate"].strip()) if part.strip()]
        cuts = [cuts_for(part, row["word"]) for part in variants]
        vowel_start = int(row["vowel_index_0based_candidate"])
        sentence = row["rhythm_sentence_text"]
        occurrences = list(re.finditer(rf"(?<!\w){re.escape(row['word'])}(?!\w)", sentence, flags=re.I))
        if len(occurrences) != 1:
            raise ValueError(f"Dictation sentence must bind exactly one target: {pair}")
        family_approved = row["detective_decision"] == "Approve"
        family_id = row["verified_base_family_authority_id"].strip() or None
        family_state = "ready" if family_approved and family_id else "blocked" if family_approved else "not_applicable"
        family_reason = "Approved family authority is missing" if family_state == "blocked" else None
        pronunciation_id = "gb-word-" + hashlib.sha256(
            f"{pair[0]}|{staged['word']['sha256']}".encode()).hexdigest()[:20]
        facts = {
            "schemaVersion": "weak_vowel_route_facts_v1",
            "sourceFingerprint": row["source_fingerprint"],
            "activityEligibility": {
                **{key: {"status": "ready", "reason": None} for key in
                   ("dinner", "detective", "memoryLock", "dictation")},
                "family": {"status": family_state, "reason": family_reason},
            },
            "wordSense": row["word_sense_to_review"].strip() or None,
            "pronunciationId": pronunciation_id,
            "wordRecording": staged["word"],
            "spokenSyllableCount": int(row["dinner_spoken_syllable_count"]),
            "acceptedCutSets": cuts,
            "target": {"text": span[1], "start": start, "end": end,
                       "syllableIndex": int(row["dinner_target_syllable_1based"]),
                       "soundType": sound_type},
            "selectionTarget": {"text": row["vowel_tile_candidate"].lower(),
                                "start": vowel_start, "end": vowel_start + 1},
            "detectiveVowelIndex": vowel_start,
            "familyDecision": "approve" if family_approved else "skip",
            "familyAuthorityId": family_id,
            "sentenceRecording": staged["sentence"],
            "sentenceTarget": {"start": occurrences[0].start(), "end": occurrences[0].end()},
            "reviewSourceReference": SHEET_URL,
        }
        rows.append({"canonicalWordId": pair[0], "spelling": row["word"], "microSkillKey": pair[1],
                     "sourceFingerprint": row["source_fingerprint"], "reviewStatus": "candidate",
                     "sharedDefinition": definition,
                     "soundTypeEvidence": {"kind": "selected_ipa_target_syllable", "ipa": row["pronunciation_candidate"],
                                           "targetSyllableIpa": sound_ipa, "needsGovernedPublication": True},
                     "routeContent": {"routeId": "weak_vowel_word_lab", "routeVersion": "v1",
                                      "microSkillKey": pair[1], "wordMeaning": definition["definition"],
                                      "wordSum": "", "content": {"weakVowel": facts}}})
    if len(rows) != report["assignedCount"]:
        raise ValueError("Candidate package does not cover every assigned pair")
    package = {"schemaVersion": "weak_vowel_route_candidates_v1", "reviewStatus": "candidate",
               "sourceAuthorityFingerprint": baseline["reconciliation"]["sourceFingerprint"],
               "sheetSha256": hashlib.sha256(args.sheet.read_bytes()).hexdigest(),
               "audioManifestSha256": hashlib.sha256(args.audio_manifest.read_bytes()).hexdigest(),
               "sharedDefinitionsSha256": hashlib.sha256(args.definitions.read_bytes()).hexdigest(),
               "assignedPairCount": len(rows), "rows": rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(package, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"assignedPairCount": len(rows), "soundTypes": {
        "schwa": sum(row["routeContent"]["content"]["weakVowel"]["target"]["soundType"] == "schwa" for row in rows),
        "otherUnstressed": sum(row["routeContent"]["content"]["weakVowel"]["target"]["soundType"] == "other_unstressed" for row in rows)},
        "output": str(args.output)}))


if __name__ == "__main__":
    main()
