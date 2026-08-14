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

test("unseen visitors have no file control: the tutorial comes first", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#chrome")).toBeVisible();
  await expect(page.locator("[data-import]")).toHaveCount(0);
});

test("choosing the fixture starts the imported case and it is winnable", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("iwy.tutorialDone", "1");
  });
  await page.goto("/");
  await expect(page.locator("#chrome")).toBeVisible();

  await page.locator("input[data-import]").setInputFiles("e2e/fixtures/imported-case.fastexport");

  // The imported desk: named case, real subjects, no share link, no door.
  await expect(page.locator(".case")).toHaveText("Imported");
  await expect(page.locator(".teach").nth(0)).toHaveText(
    "HEAD is red. 10 suspects came in from another repo.",
  );
  await expect(page.locator(".share")).toHaveCount(0);
  await expect(page.locator(".door.is-current")).toHaveCount(0);
  await expect(page.locator(".checkout")).toContainText(
    /boot the service|add the collector|parse the intake form|wire the export path|cache the manifest|trim the audit trail|batch the retries|rotate the keys|adjust the walk bound|polish the summary|ship the Friday build/,
  );

  const accuse = page.locator("[data-command=\"accuse\"]");
  for (let step = 0; step < 10; step += 1) {
    if (await accuse.isEnabled()) {
      break;
    }
    await markWhatTheRoomSaid(page);
  }
  await expect(accuse).toBeEnabled();
  await accuse.click();
  await expect(page.locator(".outcome")).toHaveText("Accused. That SHA was the first-bad.");
  await expect(page.locator("#win-card")).toBeVisible();
});

test("a merge commit from disk is refused with a postmortem line", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("iwy.tutorialDone", "1");
  });
  await page.goto("/");
  await expect(page.locator("#chrome")).toBeVisible();
  // The default post-tutorial desk is the yesterday case.
  await expect(page.locator(".case")).toHaveText("Yesterday");

  await page.locator("input[data-import]").setInputFiles("e2e/fixtures/merged-case.fastexport");

  await expect(page.locator(".import-note")).toHaveText(
    "merge commits cannot be imported; export a linear branch",
  );
  // The refusal does not replace the open case.
  await expect(page.locator(".case")).toHaveText("Yesterday");
});
