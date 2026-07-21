import { compileBaseWordFamilyLessonSnapshot, validateBaseWordFamilyLessonSnapshot } from "../lib/adle/morphology/base-word-family-payload";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD, BASE_WORD_FAMILY_PREVIEW_READ_MODEL } from "../lib/adle/morphology/base-word-family-preview-fixture";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function word(id: string) { return { canonicalWordId: id, displayWord: id, wordSum: id, parts: [{ id: `${id}:base`, kind: "base", sourceText: id, surfaceText: id }], joins: [], transformations: [], transformationNotes: "reviewed", childFriendlyMeaning: "a reviewed meaning", dictationSentence: `Please spell ${id}.`, dictationTargetTokenIndex: 2, audioText: `Please spell ${id}.` }; }
const valid = BASE_WORD_FAMILY_PREVIEW_PAYLOAD;
assert(validateBaseWordFamilyLessonSnapshot(valid) !== null, "two-family snapshot with eight-or-fewer guided words and six independent words must validate");
assert(validateBaseWordFamilyLessonSnapshot({ ...valid, independentWords: valid.independentWords.map(({ transformations: _transformations, ...entry }) => entry) }) !== null, "legacy six-word snapshots without transformation metadata remain renderable");
assert(compileBaseWordFamilyLessonSnapshot(BASE_WORD_FAMILY_PREVIEW_READ_MODEL).contentVersion === valid.contentVersion, "the reviewed read model compiles deterministically to the immutable preview snapshot");
assert(validateBaseWordFamilyLessonSnapshot({ ...valid, independentWords: valid.independentWords.slice(0, 5) }) === null, "independent practice must remain exactly six words");
assert(validateBaseWordFamilyLessonSnapshot({ ...valid, independentWords: [...valid.independentWords.slice(0, 5), word("graph")] }) === null, "a third-family word cannot fill independent production");
assert(validateBaseWordFamilyLessonSnapshot({ ...valid, familySections: [{ ...valid.familySections[0], guidedWords: Array.from({ length: 9 }, (_, index) => word(`x${index}`)) }] }) === null, "guided display must cap at eight words and retain authentic targets");
assert(validateBaseWordFamilyLessonSnapshot({ ...valid, independentWords: valid.independentWords.map((entry, index) => index === 0 ? { ...entry, parts: [] } : entry) }) === null, "malformed morphology parts fail closed");
assert(validateBaseWordFamilyLessonSnapshot({ ...valid, independentWords: valid.independentWords.map((entry, index) => index === 0 ? { ...entry, dictationTargetTokenIndex: 0 } : entry) }) === null, "a wrong dictation target token index fails closed");
assert(validateBaseWordFamilyLessonSnapshot({ ...valid, activities: valid.activities.map((activity) => activity.type === "controlled_spelling" ? { ...activity, answerVisibility: "teaching" } : activity) }) === null, "recall activities must never expose answers before an independent attempt");
console.log("adle-base-word-family-snapshot-regression: ok");
