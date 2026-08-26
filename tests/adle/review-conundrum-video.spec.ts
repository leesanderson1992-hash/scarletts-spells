import { expect, test, type Page } from "@playwright/test";
import { GOVERNED_CONUNDRUM_FIXTURE } from "../../lib/adle/review-v3/dev-conundrum-snapshot";

const PAGE = "/dev/adle/review-conundrum";

async function stubYouTube(page: Page, failure = false) {
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({
    contentType: "text/html", body: "<!doctype html><html><body>Governed player test double</body></html>",
  }));
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.YT = { Player: class { constructor(frame, options) {
      this.frame = frame;
      setTimeout(() => options.events.${failure ? "onError" : "onReady"}(), 0);
    } destroy() { this.frame.remove(); } } };
    window.onYouTubeIframeAPIReady?.();`,
  }));
}

async function start(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(PAGE);
  await page.getByRole("button", { name: "SPIN", exact: true }).click();
  await page.getByRole("button", { name: "Start writing", exact: true }).click();
}

test("selected Conundrum presents frozen video, prompt and Top Tip responsively", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await stubYouTube(page);
  await start(page);
  const frame = page.locator('iframe[title="#27 The Photo Conundrum"]');
  await expect(frame).toBeVisible();
  const src = new URL((await frame.getAttribute("src"))!);
  expect(src.origin + src.pathname).toBe(GOVERNED_CONUNDRUM_FIXTURE.configuration.youtube_embed_url);
  expect(src.searchParams.get("autoplay")).toBe("0");
  expect(src.searchParams.get("playsinline")).toBe("1");
  await expect(page.getByRole("region", { name: "Challenge prompt" })).toContainText(GOVERNED_CONUNDRUM_FIXTURE.promptText);
  await expect(page.getByRole("region", { name: "Challenge prompt" })).toContainText(GOVERNED_CONUNDRUM_FIXTURE.instructionText);
  await expect(page.getByRole("complementary", { name: "Top Tip" })).toContainText(String(GOVERNED_CONUNDRUM_FIXTURE.configuration.top_tip));
  await expect(page.getByText("Play the video when you’re ready.")).toBeVisible();
  const bounds = await frame.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(200);
  expect(bounds!.height).toBeGreaterThanOrEqual(200);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(Math.abs(bounds!.height - Math.max(200, bounds!.width * 9 / 16))).toBeLessThan(2);
  const promptBounds = await page.getByRole("region", { name: "Challenge prompt" }).boundingBox();
  expect(promptBounds!.y).toBeGreaterThan(bounds!.y + bounds!.height);
  for (let index = 1; index <= 3; index++) {
    const control = page.getByRole("button", { name: `Play target word ${index}`, exact: true });
    await expect(control).toHaveAttribute("title", `Play target word ${index}`);
    expect(await control.textContent()).not.toMatch(/necessary|Wednesday|business/);
  }
  await expect(page.getByText("Target Words: 0 / 3", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("player unavailable and retry preserve the same frozen media and response", async ({ page }) => {
  await stubYouTube(page, true);
  await start(page);
  const frame = page.locator("iframe");
  const source = await frame.getAttribute("src");
  const writing = page.getByRole("textbox", { name: "Your Writing Challenge", exact: true });
  await writing.fill("My decision stays exactly as written.");
  await expect(page.getByText(/YouTube is unavailable right now/)).toBeVisible();
  await page.getByRole("button", { name: "Retry video" }).click();
  await expect(page.getByText(/YouTube is unavailable right now/)).toBeVisible();
  await expect(frame).toHaveAttribute("src", source!);
  await expect(writing).toHaveValue("My decision stays exactly as written.");
  await expect(page.locator("[data-blocker-code]")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Challenge prompt" })).toContainText(GOVERNED_CONUNDRUM_FIXTURE.promptText);
});

test("missing required video blocks before writing instead of a text-only Conundrum", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${PAGE}?invalid=1`);
  await page.getByRole("button", { name: "SPIN", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveAttribute("data-blocker-code", "review_conundrum_video_configuration_invalid");
  await expect(page.getByRole("button", { name: "Start writing" })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("temporary API network failure can recover without replacing frozen content", async ({ page }) => {
  await page.route("https://www.youtube.com/iframe_api", (route) => route.abort());
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({
    contentType: "text/html", body: "<!doctype html><html><body>Video unavailable test double</body></html>",
  }));
  await start(page);
  await expect(page.getByText(/YouTube is unavailable right now/)).toBeVisible();
  const source = await page.locator("iframe").getAttribute("src");
  await page.getByRole("textbox", { name: "Your Writing Challenge", exact: true }).fill("Keep this draft.");
  await page.unroute("https://www.youtube.com/iframe_api");
  await stubYouTube(page);
  await page.getByRole("button", { name: "Retry video" }).click();
  await expect(page.getByText("Play the video when you’re ready.")).toBeVisible();
  await expect(page.locator("iframe")).toHaveAttribute("src", source!);
  await expect(page.getByRole("textbox", { name: "Your Writing Challenge", exact: true })).toHaveValue("Keep this draft.");
  await expect(page.locator("[data-blocker-code]")).toHaveCount(0);
});

for (const category of ["Reflection", "Stories", "Fortunately / Unfortunately", "Persuasion"]) {
  test(`${category} remains text-only with unchanged prompt rendering`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(PAGE);
    await page.getByRole("button", { name: "SPIN", exact: true }).click();
    await page.getByRole("tab", { name: category, exact: true }).click();
    await page.getByRole("button", { name: "Start writing", exact: true }).click();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Challenge prompt" })).toContainText("Listen carefully to the target words as often as you need.");
    await expect(page.getByRole("textbox", { name: "Your Writing Challenge", exact: true })).toBeVisible();
  });
}
