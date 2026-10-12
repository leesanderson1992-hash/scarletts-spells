"""Build the versioned D4_HOM lesson candidate from the owner's workbook.

This is an authoring tool, not a runtime workbook reader. Workbook prose is
treated as source data; the explicit lesson decisions below own the output.
"""

import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

REPLACEMENT_PASSAGES = {
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR_OF_OFF": "Mia made four bags of biscuits for the sale. She turned off the oven when they were ready.",
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE": "The pupils put their notebooks over there. They're ready for the lesson.",
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO": "Two children went to the library. Their friend came too.",
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_WERE_WHERE_WEAR": "Where were your shoes this morning? Please wear them outside.",
}

FEEDBACK_REASONS = {
    "piece": "PIE is hiding in PIECE, like a slice of pie",
    "peace": "its A can remind us to agree and stop fighting",
    "flower": "its OW is also in COW, who can smell a flower",
    "flour": "OUR is hiding inside FLOUR for our baking",
    "see": "its two E letters can remind us of two eyes",
    "sea": "its A can look like a boat's sail",
    "herd": "a herd is a group of animals and has no EAR",
    "heard": "EAR is hiding inside HEARD",
    "threw": "it ends in EW, like FLEW",
    "through": "its OUGH letters make a long tunnel to travel through",
    "right": "it shares IGHT with LIGHT, which can show the right way",
    "write": "it starts with WR, like the wrist that moves a pencil",
    "your": "it tells us something belongs to you",
    "you're": "it means YOU ARE, with an apostrophe for the missing A",
    "we're": "it means WE ARE, with an apostrophe for the missing A",
    "were": "it describes something in the past and has no apostrophe",
    "its": "it shows something belongs to it, without an apostrophe",
    "it's": "it can mean IT IS or IT HAS",
    "who's": "it can mean WHO IS or WHO HAS",
    "whose": "it asks who something belongs to",
    "for": "it can tell us a purpose or who receives something",
    "four": "it means the number 4 and has an extra U",
    "of": "it links words together and has only one F",
    "off": "it has two Fs, like two feet jumping off a step",
    "there": "HERE is hiding inside it, and it can point to a place",
    "their": "it shows belonging, like an HEIR inheriting something",
    "they're": "it means THEY ARE",
    "to": "it points towards an action or place and has one O",
    "too": "its extra O can mean an extra amount or also",
    "two": "it means 2, and its W looks like two V shapes",
    "where": "HERE is hiding inside it, and it asks about a place",
    "wear": "EAR is hiding inside it, like ears wearing earmuffs",
}

NEAR_OR_CONFUSABLE = {
    "D4_HOM_CONTRACTION_POSSESSIVE_WERE_WERE": "confusable",
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR_OF_OFF": "near_homophone_and_confusable",
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_WERE_WHERE_WEAR": "near_homophone_and_confusable",
}

HIGHLIGHT = {
    "piece": "pie", "peace": "a", "flower": "ow", "flour": "our",
    "see": "ee", "sea": "a", "herd": "herd", "heard": "ear",
    "threw": "ew", "through": "ough", "right": "ight", "write": "wr",
    "your": "our", "were": "were", "its": "its", "whose": "whose",
    "for": "for", "four": "u", "off": "ff", "there": "here",
    "their": "heir", "to": "o", "too": "o", "two": "w",
    "where": "here", "wear": "ear",
}

def read_sheet(book, number, strings):
    root = ET.fromstring(book.read(f"xl/worksheets/sheet{number}.xml"))
    rows = []
    for row in root.findall(".//m:sheetData/m:row", NS):
        result = {}
        for cell in row.findall("m:c", NS):
            letter = re.match(r"[A-Z]+", cell.attrib["r"]).group()
            if cell.attrib.get("t") == "s":
                value = strings[int(cell.findtext("m:v", default="0", namespaces=NS))]
            elif cell.attrib.get("t") == "inlineStr":
                inline = cell.find("m:is", NS)
                value = "".join(inline.itertext()) if inline is not None else ""
            else:
                value = cell.findtext("m:v", default="", namespaces=NS)
            result[letter] = value
        rows.append(result)
    return rows

def has_word(passage, word):
    return re.search(r"(?<![A-Za-z])" + re.escape(word) + r"(?![A-Za-z])", passage, re.I) is not None

def make_content(path):
    raw = path.read_bytes()
    with zipfile.ZipFile(path) as book:
        strings = []
        if "xl/sharedStrings.xml" in book.namelist():
            strings = ["".join(node.itertext()) for node in ET.fromstring(book.read("xl/sharedStrings.xml"))]
        cue_rows = read_sheet(book, 2, strings)[1:]
        sentence_rows = read_sheet(book, 3, strings)[1:]
    cues = defaultdict(dict)
    for row in cue_rows:
        key = row.get("A", "")
        if not key.startswith("D4_HOM_"):
            continue
        word = row["B"].lower()
        cues[key][word] = {
            "word": word,
            "memoryCue": row["C"],
            "feedbackReason": FEEDBACK_REASONS[word],
            "imageRequired": row["D"] == "Yes",
            "imageBrief": row.get("E", ""),
            "imageSrc": ("/adle/homophones/v1/" + ("were-past" if key.endswith("CONTRACTION_POSSESSIVE_WERE_WERE") and word == "were" else "were-where-wear" if key.endswith("WERE_WHERE_WEAR") and word == "were" else word.replace("'", "-")) + ".jpg") if row["D"] == "Yes" else None,
            "highlightStart": word.rfind(HIGHLIGHT[word]) if row["D"] == "Yes" else None,
            "highlightLength": len(HIGHLIGHT[word]) if row["D"] == "Yes" else None,
        }
    grouped = defaultdict(list)
    for row in sentence_rows:
        grouped[row["A"]].append(row)
    lessons = []
    for key, rows in grouped.items():
        rows.sort(key=lambda row: int(row["C"]))
        choices = [choice.strip().lower() for choice in rows[0]["H"].split(" | ")]
        assert len(set(choices)) == len(choices) and set(choices) == set(cues[key]), key
        bins = rows[:3]
        counts = Counter(row["E"].lower() for row in bins)
        target = min(choices, key=lambda word: (counts[word], choices.index(word)))
        fourth = next(row for row in rows[3:8] if row["E"].lower() == target and row.get("G", "").count("____") == 1)
        bins = [*bins, fourth]
        balloon_rows = [row for row in rows if row["D"] == "Balloon Pop"]
        balloons = [{"sentence": row["G"], "answer": row["E"].lower()} for row in balloon_rows]
        if key.endswith("FOR_FOUR_OF_OFF"):
            balloons.append({"sentence": "A cup ____ tea.", "answer": "of"})
        cover = [row["E"].lower() for row in rows if row["D"] == "Cover Check"]
        passage = REPLACEMENT_PASSAGES.get(key, rows[-1]["K"])
        assert len(bins) == 4 and len(cover) == 2 and all(has_word(passage, word) for word in choices), key
        lessons.append({
            "microSkillKey": key,
            "title": rows[0]["B"],
            "contrastKind": NEAR_OR_CONFUSABLE.get(key, "homophone"),
            "words": [cues[key][word] for word in choices],
            "binSort": [{"sentence": row["G"], "answer": row["E"].lower()} for row in bins],
            "balloonPrompts": balloons,
            "coverCheck": cover,
            "dictationPassages": [{"text": passage, "targetWords": choices}],
        })
    assert len(lessons) == 14
    content_hash = hashlib.sha256(json.dumps(lessons, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    return {"schemaVersion": 1, "contentVersion": "d4-hom-v1", "reviewStatus": "candidate_structurally_validated", "runtimeEnabled": False, "sourceSha256": hashlib.sha256(raw).hexdigest(), "contentSha256": content_hash, "lessons": lessons}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(make_content(args.workbook), ensure_ascii=False, indent=2) + "\n")
