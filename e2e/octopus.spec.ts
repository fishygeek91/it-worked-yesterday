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

test("unseen visitors cannot skip into the release train", async ({ page }) => {
  await page.goto("/?l=octopus");
  await expect(page.locator(".teach").nth(0)).toHaveText(
    "HEAD is red. The last green is 8 suspects back.",
  );
  await expect(page.locator(".case")).toHaveText("Tutorial");
});

test("wins the release train by marking what the room said", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("iwy.tutorialDone", "1");
  });
  await page.goto("/?l=octopus");
  await expect(page.locator("#chrome")).toBeVisible();
  await expect(page.locator(".case")).toHaveText("The release train");
  await expect(page.locator(".teach").nth(0)).toHaveText(
    "HEAD is red. Three branches merged in one commit.",
  );

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
});
