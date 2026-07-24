#!/usr/bin/env python3
"""Populate child-friendly meanings without altering their human review record."""

import csv
import json
from pathlib import Path


CSV_PATH = Path(__file__).parent.parent / (
    "docs/implementation/seed-data/teaching-dictionary/candidates/"
    "2026-06-29-phase-5-source-intake/csv/base_word_family_members.csv"
)

MEANINGS = {
    "act": "to do something", "action": "something that is done", "activity": "something you do", "actor": "a person who performs in a play, film, or show", "actual": "real; not imagined", "interact": "to communicate or work with someone or something",
    "angle": "the space between two lines that meet", "triangle": "a shape with three straight sides and three corners",
    "baby": "a very young child or animal", "babies": "more than one baby", "bake": "to cook food using dry heat, usually in an oven", "baked": "cooked in an oven",
    "bed": "a piece of furniture for sleeping", "big": "large in size", "bigger": "larger in size", "biggest": "largest in size", "book": "a set of written or printed pages", "books": "more than one book",
    "brave": "able to face something frightening or difficult", "braver": "more brave", "bravest": "the most brave", "busy": "having a lot to do", "busier": "having more to do", "busiest": "having the most to do",
    "car": "a road vehicle that carries people", "cars": "more than one car", "care": "to feel concern for someone or something", "careful": "taking care to avoid mistakes or danger", "careless": "not taking enough care",
    "carry": "to hold and move something", "carried": "held and moved something", "carries": "holds and moves something", "cat": "a small pet animal with fur and whiskers", "cats": "more than one cat",
    "child": "a young person", "children": "more than one child", "city": "a large town", "cities": "more than one city", "clean": "not dirty", "cleaned": "made something clean", "copy": "to make something like another thing", "copied": "made something like another thing",
    "cry": "to have tears come from your eyes", "cried": "had tears come from your eyes", "cries": "has tears come from their eyes", "danger": "the chance that someone or something may be harmed", "dangerous": "likely to cause harm",
    "define": "to explain exactly what a word or idea means", "definition": "an explanation of what a word or idea means", "die": "to stop being alive", "dying": "coming to the end of life",
    "dog": "a pet animal that barks", "dogs": "more than one dog", "face": "the front part of a person's head", "facial": "to do with the face", "fair": "treating people equally and properly", "unfair": "not treating people equally or properly",
    "fast": "moving quickly", "faster": "moving more quickly", "fastest": "moving most quickly", "foot": "the part at the end of your leg that you stand on", "go": "to move from one place to another", "goes": "moves from one place to another",
    "govern": "to officially lead and make decisions for a country or area", "governor": "a person who officially leads a region or organisation", "government": "the people who run a country or area",
    "grab": "to take hold of something quickly", "grabbed": "took hold of something quickly", "graph": "a diagram that shows information", "graphic": "shown using pictures or diagrams", "geography": "the study of places, land, and people around the world", "photograph": "a picture made with a camera", "photography": "the art or activity of taking photographs",
    "grow": "to become bigger or develop", "grown": "become bigger or developed", "happy": "feeling pleased or glad", "happier": "feeling more pleased or glad", "happiness": "the feeling of being pleased or glad", "unhappy": "feeling sad or not pleased",
    "help": "to make something easier for someone", "helpful": "useful or willing to help", "hop": "to jump on one foot", "hopped": "jumped on one foot", "hope": "to want something good to happen", "hoped": "wanted something good to happen", "hopeful": "feeling that something good may happen", "hopeless": "with no reason to expect a good result", "hoping": "wanting something good to happen",
    "hot": "having a high temperature", "hotter": "having a higher temperature", "hottest": "having the highest temperature", "inform": "to tell someone facts or news", "information": "facts or details about something",
    "joy": "a feeling of great happiness", "enjoy": "to take pleasure in something", "enjoyable": "pleasant and fun", "enjoyment": "the pleasure you get from something",
    "jump": "to push yourself into the air", "jumped": "pushed yourself into the air", "jumping": "pushing yourself into the air", "jumps": "pushes itself into the air", "kind": "caring and helpful to others", "kindness": "the quality of being kind", "unkind": "not kind",
    "knife": "a tool with a sharp blade for cutting", "knives": "more than one knife", "large_larger_largest": "large in size", "large": "large in size", "larger": "more large in size", "largest": "most large in size", "late": "after the expected or usual time", "later": "after a particular time", "latest": "most recent",
    "laugh": "to make a happy sound because something is funny", "laughed": "made a happy sound because something was funny", "lie": "to rest flat", "lying": "resting flat", "like": "to find something pleasant", "liked": "found something pleasant", "dislike": "to not like something",
    "look": "to direct your eyes towards something", "looked": "directed your eyes towards something", "looking": "directing your eyes towards something", "magic": "special power that seems impossible or mysterious", "magician": "a person who performs magic tricks",
    "make": "to create or produce something", "made": "created or produced something", "making": "creating or producing something", "map": "a drawing that shows where places are", "mapped": "shown on a map", "nature": "plants, animals, and the natural world", "natural": "found in nature; not made by people",
    "nice": "pleasant, kind, or friendly", "nicer": "more pleasant, kind, or friendly", "nicest": "most pleasant, kind, or friendly", "one": "the number 1", "twenty_one": "the number 21", "person": "one human being", "personal": "belonging to or about one particular person",
    "photo": "a picture made with a camera", "plan": "to decide what you will do", "planned": "decided what you would do", "play": "to take part in a game or have fun", "played": "took part in a game or had fun", "player": "a person who takes part in a game", "playing": "taking part in a game or having fun", "plays": "takes part in a game or has fun", "replay": "to play something again", "replayed": "played something again",
    "port": "a place where ships load and unload", "transport": "to carry people or things from one place to another", "possible": "able to happen or be done", "impossible": "not able to happen or be done", "possibility": "something that may happen or be true",
    "quick": "happening in a short time", "quickest": "happening in the shortest time", "quickly": "at a fast speed", "read": "to look at and understand written words", "reads": "looks at and understands written words", "reading": "looking at and understanding written words", "readable": "easy enough to read", "misread": "to read something wrongly",
    "run": "to move quickly on your feet", "runner": "a person who runs", "running": "moving quickly on your feet", "runs": "moves quickly on their feet", "sad": "feeling unhappy", "sadder": "feeling more unhappy", "saddest": "feeling most unhappy", "sadly": "in a sad way", "sadness": "the feeling of being sad",
    "sign": "a notice that gives information", "signal": "an action or sign that gives a message", "signature": "a person's name written by themselves", "sit": "to rest on a chair or seat", "sitting": "resting on a chair or seat", "small_smaller_smallest": "small in size", "small": "small in size", "smaller": "less large in size", "smallest": "least large in size",
    "smile": "to make a happy expression with your face", "smiled": "made a happy expression with your face", "smiling": "making a happy expression with your face", "stop": "to no longer move or continue", "stopped": "no longer moved or continued", "stopping": "no longer moving or continuing", "story": "an account of events, real or imagined", "stories": "more than one story",
    "sun": "the star that gives Earth light and heat", "swim": "to move through water", "swimming": "moving through water", "take": "to carry or move something with you", "mistake": "something done wrongly", "tall": "having a greater than usual height", "taller": "having greater height", "tallest": "having the greatest height", "thank": "to show you are grateful", "thankful": "feeling grateful",
    "tie": "to fasten something with a knot", "tying": "fastening something with a knot", "try": "to make an effort to do something", "tried": "made an effort to do something", "tries": "makes an effort to do something", "use": "to do something with a thing for a purpose", "useful": "helpful or able to be used well", "vie": "to compete for something", "vying": "competing for something",
    "walk": "to move on your feet at a steady pace", "walked": "moved on your feet at a steady pace", "want": "to wish for something", "wanted": "wished for something", "watch": "to look at something carefully for a time", "watches": "looks at something carefully for a time", "weigh": "to find how heavy something is", "weight": "how heavy someone or something is",
    "wish": "to want something to happen", "wishes": "wants something to happen", "wolf": "a wild animal like a large dog", "wolves": "more than one wolf", "word": "a single unit of language with a meaning", "words": "more than one word", "work": "to do a job or task", "worker": "a person who does a job or task", "write": "to make letters or words", "writer": "a person who writes", "writing": "letters or words that have been written", "rewrite": "to write something again",
}

NATURAL_THEMED_MEANINGS = {
    "interact": "to act or communicate with each other",
    "unfair": "not fair; not treating people equally or properly",
    "unhappy": "not happy; feeling sad or not pleased",
    "unkind": "not kind; not caring or helpful to others",
    "replay": "to play again",
    "replayed": "played again",
    "rewrite": "to write something again",
    "misread": "to read something wrongly",
    "mistake": "something done wrongly",
    "dislike": "to not like something",
    "impossible": "not possible; not able to happen or be done",
    "triangle": "a three-sided shape",
    "transport": "to carry people or things across or from one place to another",
    "geography": "learning about the Earth, its places, and its people",
    "photograph": "a picture made using light and a camera",
    "photography": "the art of making pictures using light and a camera",
    "twenty_one": "twenty and one more: the number 21",
    "careless": "without enough care",
    "hopeless": "without hope of a good result",
    "careful": "taking care to avoid mistakes or danger",
    "helpful": "giving help or being useful",
    "hopeful": "full of hope that something good may happen",
    "thankful": "full of thanks; feeling grateful",
    "useful": "able to be used to help",
    "happiness": "the state of being happy",
    "kindness": "the quality of being kind",
    "sadness": "the state of being sad",
    "quickly": "in a quick way",
    "sadly": "in a sad way",
    "actor": "a person who acts in a play, film, or show",
    "governor": "a person who governs a region or organisation",
    "magician": "a person who performs magic tricks",
    "player": "a person who plays a game",
    "runner": "a person who runs",
    "worker": "a person who works",
    "writer": "a person who writes",
    "action": "something that is done",
    "information": "facts that tell you about something",
    "definition": "an explanation that tells what a word or idea means",
    "enjoyment": "the feeling of enjoying something",
    "government": "the people who govern a country or area",
}


def meaning_with_morpheme_theme(row: dict[str, str]) -> str:
    """Use the word's meaning to reveal the family theme, not an affix lecture."""
    word = row["word_key"].removesuffix("_en_gb")
    if word in NATURAL_THEMED_MEANINGS:
        return NATURAL_THEMED_MEANINGS[word]

    parts = json.loads(row["morphology_parts"])
    suffixes = {part["sourceText"] for part in parts if part["kind"] == "suffix"}
    meaning = MEANINGS[word]
    if "ing" in suffixes:
        return f"{meaning} right now"
    if suffixes & {"ed", "d"}:
        return f"{meaning} earlier"
    return meaning


def main() -> None:
    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        # Keep the tool repeatable: a previous interrupted run must not add a
        # second column with the same header.
        fieldnames = list(dict.fromkeys(reader.fieldnames or []))

    missing = sorted({row["word_key"].removesuffix("_en_gb") for row in rows} - MEANINGS.keys())
    if missing:
        raise SystemExit(f"Missing meanings for: {', '.join(missing)}")

    if "child_friendly_meaning" not in fieldnames:
        fieldnames.insert(fieldnames.index("word_sum"), "child_friendly_meaning")
    for row in rows:
        word = row["word_key"].removesuffix("_en_gb")
        row["child_friendly_meaning"] = meaning_with_morpheme_theme(row)

    with CSV_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    print(f"Prepared {len(rows)} child-friendly meaning drafts for review: {CSV_PATH}")


if __name__ == "__main__":
    main()
