import { expect, test } from "@playwright/test";

const key = "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE";
const version = "d4-hom-v4";

async function resume(page: import("@playwright/test").Page, state: Record<string, unknown>) {
  await page.addInitScript(({ key, version, state }) => localStorage.setItem(`adle:homophone:preview-${key}:${version}`, JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion: version, state })), { key, version, state });
  await page.goto("/dev/adle/homophones");
}
function progress(stage: string, extra: Record<string, unknown> = {}) {
  return { stage, teachingPage: 0, muted: true, binSortCompleted: true, balloonCompleted: true, coverIndex: 0, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {}, choiceMistakes: [], reflectionResponse: "", completed: false, ...extra };
}

test("two gaps check together, then continue through three passages", async ({ page }) => {
  await resume(page, progress("dictation", { coverAttempts: { piece: "piece", peace: "peace" } }));
  for (let passage = 1; passage <= 3; passage++) {
    await expect(page.getByText(`Passage ${passage} of 3`)).toBeVisible();
    await expect(page.locator('input[aria-label^="Missing word"]')).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Check both words" })).toBeDisabled();
    await page.getByRole("textbox", { name: "Missing word 1" }).fill(passage === 1 ? "piece" : passage === 2 ? "peace" : "piece");
    await page.getByRole("textbox", { name: "Missing word 2" }).fill(passage === 1 ? "peace" : passage === 2 ? "piece" : "peace");
    await expect(page.getByRole("button", { name: "Check both words" })).toBeEnabled();
    await page.getByRole("button", { name: "Check both words" }).click();
    await expect(page.locator('[data-two-word-dictation-state="checked"]')).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Look back at these words" })).toBeVisible();
  await expect(page.getByText(/You chose and spelled the lesson words carefully/)).toBeVisible();
  await page.getByRole("textbox", { name: /Which clue will help/ }).fill("Piece is a part of something.");
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Homophone lesson complete" })).toBeVisible();
});

test("reflection groups choice errors and written spellings by word", async ({ page }) => {
  await resume(page, progress("reflection", { coverAttempts: { piece: "peice" }, dictationValues: { "0": ["peice", "peace"] }, dictationChecked: { "0": true }, choiceMistakes: [{ activity: "bin-sort", word: "piece", selected: "peace", sentence: "Take one ____ of cake." }, { activity: "balloon-pop", word: "peace", selected: null, sentence: "They lived in ____." }] }));
  await expect(page.getByRole("heading", { name: "piece", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "peace", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choices" })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Written spellings" })).toHaveCount(1);
  await expect(page.getByText(/You wrote peice/)).toHaveCount(2);
  await expect(page.getByText(/balloons floated away/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish lesson" })).toBeDisabled();
});
