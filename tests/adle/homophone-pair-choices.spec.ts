import { expect, test } from "@playwright/test";
import content from "../../data/adle/homophone/convergence-v1/approved-lesson-content.json";
import cheatCodes from "../../data/adle/homophone/convergence-v1/approved-cheat-codes.json";

const keys = [
  "D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS",
  "D4_HOM_CONFUSABLE_WORDS_SE_SY_CE_CY",
  "D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T",
];

function pairsFor(key: string): string[][] {
  const lesson = content.lessons.find(item => item.microSkillKey === key);
  if (!lesson) throw new Error(`Missing approved lesson: ${key}`);
  return lesson.sets.slice(0, 3).map(set => set.members.map(member => member.word).sort());
}

function promptAnswers(key: string): Map<string, string> {
  const lesson = content.lessons.find(item => item.microSkillKey === key);
  if (!lesson) throw new Error(`Missing approved lesson: ${key}`);
  return new Map(lesson.sets.slice(0, 3).flatMap(set => set.shortSentences.map(item => {
    const escaped = item.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [item.sentence.replace(new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "i"), "____"), item.word] as const;
  })));
}

function resumeState(stage: "activity:bin-sort" | "activity:balloon-pop") {
  return { stage, teachingPage: 0, muted: true, binSortCompleted: false, balloonCompleted: false,
    coverIndex: 0, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {},
    choiceMistakes: [], reflectionResponse: "", completed: false };
}

for (const key of keys) {
  test(`${key} shows only the active pair in Bin Sort and Balloon Pop`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const version = `${content.contentVersion}:intro-v3:word-art-v1:cheat-${cheatCodes.sourceSha256.slice(0, 12)}:rotation-0`;
    const storageKey = `adle:homophone:preview-convergence-${key}-0:${version}`;
    const expectedPairs = pairsFor(key);
    const answers = promptAnswers(key);
    await page.addInitScript(({ storageKey, version, state }) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify({
        savedAt: Date.now(), schemaVersion: 1, contentVersion: version, state,
      }));
    }, { storageKey, version, state: resumeState("activity:bin-sort") });
    await page.goto(`/dev/adle/homophone-convergence?skill=${key}#lesson`);
    const binOptions = page.locator('[data-testid="bin-sort-active"] [role="group"] button');
    await expect(binOptions).toHaveCount(2);
    const binPair = (await binOptions.allTextContents()).map(value => value.trim()).sort();
    expect(expectedPairs).toContainEqual(binPair);
    let binPairChanged = false;
    for (let index = 0; index < 6 && !binPairChanged; index++) {
      const sentence = (await page.locator('[data-testid="bin-sort-active"] .relative.z-10').textContent())?.trim() ?? "";
      const answer = answers.get(sentence);
      expect(answer, `Bin Sort answer for ${sentence}`).toBeTruthy();
      await binOptions.filter({ hasText: answer! }).click();
      await expect(page.locator('[data-testid="bin-sort-active"]')).toContainText(`Word ${index + 2} of`);
      const nextPair = (await binOptions.allTextContents()).map(value => value.trim()).sort();
      expect(expectedPairs).toContainEqual(nextPair);
      binPairChanged = JSON.stringify(nextPair) !== JSON.stringify(binPair);
    }
    expect(binPairChanged).toBe(true);

    await page.evaluate(({ storageKey, version, state }) => {
      localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), schemaVersion: 1,
        contentVersion: version, state }));
    }, { storageKey, version, state: resumeState("activity:balloon-pop") });
    await page.reload();
    await page.getByRole("button", { name: "Start 45-second round" }).click();
    const balloons = page.locator('.balloon-pop-choice');
    await expect(balloons).toHaveCount(2);
    const balloonPair = (await balloons.allTextContents()).map(value => value.trim()).sort();
    expect(expectedPairs).toContainEqual(balloonPair);
    let balloonPairChanged = false;
    for (let index = 0; index < 12 && !balloonPairChanged; index++) {
      const sentence = (await page.locator('.balloon-pop-game > p').textContent())?.trim() ?? "";
      const answer = answers.get(sentence);
      expect(answer, `Balloon Pop answer for ${sentence}`).toBeTruthy();
      await page.getByRole("button", { name: `Pop ${answer}` }).click();
      const nextPair = (await balloons.allTextContents()).map(value => value.trim()).sort();
      expect(nextPair).toHaveLength(2);
      expect(expectedPairs).toContainEqual(nextPair);
      balloonPairChanged = JSON.stringify(nextPair) !== JSON.stringify(balloonPair);
    }
    expect(balloonPairChanged).toBe(true);
  });
}
