import { expect, test } from "@playwright/test";

test("learn is a case file with an honest walk", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("iwy.tutorialDone", "1");
  });
  await page.goto("/?l=learn");

  await expect(page.locator("#learn")).toBeVisible();
  await expect(page.locator(".case")).toHaveText("Learn");
  await expect(page.locator(".doors a[aria-current=\"page\"]")).toHaveText("Learn");
  await expect(page.locator(".learn-lede")).toHaveText(
    "Learn is a case file. It is not a fourth dungeon.",
  );
  await expect(page.locator("#map")).toHaveCount(0);

  const next = page.locator("[data-learn=\"next\"]");
  await expect(page.locator(".learn-walk-marks")).toHaveText("0 / 3");
  for (let step = 0; step < 6; step += 1) {
    if (!(await next.isEnabled())) {
      break;
    }
    await next.click();
  }
  await expect(next).toBeDisabled();
  await expect(page.locator(".learn-walk-marks")).toHaveText("3 / 3");
  await expect(page.locator(".learn-walk-status")).toHaveText(
    "Accused. That SHA was the first-bad.",
  );
  await expect(page.locator("#learn-walk .exhibit-path")).toHaveText("src/collect.ts");

  await page.locator("[data-learn=\"reset\"]").click();
  await expect(page.locator(".learn-walk-marks")).toHaveText("0 / 3");
  await expect(next).toBeEnabled();
});

test("unseen visitors cannot skip into learn", async ({ page }) => {
  await page.goto("/?l=learn");
  await expect(page.locator(".teach").nth(0)).toHaveText(
    "HEAD is red. The last green is 8 suspects back.",
  );
  await expect(page.locator("#learn")).toHaveCount(0);
});
