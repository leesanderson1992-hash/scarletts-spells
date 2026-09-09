import { fingerprint } from "../baseline/source";

export const CONTEXT_V3_LEXICON_VERSION =
  "WHOLE_WRITING_CONTEXT_GRAMMATICAL_LEXICON_V3" as const;

// This is bounded parser support. It is not canonical-word, curriculum, or
// causal-mapping authority.
const rows = Object.freeze({
  determiners: ["a", "an", "another", "each", "every", "some", "the", "this", "that", "these", "those", "my", "our", "his", "her", "your", "their", "its"],
  pronouns: ["i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them"],
  copulas: ["am", "is", "are", "was", "were", "be", "been", "being", "seem", "seems", "seemed", "look", "looks", "looked", "feel", "feels", "felt", "become", "becomes", "became"],
  auxiliaries: ["am", "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "do", "does", "did", "can", "could", "may", "might", "must", "shall", "should", "will", "would"],
  finiteVerbs: [
    "added", "appeared", "arrived", "became", "began", "believe", "believes", "brought", "changed", "changes", "checked", "copied", "counted", "decided", "explained", "felt", "found", "gave", "go", "goes", "had", "has", "have", "heard", "helped", "kept", "know", "knows", "landed", "left", "look", "looked", "looks", "made", "mentioned", "need", "needed", "needs", "opened", "placed", "put", "read", "returned", "said", "saw", "seem", "seemed", "seems", "sounded", "stayed", "stopped", "take", "takes", "think", "thinks", "thought", "tried", "turned", "unlocked", "waited", "walk", "walked", "walks", "want", "wanted", "wants", "was", "were", "went", "wrote"
  ],
  baseVerbs: [
    "be", "bring", "check", "come", "copy", "count", "do", "eat", "explain", "fast", "feel", "find", "finish", "get", "give", "go", "have", "hear", "help", "keep", "know", "learn", "leave", "look", "make", "open", "play", "put", "read", "run", "say", "see", "sing", "sit", "stop", "take", "think", "travel", "try", "wait", "walk", "want", "write"
  ],
  presentParticiples: [
    "being", "bringing", "coming", "copying", "eating", "getting", "going", "helping", "leaving", "looking", "playing", "reading", "running", "singing", "sitting", "taking", "trying", "waiting", "walking", "writing"
  ],
  pastParticiples: ["been", "broken", "copied", "finished", "given", "gone", "hidden", "known", "left", "made", "opened", "supposed", "taken", "tired", "written"],
  adjectives: [
    "awake", "big", "brilliant", "careful", "cold", "curious", "delighted", "enormous", "excited", "fast", "fine", "fragile", "friendly", "fun", "good", "happy", "heavy", "kind", "late", "nervous", "open", "patient", "quiet", "ready", "right", "sad", "silent", "small", "tired", "useful", "warm", "wet", "wrong"
  ],
  adverbs: ["already", "also", "carefully", "fast", "here", "home", "quietly", "slowly", "there", "together", "too", "very"],
  prepositions: ["about", "after", "at", "before", "behind", "below", "beside", "by", "down", "for", "from", "in", "into", "near", "of", "on", "over", "through", "to", "under", "up", "with", "without"],
  subordinators: ["although", "because", "if", "when", "while"],
  coordinators: ["and", "but", "or", "so", "yet"],
  reportingVerbs: ["believe", "believes", "hear", "heard", "know", "knows", "said", "say", "says", "think", "thinks", "thought"],
  movementVerbs: ["come", "came", "go", "goes", "going", "run", "running", "ran", "travel", "travelled", "walk", "walked", "walking", "went"],
  placementVerbs: ["bring", "brought", "keep", "kept", "leave", "left", "place", "placed", "put", "take", "took"],
  possessionVerbs: ["get", "got", "had", "has", "have", "need", "needed", "needs", "own", "owned", "owns", "want", "wanted", "wants"],
  nouns: [
    "answer", "arrow", "bag", "ball", "bicycle", "blanket", "book", "boat", "card", "cat", "class", "clipboard", "coat", "coach", "copy", "dog", "door", "drink", "family", "fox", "friend", "garden", "gate", "group", "hall", "hamster", "harbour", "helmet", "house", "idea", "journey", "label", "lantern", "library", "light", "lunch", "machine", "meaning", "morning", "museum", "name", "notebook", "owner", "page", "park", "path", "pencil", "picture", "plan", "project", "puppy", "response", "rucksack", "sandwich", "school", "sentence", "shell", "shelf", "station", "table", "tail", "task", "teacher", "team", "ticket", "toy", "turn", "visit", "water", "way", "window", "word", "work", "yard"
  ],
  timeAndMeasureNouns: ["day", "days", "hour", "hours", "metre", "metres", "mile", "miles", "minute", "minutes", "week", "weeks"],
  degreeAdjectivesAndAdverbs: ["big", "carefully", "cold", "fast", "heavy", "late", "loud", "loudly", "quick", "quickly", "slow", "slowly", "small", "warm"],
  epistemicSignals: ["could", "label", "may", "might", "picture", "possibly", "perhaps", "unclear", "unknown", "unseen"],
});

export const CONTEXT_V3_LEXICON_FINGERPRINT = fingerprint(rows);

function set(values: readonly string[]) {
  return new Set(values);
}

export const CONTEXT_V3_LEXICON = Object.freeze({
  ...rows,
  determinerSet: set(rows.determiners),
  pronounSet: set(rows.pronouns),
  copulaSet: set(rows.copulas),
  auxiliarySet: set(rows.auxiliaries),
  finiteVerbSet: set(rows.finiteVerbs),
  baseVerbSet: set(rows.baseVerbs),
  presentParticipleSet: set(rows.presentParticiples),
  pastParticipleSet: set(rows.pastParticiples),
  adjectiveSet: set(rows.adjectives),
  adverbSet: set(rows.adverbs),
  prepositionSet: set(rows.prepositions),
  subordinatorSet: set(rows.subordinators),
  coordinatorSet: set(rows.coordinators),
  reportingVerbSet: set(rows.reportingVerbs),
  movementVerbSet: set(rows.movementVerbs),
  placementVerbSet: set(rows.placementVerbs),
  possessionVerbSet: set(rows.possessionVerbs),
  nounSet: set(rows.nouns),
  timeAndMeasureNounSet: set(rows.timeAndMeasureNouns),
  degreeSet: set(rows.degreeAdjectivesAndAdverbs),
  epistemicSignalSet: set(rows.epistemicSignals),
});

export function isLikelyPluralNoun(word: string) {
  return word.length > 2 && word.endsWith("s") && !word.endsWith("ss") &&
    !CONTEXT_V3_LEXICON.adjectiveSet.has(word) &&
    !CONTEXT_V3_LEXICON.adverbSet.has(word) &&
    !CONTEXT_V3_LEXICON.finiteVerbSet.has(word) &&
    !CONTEXT_V3_LEXICON.prepositionSet.has(word);
}

export function isLikelyNoun(word: string) {
  return CONTEXT_V3_LEXICON.nounSet.has(word) ||
    CONTEXT_V3_LEXICON.timeAndMeasureNounSet.has(word) || isLikelyPluralNoun(word);
}
