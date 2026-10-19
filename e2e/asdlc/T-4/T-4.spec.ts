import { expect, test } from "@playwright/test";

test("C1: preview dialog shows product details and adds to cart", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByRole("link", { name: "Cart (0)" })).toBeVisible();
  await page.getByRole("button", { name: "Preview Canvas Tote" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Canvas Tote").first()).toBeVisible();
  await expect(dialog.getByText("$24.00").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("link", { name: "Cart (1)" })).toBeVisible();
});

test("C2: carousel starts at image 1 of 5 and wraps around", async ({ page }) => {
  await page.goto("/#/");
  await page.getByRole("button", { name: "Preview Steel Bottle" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Image 1 of 5")).toBeVisible();
  await dialog.getByRole("button", { name: "Next image" }).click();
  await expect(dialog.getByText("Image 2 of 5")).toBeVisible();
  await dialog.getByRole("button", { name: "Previous image" }).click();
  await expect(dialog.getByText("Image 1 of 5")).toBeVisible();
  await dialog.getByRole("button", { name: "Previous image" }).click();
  await expect(dialog.getByText("Image 5 of 5")).toBeVisible();
});

test("C3: carousel shows 5 default images that all load", async ({ page }) => {
  await page.goto("/#/");
  await page.getByRole("button", { name: "Preview Glass Bottle" }).click();
  const dialog = page.getByRole("dialog");
  const next = dialog.getByRole("button", { name: "Next image" });
  for (let i = 1; i <= 5; i++) {
    await expect(dialog.getByText(`Image ${i} of 5`)).toBeVisible();
    const img = dialog.locator("img:visible").first();
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
    await next.click();
  }
  await expect(dialog.getByText("Image 1 of 5")).toBeVisible();
});

test("C4: dialog closes with Close and Escape and stays on Products page", async ({ page }) => {
  await page.goto("/#/");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Preview Canvas Tote" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Preview Canvas Tote" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/#\/$/);
});

test("C5: similar products exclude current and switch the dialog", async ({ page }) => {
  await page.goto("/#/");
  await page.getByRole("button", { name: "Preview Canvas Tote" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Similar products" })).toBeVisible();
  await dialog.getByRole("button", { name: "Next image" }).click();
  await expect(dialog.getByText("Image 2 of 5")).toBeVisible();
  // Laptop Sleeve is the other product in the same category (Bags).
  await expect(dialog.getByText("Laptop Sleeve")).toBeVisible();
  await expect(dialog.getByText("$32.00")).toBeVisible();
  await dialog.getByText("Laptop Sleeve").click();
  await expect(dialog.getByText("Laptop Sleeve").first()).toBeVisible();
  await expect(dialog.getByText("Image 1 of 5")).toBeVisible();
});

test("C6: add-to-cart buttons and search still work on the page", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByRole("link", { name: "Cart (0)" })).toBeVisible();
  await page.getByRole("button", { name: "Add Canvas Tote to cart" }).click();
  await expect(page.getByRole("link", { name: "Cart (1)" })).toBeVisible();
  await page.getByLabel("Search").fill("Bottle");
  await expect(page.getByRole("heading", { name: "Steel Bottle" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Glass Bottle" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Canvas Tote" })).toHaveCount(0);
});
