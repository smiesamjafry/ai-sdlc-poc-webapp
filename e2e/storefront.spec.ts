import { expect, test } from "@playwright/test";
import { addProduct, fillCheckout, signIn } from "./helpers";

test("every product card shows a loaded image whose alt text names the product", async ({ page }) => {
  await page.goto("./#/products");
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  const cards = page.getByRole("list").first().getByRole("listitem");
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  expect(n).toBeGreaterThan(6);
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    const name = (await card.getByRole("heading").textContent())!.trim();
    const img = card.getByRole("img", { name: new RegExp(name) });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }
});

test("searching by name shows only matches, each with its image", async ({ page }) => {
  await page.goto("./#/products");
  await page.getByLabel("Search").fill("Bottle");
  await page.getByRole("button", { name: "Search" }).click();
  const cards = page.getByRole("list").first().getByRole("listitem");
  await expect(cards).toHaveCount(2);
  for (const name of ["Steel Bottle", "Glass Bottle"]) {
    await expect(page.getByRole("img", { name: new RegExp(name) })).toBeVisible();
  }
});

test("filters live in the URL and an empty result offers to clear them", async ({ page }) => {
  await page.goto("./#/products?category=bags&maxPrice=2500");
  await expect(page.getByRole("heading", { name: "Canvas Tote" })).toBeVisible();
  await page.goto("./#/products?q=zzzz-nothing");
  await expect(page.getByText(/No products match/)).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("list").first().getByRole("listitem").first()).toBeVisible();
});

test("guest checkout: decline shows a clear message, a good card places the order", async ({ page }) => {
  await addProduct(page, "canvas-tote");
  await expect(page.getByRole("link", { name: "Cart (1)" })).toBeVisible();
  await page.goto("./#/checkout");
  await fillCheckout(page, "4000 0000 0000 0002");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("alert")).toContainText("declined");
  await page.getByLabel("Card number").fill("4242 4242 4242 4242");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("status")).toHaveText("Your order has been placed.");
  await expect(page.getByRole("link", { name: "Cart (0)" })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Order PS-\d+/)).toBeVisible();
});

test("signed-in customer checks out and sees the order in their account", async ({ page }) => {
  await signIn(page, "demo@shop.test");
  await addProduct(page, "steel-bottle");
  await page.goto("./#/checkout");
  await fillCheckout(page);
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("status")).toHaveText("Your order has been placed.");
  const number = (await page.getByText(/^Order PS-\d+/).first().textContent())!.match(/PS-\d+/)![0];
  await page.goto("./#/account");
  await expect(page.getByRole("link", { name: number })).toBeVisible();
});

test("a guest cart survives sign-in", async ({ page }) => {
  await addProduct(page, "pocket-notebook");
  await signIn(page, "demo@shop.test");
  await page.goto("./#/cart");
  await expect(page.getByRole("link", { name: "Pocket Notebook" })).toBeVisible();
});

test("customers are kept out of admin", async ({ page }) => {
  await signIn(page, "demo@shop.test");
  await page.goto("./#/admin");
  await expect(page.getByText("Not authorised")).toBeVisible();
});
