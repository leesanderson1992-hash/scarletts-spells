/** Synthetic local UI proof. Requires the dev server on 127.0.0.1:3000. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ING_MICRO_SKILLS } from "../lib/adle/ing/contracts";
import { initialIngProgress } from "../lib/adle/ing/progress";
import { initialIngScrabbleBoard, moveIngTile } from "../lib/adle/ing/scrabble";

async function main() {
const browser = await chromium.launch({ headless: true });
try {
  for (const skill of ING_MICRO_SKILLS) {
    const context = await browser.newContext({ hasTouch: true });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3000/dev/adle/ing-endings");
    await page.getByRole("combobox", { name: "Micro skill" }).selectOption(skill);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("adle:ing:preview:v1")!));
    const lesson = stored.lesson;
    const scrabble = lesson.words[1];
    const progress = initialIngProgress(lesson);
    progress.stageId = "activity:ing-scrabble";
    await page.evaluate(value => localStorage.setItem("adle:ing:preview:v1", JSON.stringify(value)), { ...stored, progress });
    await page.reload();
    await page.locator('[data-ing-scrabble-state="building"]').waitFor();
    const baseLetters = await page.locator("[data-ing-slot]").evaluateAll(nodes => nodes.map(node => node.textContent?.trim()).filter(Boolean).join(""));
    assert.equal(baseLetters.replaceAll("·", ""), scrabble.base.toUpperCase());
    let retained = 0;
    while (scrabble.base[retained] && scrabble.base[retained] === scrabble.word[retained]) retained++;
    if (skill === "D4_INF_ING_ENDINGS_DROP_E") {
      await page.locator('[data-ing-bank="true"]').first().scrollIntoViewIfNeeded();
      const tile = await page.locator(`[data-ing-tile-id="base:${scrabble.base.length - 1}"]`).boundingBox();
      const bank = await page.locator('[data-ing-bank="true"]').first().boundingBox();
      assert(tile && bank);
      await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2);
      await page.mouse.down();
      await page.mouse.move(bank.x + bank.width / 2, bank.y + bank.height / 2, { steps: 8 });
      await page.mouse.up();
      assert.equal(await page.locator(`[data-ing-slot="${scrabble.base.length - 1}"]`).textContent(), "·");
    }
    for (let i = retained; i < scrabble.base.length; i++) {
      if (skill === "D4_INF_ING_ENDINGS_DROP_E" && i === scrabble.base.length - 1) continue;
      await page.locator(`[data-ing-tile-id="base:${i}"]`).click();
      await page.getByRole("button", { name: "Move selected tile here" }).click();
    }
    for (let i = retained; i < scrabble.word.length; i++) {
      const tile = page.locator(`[data-ing-tile-id="required:${i - retained}"]`);
      const slot = page.locator(`[data-ing-slot="${i}"]`);
      if (skill === "D4_INF_ING_ENDINGS_REGULAR" && i === retained) {
        await page.locator('[data-ing-tile-id="distractor:0"]').click(); await slot.click();
      } else if (skill === "D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT" && i === retained) {
        await tile.tap(); await slot.tap();
      } else { await tile.click(); await slot.click(); }
    }
    if (skill === "D4_INF_ING_ENDINGS_REGULAR") {
      await page.getByRole("button", { name: "Check word" }).click();
      await page.getByText("That is not the -ing spelling yet.", { exact: false }).waitFor();
      const tile = page.locator('[data-ing-tile-id="required:0"]');
      const slot = page.locator(`[data-ing-slot="${retained}"]`);
      await tile.focus(); await page.keyboard.press("Enter"); await slot.focus(); await page.keyboard.press("Enter");
    }
    await page.getByRole("button", { name: "Check word" }).click();
    await page.locator('[data-ing-scrabble-state="complete"]').waitFor();
    const done = initialIngProgress(lesson);
    done.stageId = "reflection";
    done.teachingPageIndex = 2;
    done.reflection = "I will check the spelling change.";
    done.meaningConnected = [0, 2, 4].map(index => lesson.words[index].canonicalWordId);
    for (const index of [1, 3, 5]) {
      const word = lesson.words[index]; let board = initialIngScrabbleBoard(word); let prefix = 0;
      while (word.base[prefix] && word.base[prefix] === word.word[prefix]) prefix++;
      for (let i = prefix; i < word.base.length; i++) board = moveIngTile(board, `base:${i}`, { kind: "bank" });
      for (let i = prefix; i < word.word.length; i++) board = moveIngTile(board, `required:${i - prefix}`, { kind: "slot", index: i });
      done.scrabbleBoards[word.canonicalWordId] = board;
      done.scrabbleComplete.push(word.canonicalWordId);
    }
    for (const target of lesson.queuedTargets) done.cleaverProgress[target.canonicalWordId] = { revealed: true, questionShown: true, selectedOptionId: "0" };
    for (const word of lesson.words) {
      done.coverAttempts[word.canonicalWordId] = word.word;
      done.dictationValues[word.canonicalWordId] = word.word;
      done.dictationChecked.push(word.canonicalWordId);
    }
    if (skill === "D4_INF_ING_ENDINGS_REGULAR") {
      done.stageId = "cover";
      done.coverAttempts = {};
      done.dictationValues = {};
      done.dictationChecked = [];
      await page.evaluate(value => localStorage.setItem("adle:ing:preview:v1", JSON.stringify(value)), { ...stored, progress: done });
      await page.reload();
      for (const word of lesson.words) {
        await page.getByRole("button", { name: /Slide the cover from left to right/ }).focus();
        await page.keyboard.press("Enter");
        await page.locator('[data-cover-state="write"] input').fill(word.word);
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await page.locator('[data-cover-state="check"]').waitFor();
        await page.getByRole("button", { name: "Continue" }).click();
      }
      for (const word of lesson.words) {
        await page.getByRole("button", { name: "Hear sentence" }).click();
        await page.getByRole("textbox", { name: "Missing action word" }).fill(word.word);
        await page.getByRole("button", { name: "Check word" }).click();
        await page.locator('[data-single-word-dictation-state="checked"]').waitFor();
        await page.getByRole("button", { name: "Continue" }).click();
      }
      await page.getByRole("textbox").last().fill("I will check the spelling change.");
    } else {
      await page.evaluate(value => localStorage.setItem("adle:ing:preview:v1", JSON.stringify(value)), { ...stored, progress: done });
      await page.reload();
    }
    await page.getByRole("button", { name: "Finish" }).click();
    await page.locator('[data-ing-finished="true"]').waitFor();
    await page.reload();
    await page.locator('[data-ing-finished="true"]').waitFor();
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("adle:ing:preview:v1")!));
    assert.equal(after.finishWrites, 1);
    assert.equal(after.progress.finished, true);
    await context.close();
  }
  console.log("PASS: local -ing Scrabble interaction and Finish/reload persistence for all four rules");
} finally { await browser.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
