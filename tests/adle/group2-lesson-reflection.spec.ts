import { expect, test, type Locator, type Page } from "@playwright/test";

async function openReflectionGroup(page: Page) {
  await page.goto("/dev/adle/activity-convergence", { waitUntil: "load" });
  await page.getByRole("button", { name: "Group 2 · Lesson Reflection" }).click();
}

function candidate(page: Page, name: string): Locator {
  return page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) }).first();
}

test("canonical LessonReflection covers no-miss, mistake, restore, response and keyboard states", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openReflectionGroup(page);
  const compound = candidate(page, "LessonReflection · Compound");
  await expect(compound.getByRole("heading", { name: "What went wrong" })).toBeVisible();
  await expect(compound.getByRole("status")).toContainText("kept its governed written form");

  await compound.getByRole("button", { name: "Active" }).click();
  await expect(compound.getByRole("article", { name: /Compare your spelling/ })).toHaveCount(1);
  await expect(compound.getByText("rain bow", { exact: true })).toBeVisible();
  await expect(compound.getByRole("definition").filter({ hasText: "rainbow" })).toBeVisible();
  await expect(compound.getByText(/You wrote the sentence/)).toBeVisible();

  await compound.getByRole("button", { name: "Incorrect" }).click();
  await expect(compound.getByRole("article", { name: /Compare your spelling/ })).toHaveCount(3);

  await compound.getByRole("button", { name: "Resume / restored" }).click();
  const response = compound.getByRole("textbox", { name: /What did you learn about spelling compound words/ });
  await expect(response).toHaveValue("I will look for the meaningful word parts.");
  await expect(response).toBeFocused();

  await compound.getByRole("button", { name: "Initial" }).click();
  const emptyResponse = compound.getByRole("textbox", { name: /What did you learn about spelling compound words/ });
  const finish = compound.getByRole("button", { name: "Finish preview" });
  await expect(emptyResponse).toHaveAttribute("required", "");
  await expect(emptyResponse).toHaveAttribute("maxlength", "2000");
  await expect(finish).toBeDisabled();
  await emptyResponse.fill("I will check how the parts join.");
  await expect(emptyResponse).toHaveValue("I will check how the parts join.");
  await expect(finish).toBeEnabled();
  await emptyResponse.press("Tab");
  await expect(finish).toBeFocused();
  await finish.press("Enter");
  await expect(page).toHaveURL(/\/dev\/adle\/activity-convergence/);

  await emptyResponse.fill("x".repeat(2000));
  await expect(emptyResponse).toHaveValue("x".repeat(2000));
  await expect(compound.getByText("2000 of 2000 characters", { exact: false })).toBeVisible();
});

test("route configurations keep Prefix context recap separate and Base Word target comparisons normalized", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openReflectionGroup(page);
  const morphology = candidate(page, "LessonReflection · Prefix/Affix");
  await morphology.getByRole("button", { name: "Active" }).click();
  await expect(morphology.locator('[data-reflection-context-recap="recap-only"]')).toBeVisible();
  await expect(morphology.getByRole("article", { name: /Compare your spelling/ })).toHaveCount(0);
  await expect(morphology.getByRole("textbox", { name: /prefix un-/ })).toBeVisible();

  await morphology.getByRole("button", { name: "Incorrect" }).click();
  await expect(morphology.getByRole("article", { name: /Compare your spelling of unfair/ })).toBeVisible();
  await expect(morphology.getByText("unfare", { exact: true })).toBeVisible();

  const base = candidate(page, "LessonReflection · Base Word");
  await base.getByRole("button", { name: "Incorrect" }).click();
  await expect(base.getByRole("article", { name: /Compare your spelling/ })).toHaveCount(1);
  await expect(base.getByRole("textbox", { name: /base words/ })).toBeVisible();
});

test("LessonReflection stays within the narrow viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-touch-chromium");
  await openReflectionGroup(page);
  const compound = candidate(page, "LessonReflection · Compound");
  await compound.getByRole("button", { name: "Incorrect" }).click();
  await expect(compound.getByRole("article", { name: /Compare your spelling/ })).toHaveCount(3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Prefix learner shell restores and completes through the canonical reflection", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const contentVersion = "d4_mor_prefixes_un_word_lab_v2_2026_07_16_meaning_cards_audio";
  const state = {
    stage: "reflect", introIndex: 0, discoverIndex: 0, discoverAddedPrefix: false,
    splitMisses: 0, splitCorrect: false, splitIndex: 0, matchComplete: true, buildIndex: 0,
    controlledIndex: 0, dictationIndex: 0,
    controlledAttempts: { "dev-unfair": "unfare", "dev-unkind": "unkind", "dev-unlock": "unlock", "dev-untidy": "untidy" },
    controlledChecked: { "dev-unfair": true, "dev-unkind": true, "dev-unlock": true, "dev-untidy": true },
    sentenceAttempts: {
      "dev-unfair": "It was unfair to change the rules.", "dev-unkind": "It was unkind to leave her out.",
      "dev-unlock": "Please unlock the door before we leave.", "dev-untidy": "The untidy desk needed sorting.",
    },
    checkedSentence: false, guidedBindings: [], muted: true, helpLevel: 0,
    reflectionText: "I will keep un- before the base word.",
  };
  await page.goto("/dev/adle/morphology-primitives", { waitUntil: "load" });
  await page.evaluate(({ contentVersion, state }) => localStorage.setItem(
    `adle:morphology-un:dev-morphology-guided:1:${contentVersion}`,
    JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion, state }),
  ), { contentVersion, state });
  await page.reload({ waitUntil: "load" });
  await expect(page.getByRole("heading", { name: "What went wrong" })).toBeVisible();
  await expect(page.getByRole("article", { name: /Compare your spelling of unfair/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /prefix un-/ })).toHaveValue("I will keep un- before the base word.");
  await page.getByRole("button", { name: "Finish the Word Lab" }).click();
  await expect(page.getByRole("heading", { name: /You finished the Word Lab/ })).toBeVisible();
});

test("Base Word learner shell restores target-token comparison and completes locally", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const contentVersion = "base-word-two-family-interactive-preview-v2";
  const state = {
    stage: "reflect", familyIndex: 0, cleaveIndex: 0, cleaveStep: 0, cleaveCuts: {}, cleaveMisses: {}, buildIndex: 0,
    controlledIndex: 0, dictationIndex: 0,
    controlledAttempts: {}, controlledChecked: {},
    sentenceAttempts: {
      replayed_en_gb: "We replay the song.", government_en_gb: "The government made a plan.",
      play_en_gb: "We play outside.", replay_en_gb: "Can we replay that song?",
      govern_en_gb: "Leaders govern fairly.", governor_en_gb: "I am going to vote for our new governor.",
    },
    sentenceChecked: false, reflectionText: "The base words play and govern stay visible.",
  };
  await page.goto("/dev/adle/base-word-family", { waitUntil: "load" });
  await page.evaluate(({ contentVersion, state }) => localStorage.setItem(
    `adle:morphology-base-family:dev-base-word-family:1:${contentVersion}`,
    JSON.stringify(state),
  ), { contentVersion, state });
  await page.reload({ waitUntil: "load" });
  await expect(page.getByRole("heading", { name: "What went wrong" })).toBeVisible();
  await expect(page.getByRole("article", { name: /Compare your spelling of replayed/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /base words play and govern/ })).toHaveValue("The base words play and govern stay visible.");
  await page.getByRole("button", { name: "Finish preview" }).click();
  await expect(page.getByRole("heading", { name: /You finished the base-word Word Lab/ })).toBeVisible();
});

test("Closed Compound learner shell restores its exact-form comparison and completes locally", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const contentVersion = "d4_mor_closed_compounds_v1";
  const assignmentId = "dev-closed-compound-reflection";
  const state = {
    stage: "reflect", index: 0, muted: true,
    attempts: { rainbow: "rain bow", football: "football", bedroom: "bedroom", playground: "playground" },
    sentences: {
      rainbow: "A rain bow appeared after rain.", football: "Children play football after school.",
      bedroom: "The bedroom was quiet.", playground: "We met at the playground.",
    },
    sentenceChecked: false, reflection: "I will join both complete words with no space.",
    jigsawLocked: [], jigsawMisses: {}, jigsawPlacements: {}, meaningConnected: [], meaningMisses: {},
  };
  await page.goto("/dev/adle/closed-compound", { waitUntil: "load" });
  await expect(page.getByRole("button", { name: "Open the compound workshop" })).toBeVisible();
  await page.evaluate(({ assignmentId, contentVersion, state }) => localStorage.setItem(
    `adle:morphology-un:${assignmentId}:1:${contentVersion}:closed-compound`,
    JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion, state }),
  ), { assignmentId, contentVersion, state });
  await page.reload({ waitUntil: "load" });
  await expect(page.getByRole("heading", { name: "What went wrong" })).toBeVisible();
  await expect(page.getByRole("article", { name: /Compare your spelling of rainbow/ })).toBeVisible();
  await expect(page.getByText("rain", { exact: true })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: "A rain bow appeared after rain." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /spelling compound words/ })).toHaveValue("I will join both complete words with no space.");
  await expect(page.locator('input[name="assignmentId"]')).toHaveValue(assignmentId);
  await expect(page.locator('input[name="learningReflection"]')).toHaveValue("I will join both complete words with no space.");
  await page.getByRole("button", { name: "Finish Word Lab" }).click();
  await expect(page.getByTestId("closed-compound-preview-complete")).toBeVisible();
});
