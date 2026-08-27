import { expect, test } from "@playwright/test";

import {
  buildAdleParentIssueSourceEntityId,
  classifyAdditionalSpellingOccurrence,
  findAdleWritingOccurrences,
} from "../../lib/adle/review-work/additional-spelling";
import { parseAdleReviewWorkSourceId } from "../../lib/adle/review-work/source-id";

test("raw and URL-encoded ADLE Review Work source ids resolve identically", () => {
  const expected = {
    dailyAssignmentId: "assignment-id",
    reviewSessionId: "session-id",
  };
  expect(parseAdleReviewWorkSourceId("assignment-id:session-id")).toEqual(expected);
  expect(parseAdleReviewWorkSourceId("assignment-id%3Asession-id")).toEqual(expected);
  expect(parseAdleReviewWorkSourceId("assignment-id%ZZsession-id")).toBeNull();
});
test("a Target Word occurrence is not duplicated as a parent issue", () => {
  expect(classifyAdditionalSpellingOccurrence({
    positionStart: 8,
    positionEnd: 17,
    observedSpelling: "imposible",
    correctSpelling: "impossible",
    targets: [{
      encounterId: "encounter-id",
      canonicalSpelling: "impossible",
      originalOutcomeSource: "writing",
      originalObservedSpelling: "imposible",
      positionStart: 8,
      positionEnd: 17,
    }],
  })).toMatchObject({ status: "already_captured" });
});

test("a distinct occurrence receives stable, word-scoped lineage", () => {
  const sourceEntityId = buildAdleParentIssueSourceEntityId({
    reviewSessionId: "session-id",
    positionStart: 30,
    positionEnd: 39,
    observedSpelling: "imposible",
    correctSpelling: "impossible",
  });
  expect(sourceEntityId).toContain("session-id:30-39:imposible:impossible");
});

test("sole and repeated writing occurrences remain exact and selectable", () => {
  expect(findAdleWritingOccurrences("famly comes first", "famly")).toHaveLength(1);
  expect(
    findAdleWritingOccurrences("a seperate task, then a seperate plan", "seperate").map(
      ({ start, end }) => ({ start, end }),
    ),
  ).toEqual([
    { start: 2, end: 10 },
    { start: 24, end: 32 },
  ]);
});

test("completed Review inspection adds, resolves, and observationally submits", async ({
  page,
}, testInfo) => {
  await page.goto("/dev/adle/review-work");

  await expect(
    page.getByRole("heading", { name: "Should Homework Be Banned?" }),
  ).toBeVisible();
  await expect(page.getByText("Learner Review complete")).toBeVisible();
  await expect(page.getByText("10 targets", { exact: true })).toBeVisible();
  await expect(page.getByText("6 correct", { exact: true })).toBeVisible();
  await expect(page.getByText("2 repaired", { exact: true })).toBeVisible();
  await expect(page.getByText("2 not secured", { exact: true })).toBeVisible();

  await page.getByText("View Target Word details").click();
  await expect(page.getByRole("heading", { name: "Successful · 6" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Repaired · 2" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Missed · 2" })).toBeVisible();

  await page.getByRole("textbox", { name: "Word child wrote" }).fill("famly");
  await page.getByRole("textbox", { name: "Correct spelling" }).fill("family");
  await page.getByRole("button", { name: "Add misspelling" }).click();

  await expect(page.getByText("Added to the spelling table with shared analysis.")).toBeVisible();
  await expect(page.getByText("Omitted Unstressed Vowel")).toBeVisible();
  await expect(page.getByText("3 items")).toBeVisible();

  for (const word of ["definately", "seperate", "famly"]) {
    await page
      .getByRole("button", { name: `Confirm the learning route for ${word}` })
      .click();
  }

  const submit = page.getByRole("button", { name: "Submit" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(
    page.locator("header").getByText("Reviewed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Submitted. Only the in-memory observational status changed."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add a missed spelling" })).toHaveCount(0);

  await page.screenshot({
    path: testInfo.outputPath(`adle-review-work-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
