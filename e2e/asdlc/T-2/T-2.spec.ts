import { expect, test } from "@playwright/test";

const NAMES = ["Canvas Tote", "Steel Bottle", "Dot Grid Notebook", "Laptop Sleeve", "Glass Bottle", "Pocket Notebook"];

test("C1: every product on the Products page shows an image", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  const items = page.getByRole("listitem");
  await expect(items).toHaveCount(NAMES.length);
  await expect(items.getByRole("img")).toHaveCount(NAMES.length);
  for (const img of await items.getByRole("img").all()) {
    await expect(img).toBeVisible();
  }
});

test("C2: each product image has alt text with the product name and loads", async ({ page }) => {
  await page.goto("/#/");
  for (const name of NAMES) {
    const img = page.getByRole("img", { name: new RegExp(name) });
    await expect(img).toHaveCount(1);
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
  }
});

test("C3: searching by name shows only matches, each with its image", async ({ page }) => {
  await page.goto("/#/");
  await page.getByLabel("Search").fill("Bottle");
  const items = page.getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Steel Bottle" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Glass Bottle" })).toBeVisible();
  await expect(items.getByRole("img")).toHaveCount(2);
  await expect(page.getByRole("img", { name: /Steel Bottle/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Glass Bottle/ })).toBeVisible();
});

test("C4: at 375px images fit the screen and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/#/");
  const imgs = page.getByRole("listitem").getByRole("img");
  await expect(imgs).toHaveCount(NAMES.length);
  for (const img of await imgs.all()) {
    await expect(img).toBeVisible();
    const box = await img.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("C5: adding a product increases the header cart count by 1", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByRole("link", { name: "Cart (0)" })).toBeVisible();
  await page.getByRole("button", { name: "Add Canvas Tote to cart" }).click();
  await expect(page.getByRole("link", { name: "Cart (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Add Glass Bottle to cart" }).click();
  await expect(page.getByRole("link", { name: "Cart (2)" })).toBeVisible();
});

test("C6: typing in Search narrows the product list to matching names", async ({ page }) => {
  await page.goto("/#/");
  await page.getByLabel("Search").fill("Notebook");
  await expect(page.getByRole("heading", { name: "Dot Grid Notebook" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pocket Notebook" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Canvas Tote" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Steel Bottle" })).toHaveCount(0);
});
