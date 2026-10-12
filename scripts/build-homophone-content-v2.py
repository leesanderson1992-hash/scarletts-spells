"""Build the inactive second homophone candidate from the frozen v1 candidate.

Every dictation story below is authored, two sentences long, and has exactly
two marked target words. Markers become ordered gaps; the full audio sentence
is reconstructed from the same segments and answers at runtime.
"""

import argparse
import hashlib
import json
import re
from pathlib import Path

STORIES = {
    "PEACE_PIECE": [
        "Lena saved a {{piece}} of cake for Jo. They ate it together in {{peace}}.",
        "The class made {{peace}} after their quarrel. Each pupil drew a {{piece}} of the mural.",
        "Dad gave me one {{piece}} of pie. We enjoyed a quiet moment of {{peace}}.",
    ],
    "FLOWER_FLOUR": [
        "Nan tipped {{flour}} into the bowl. A yellow {{flower}} stood beside her window.",
        "The bee landed on a {{flower}} outside. Inside, Mum sifted {{flour}} for bread.",
        "I drew a {{flower}} on the recipe card. Then I measured the {{flour}}.",
    ],
    "SEE_SEA": [
        "From the cliff, I could {{see}} a boat. It crossed the blue {{sea}}.",
        "The {{sea}} was calm at dawn. I could {{see}} fish beneath the pier.",
        "Can you {{see}} the lighthouse? It stands beside the {{sea}}.",
    ],
    "HERD_HEARD": [
        "We {{heard}} a low moo from the field. A {{herd}} of cows stood by the gate.",
        "The {{herd}} moved slowly across the path. I {{heard}} their bells ring.",
        "I {{heard}} hooves behind the hill. Soon a {{herd}} of deer appeared.",
    ],
    "THREW_THROUGH": [
        "A ball rolled {{through}} the open gate. Sam {{threw}} it back.",
        "I {{threw}} a soft toy to the puppy. It carried the toy {{through}} the tunnel.",
        "The wind blew {{through}} the trees. Maya {{threw}} her hat into the air.",
    ],
    "RIGHT_WRITE": [
        "Please {{write}} your name on the card. Put it in the {{right}} box.",
        "At the junction, we turned {{right}}. I stopped to {{write}} the street name.",
        "Omar knew the {{right}} answer. He began to {{write}} it down.",
    ],
    "YOUR_YOURE": [
        "I think {{you're}} ready for the walk. Please bring {{your}} coat.",
        "Is this {{your}} bag? I hope {{you're}} coming with us.",
        "Dad says {{you're}} next in the game. Put {{your}} counter on the board.",
    ],
    "WERE_WERE": [
        "Yesterday we {{were}} late for the train. Today {{we're}} early.",
        "I know {{we're}} ready now. Last week we {{were}} still practising.",
        "The gates {{were}} closed this morning. Now {{we're}} waiting outside.",
    ],
    "ITS_ITS": [
        "The dog wagged {{its}} tail. I think {{it's}} happy.",
        "I can see {{it's}} getting dark. The bird has flown to {{its}} nest.",
        "The robot raised {{its}} arm. Now {{it's}} waving at us.",
    ],
    "WHOS_WHOSE": [
        "Do you know {{whose}} coat this is? I wonder {{who's}} coming back for it.",
        "I wondered {{who's}} at the door. Mum asked {{whose}} bicycle stood outside.",
        "Can you tell me {{whose}} book this is? I need to know {{who's}} reading it.",
    ],
    "FOR_FOUR_OF_OFF": [
        "Mia packed {{four}} buns in a bag. She saved them {{for}} the picnic.",
        "We turned {{off}} the oven. A tray {{of}} biscuits cooled nearby.",
        "Dad carried a box {{of}} cups. I put {{four}} on the table.",
    ],
    "THERE_THEIR_THEYRE": [
        "The children left {{their}} bags by the door. They sat over {{there}}.",
        "I think {{they're}} ready to start. They picked up {{their}} books.",
        "Look over {{there}} by the tree. I think {{they're}} playing.",
    ],
    "TO_TOO_TWO": [
        "Our teacher chose {{two}} pupils for the library visit. Their friend came {{too}}.",
        "I want {{to}} borrow a book. My brother wants one {{too}}.",
        "We carried {{two}} books home. I gave one {{to}} Dad.",
    ],
    "WERE_WHERE_WEAR": [
        "Can you tell me {{where}} my boots are? I need to {{wear}} them outside.",
        "The children {{were}} ready for the rain. They chose to {{wear}} boots.",
        "Do you remember {{where}} we waited? We {{were}} beside the gate.",
    ],
}

INTRO = {
    "title": "Why are some words so confusing?",
    "paragraphs": [
        "Homophones sound exactly the same but have different spellings and meanings.",
        "Near homophones sound almost the same, with a tiny difference in sound. Their spellings and meanings are different too.",
        "Confusables may not sound alike, but people often mix them up in writing.",
    ],
}

CATEGORY_COPY = {
    "homophone": "These words are homophones.",
    "confusable": "These words are confusables.",
    "near_homophone_and_confusable": "This set includes near homophones and confusables.",
}

MARKER = re.compile(r"\{\{([a-z]+(?:'[a-z]+)?)\}\}")
WRITTEN_CLUE_HIGHLIGHTS = {"you're": (3, 3), "we're": (2, 3), "it's": (2, 2), "who's": (3, 2), "of": (1, 1), "they're": (4, 3)}

def convert_story(story, words, index):
    matches = list(MARKER.finditer(story))
    assert len(matches) == 2, story
    targets = [match.group(1) for match in matches]
    assert len(set(targets)) == 2 and all(target in words for target in targets), story
    segments = [story[:matches[0].start()], story[matches[0].end():matches[1].start()], story[matches[1].end():]]
    assert len(re.findall(r"[.!?](?:\s|$)", story)) == 2, story
    return {"id": f"passage-{index + 1}", "segments": segments, "targets": targets}

def make_v2(source):
    assert source["contentVersion"] == "d4-hom-v1" and len(source["lessons"]) == 14
    lessons = json.loads(json.dumps(source["lessons"]))
    for lesson in lessons:
        key = lesson["microSkillKey"]
        matching = [suffix for suffix in STORIES if key.endswith(suffix)]
        assert len(matching) == 1, key
        words = [entry["word"] for entry in lesson["words"]]
        for entry in lesson["words"]:
            if entry["highlightStart"] is None:
                entry["highlightStart"], entry["highlightLength"] = WRITTEN_CLUE_HIGHLIGHTS[entry["word"]]
        passages = [convert_story(story, words, index) for index, story in enumerate(STORIES[matching[0]])]
        assert set(words) <= {word for passage in passages for word in passage["targets"]}, key
        assert len({tuple(passage["targets"]) for passage in passages}) >= 2, key
        lesson["dictationPassages"] = passages
        lesson["teachingIntro"] = {
            **INTRO,
            "focus": f"Today, we are focusing on {', '.join(words[:-1])}{' and ' if len(words) > 1 else ''}{words[-1]}.",
            "category": CATEGORY_COPY[lesson["contrastKind"]],
        }
    content_hash = hashlib.sha256(json.dumps(lessons, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    return {
        "schemaVersion": 2,
        "contentVersion": "d4-hom-v2",
        "reviewStatus": "candidate_structurally_validated",
        "runtimeEnabled": False,
        "sourceSha256": source["sourceSha256"],
        "sourceContentSha256": source["contentSha256"],
        "contentSha256": content_hash,
        "lessons": lessons,
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("candidate_v1", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(make_v2(json.loads(args.candidate_v1.read_text())), ensure_ascii=False, indent=2) + "\n")
