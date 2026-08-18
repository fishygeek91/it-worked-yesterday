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

test("unseen visitors cannot skip into merged", async ({ page }) => {
  await page.goto("/?l=merged");
  await expect(page.locator(".teach").nth(0)).toHaveText(
    "HEAD is red. The last green is 8 suspects back.",
  );
  await expect(page.locator(".case")).toHaveText("Tutorial");
});

test("wins merged by marking what the room said", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("iwy.tutorialDone", "1");
  });
  await page.goto("/?l=merged");
  await expect(page.locator("#chrome")).toBeVisible();
  await expect(page.locator(".case")).toHaveText("The feature branch");
  await expect(page.locator(".teach").nth(0)).toHaveText(
    "HEAD is red. A feature branch joined before HEAD.",
  );
  await expect(page.locator(".seed")).toHaveText("seed 1729");

  const accuse = page.locator("[data-command=\"accuse\"]");
  for (let step = 0; step < 40; step += 1) {
    if (await accuse.isEnabled()) {
      break;
    }
    await markWhatTheRoomSaid(page);
  }
  await expect(accuse).toBeEnabled();
  await accuse.click();

  await expect(page.locator(".outcome")).toHaveText("Accused. That SHA was the first-bad.");
  const winCard = page.locator("#win-card");
  await expect(winCard).toBeVisible();
  await expect(winCard).toHaveCSS("width", "1200px");
  await expect(winCard).toHaveCSS("height", "630px");
  await expect(page.locator(".win-seed")).toHaveText("seed 1729");

  await expect(page.locator("[data-share-result]")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-save-card]").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^iwy-thefeaturebranch-seed-1729-\d+-of-5\.png$/);
});
