import { test, expect } from "@playwright/test";
test("first run and real phone search", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Dashboard",
    }),
  ).toBeVisible();
  const welcome = page.getByRole("button", { name: "Open my workspace" });
  if (await welcome.isVisible()) await welcome.click();
  await page.getByRole("link", {name:"Number",exact:true}).click();
  await page.getByLabel("Search", { exact: true }).fill("+442079460018");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".workflow-entry")).toHaveCount(1);
  await expect(page.getByText("Number format", { exact: true }).first()).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("button",{name:"Expand Number format details",exact:true}).first().click();
  await expect(page.getByText("United Kingdom", { exact: true }).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("unknown quotas and credential controls", async ({ page }) => {
  await page.goto("/website");
  await expect(page.getByRole("button",{name:"Usage",exact:true})).toHaveCount(0);
  await page.getByRole("link",{name:"Settings",exact:true}).click();
  await page.getByLabel("Usage source").selectOption("dns");
  await expect(
    page.getByText("Unknown", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "VirusTotal", exact: true }),
  ).toBeVisible();
  await expect(page.locator("input[type=password]").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
