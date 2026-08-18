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

/**
 * Win one level by marking what the room said, then accuse.
 *
 * @param page - Browser page
 */
async function winByMarking(page: Page): Promise<void> {
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
}

test("unseen visitors cannot skip into friday", async ({ page }) => {
  await page.goto("/?l=friday");
  await expect(page.locator(".case")).toHaveText("Tutorial");
});

test("wins the Friday deploy by marking what the room said", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("iwy.tutorialDone", "1");
  });
  await page.goto("/?l=friday");
  await expect(page.locator(".case")).toHaveText("The Friday deploy");
  await expect(page.locator(".teach").nth(0)).toHaveText(
    "HEAD is red. Sixty-four suspects. It shipped on a Friday.",
  );
  await winByMarking(page);
});

test("wins the hotfix by marking what the room said", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("iwy.tutorialDone", "1");
  });
  await page.goto("/?l=hotfix");
  await expect(page.locator(".case")).toHaveText("The hotfix");
  await expect(page.locator(".teach").nth(0)).toHaveText(
    "HEAD is red. A hotfix forked and joined before HEAD.",
  );
  await winByMarking(page);
});
