import { expect, test } from "@playwright/test";
import convergence from "../../data/adle/homophone/convergence-v1/approved-lesson-content.json";
import cheatCodes from "../../data/adle/homophone/convergence-v1/approved-cheat-codes.json";
import retained from "../../data/adle/candidates/d4-hom/v4/lessons.json";

const cases = [
  {
    name: "new convergence lesson",
    url: "/dev/adle/homophone-convergence?skill=D4_HOM_CONFUSABLE_WORDS_ACCEPT_EXCEPT#lesson",
    storageKey: `adle:homophone:preview-convergence-D4_HOM_CONFUSABLE_WORDS_ACCEPT_EXCEPT-0:${convergence.contentVersion}:intro-v3:word-art-v1:cheat-${cheatCodes.sourceSha256.slice(0, 12)}:rotation-0`,
    version: `${convergence.contentVersion}:intro-v3:word-art-v1:cheat-${cheatCodes.sourceSha256.slice(0, 12)}:rotation-0`,
    answers: new Map(convergence.lessons[0].sets[0].shortSentences.map(sentence => [sentence.sentence.replace(sentence.word, "____"), sentence.word])),
    definitions: { accept: "agree to receive something", except: "leaving one thing out" },
  },
  {
    name: "retained v2 lesson",
    url: "/dev/adle/homophones",
    storageKey: `adle:homophone:preview-D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE:${retained.contentVersion}`,
    version: retained.contentVersion,
    answers: new Map(retained.lessons[0].binSort.map(prompt => [prompt.sentence, prompt.answer])),
    definitions: { peace: "a state without fighting or disturbance", piece: "one part of a larger whole" },
  },
] as const;

for (const lesson of cases) test(`${lesson.name} shows definitions beside words only in completed Bin Sort`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(({ storageKey, version }) => {
    localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion: version,
      state: { stage: "activity:bin-sort", teachingPage: 0, muted: true, binSortCompleted: false, balloonCompleted: false,
        coverIndex: 0, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {},
        choiceMistakes: [], reflectionResponse: "", completed: false },
    }));
  }, { storageKey: lesson.storageKey, version: lesson.version });
  await page.goto(lesson.url);
  const active = page.getByTestId("bin-sort-active");
  await expect(active).toBeVisible();
  for (let index = 0; index < 4; index++) {
    const sentence = (await active.locator(".relative.z-10").textContent())?.trim() ?? "";
    const answer = lesson.answers.get(sentence);
    expect(answer, `Answer for ${sentence}`).toBeTruthy();
    const choices = active.getByRole("group").getByRole("button");
    for (const definition of Object.values(lesson.definitions)) {
      for (const choice of await choices.all()) await expect(choice).not.toContainText(definition);
    }
    await choices.filter({ hasText: answer! }).click();
    if (index < 3) await expect(active).toContainText(`Word ${index + 2} of 4`);
  }
  const overview = page.getByTestId("bin-sort-overview");
  await expect(overview).toBeVisible();
  for (const [word, definition] of Object.entries(lesson.definitions)) {
    const heading = overview.getByRole("heading", { level: 3 }).filter({ hasText: word });
    await expect(heading).toContainText(`${word}— ${definition}`);
  }
});
