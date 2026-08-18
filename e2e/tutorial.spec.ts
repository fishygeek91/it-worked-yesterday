import { expect, test, type Page } from "@playwright/test";

/**
 * Mark the current room from the chrome copy. The spec never imports the suite.
 *
 * @param page - Browser page
 */
async function markWhatTheRoomSaid(page: Page): Promise<void> {
  const room = await page.locator(".room").innerText();
  if (room.includes("This checkout is green. The suite passed.")) {
    await page.locator("[data-command=\"good\"]").click();
    return;
  }
  if (room.includes("This checkout is red.")) {
    await page.locator("[data-command=\"bad\"]").click();
    return;
  }
  throw new Error(`unexpected room copy: ${room}`);
}

test("wins the tutorial by marking what the room said", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#chrome")).toBeVisible();
  await expect(page.locator(".teach").nth(0)).toHaveText(
    "HEAD is red. The last green is 8 suspects back.",
  );
  await expect(page.locator(".teach").nth(1)).toHaveText("Mark the checkout. The range narrows.");
  await expect(page.locator(".teach").nth(2)).toHaveText("When one SHA remains, accuse it.");
  await expect(page.locator(".seed")).toHaveText("seed 1729");
  await expect(page.locator(".share")).toHaveCount(0);

  const accuse = page.locator("[data-command=\"accuse\"]");
  for (let step = 0; step < 8; step += 1) {
    if (await accuse.isEnabled()) {
      break;
    }
    await markWhatTheRoomSaid(page);
  }
  await expect(accuse).toBeEnabled();
  await expect(page.locator(".ready")).toHaveText("One SHA remains. Accuse it.");
  await accuse.click();

  await expect(page.locator(".outcome")).toHaveText("Accused. That SHA was the first-bad.");
  await expect(page.locator("#win-card")).toBeVisible();
  await expect(page.locator(".win-seed")).toHaveText("seed 1729");
  await expect(page.locator(".win-marks")).toHaveText("3 / 3");

  await expect(page.locator("[data-share-result]")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-save-card]").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("iwy-tutorial-seed-1729-3-of-3.png");

  const tutorialDone = await page.evaluate(() => window.localStorage.getItem("iwy.tutorialDone"));
  expect(tutorialDone).toBe("1");
});

test("invalid seeded n is a postmortem after the tutorial", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("iwy.tutorialDone", "1");
  });
  await page.goto("/?l=seeded&n=31&seed=1729");
  await expect(page.locator(".outcome")).toHaveText("Invalid URL. The share was not coerced.");
  await expect(page.locator("#map")).toHaveCount(0);
  await expect(page.locator(".room")).toContainText("32 or 64");
});

test("blame names the path and still lets the tutorial win", async ({ page }) => {
  await page.goto("/");
  const blame = page.locator("[data-command=\"blame\"]");
  await expect(blame).toBeEnabled();
  await blame.click();
  await expect(page.locator(".peek")).toHaveText("Peek: src/collect.ts");
  await expect(page.locator(".marks")).toHaveText("2 / 3");

  const accuse = page.locator("[data-command=\"accuse\"]");
  for (let step = 0; step < 8; step += 1) {
    if (await accuse.isEnabled()) {
      break;
    }
    await markWhatTheRoomSaid(page);
  }
  await expect(accuse).toBeEnabled();
  await accuse.click();
  await expect(page.locator(".outcome")).toHaveText("Accused. That SHA was the first-bad.");
  await expect(page.locator(".win-marks")).toHaveText("5 / 3");
});
