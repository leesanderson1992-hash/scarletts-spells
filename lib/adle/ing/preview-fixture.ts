import type { LearningItemFact } from "../learning-items";
import { compileIngLesson, selectIngWords } from "./lesson";
import { ING_MICRO_SKILLS, type IngDictionaryWordV1, type IngMicroSkill } from "./contracts";

type Seed = readonly [base: string, word: string, meaning: string, sentence: string];
const SEEDS: Record<IngMicroSkill, readonly Seed[]> = {
  D4_INF_ING_ENDINGS_REGULAR: [
    ["jump", "jumping", "moving off the ground", "I am jumping over a puddle."], ["play", "playing", "taking part in a game", "They are playing in the garden."], ["read", "reading", "looking at words to understand them", "She is reading a book."], ["look", "looking", "using your eyes to see", "He is looking at the bird."], ["walk", "walking", "moving on foot", "We are walking to school."], ["help", "helping", "making a job easier for someone", "Mia is helping her friend."], ["paint", "painting", "putting colour on a surface", "They are painting a picture."],
  ],
  D4_INF_ING_ENDINGS_DROP_E: [
    ["make", "making", "creating something", "I am making a card."], ["write", "writing", "putting words on a page", "She is writing a story."], ["dance", "dancing", "moving to music", "They are dancing together."], ["ride", "riding", "travelling on a bike or animal", "He is riding his bike."], ["bake", "baking", "cooking in an oven", "We are baking bread."], ["smile", "smiling", "showing happiness with your face", "Mia is smiling at her friend."], ["close", "closing", "shutting something", "He is closing the door."],
  ],
  D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT: [
    ["run", "running", "moving quickly on foot", "I am running in the park."], ["sit", "sitting", "resting on a seat", "She is sitting on the chair."], ["hop", "hopping", "jumping on one foot", "The rabbit is hopping away."], ["swim", "swimming", "moving through water", "They are swimming in the pool."], ["stop", "stopping", "coming to a halt", "The bus is stopping here."], ["clap", "clapping", "hitting your hands together", "We are clapping for the singer."], ["slip", "slipping", "losing your footing", "He is slipping on the wet path."],
  ],
  D4_INF_ING_ENDINGS_IE_TO_Y: [
    ["lie", "lying", "resting flat", "The dog is lying on the rug."], ["tie", "tying", "fastening with a knot", "She is tying her shoes."], ["die", "dying", "coming to the end of life", "The old flower is dying."], ["vie", "vying", "competing for something", "The teams are vying for first place."], ["untie", "untying", "undoing a knot", "He is untying the rope."], ["retie", "retying", "tying again", "I am retying my laces."], ["belie", "belying", "giving a false impression", "His calm face is belying his worry."],
  ],
};

/** Synthetic examples are never valid production dictionary authority. */
export function ingPreviewPool(skill: IngMicroSkill): IngDictionaryWordV1[] {
  return SEEDS[skill].map(([base, word, meaning, sentence]) => ({ canonicalWordId: `fixture:${skill}:${word}`, microSkillKey: skill, base, word, meaning,
    dictationSentence: sentence, audioText: sentence, ...(skill === "D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT" ? { doublingPattern: "short_cvc" as const } : {}), rowStatus: "draft", reviewStatus: "in_review", reviewerRef: null, approvalRef: null, sourceRefs: ["synthetic_development_preview"] }));
}

export function ingPreviewFixture(skill: IngMicroSkill = ING_MICRO_SKILLS[0], targetCount = 1, assignmentKey = `fixture:${skill}:${targetCount}`) {
  const pool = ingPreviewPool(skill);
  const items: LearningItemFact[] = pool.slice(0, targetCount).map((word, index) => ({ learningItemId: `fixture:item:${index}`, childId: "fixture:child", canonicalWordId: word.canonicalWordId,
    microSkillKey: skill, itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: "fixture:synthetic", sourceAttemptText: null,
    reteachPriority: false, ejectedOn: null, intakeOn: `2026-09-${String(10 + index).padStart(2, "0")}`, rowStatus: "active" }));
  const selection = selectIngWords("fixture:child", skill, pool, items, true);
  if (!selection.ok) throw new Error(selection.blockers.join(","));
  return compileIngLesson(selection, assignmentKey, "dev_fixture");
}
