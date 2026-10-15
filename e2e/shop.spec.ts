import { expect, test } from "@playwright/test";

test("shows the catalog and adds an item to the cart", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await page.getByRole("button", { name: "Add Canvas Tote to cart" }).click();
  await expect(page.getByRole("link", { name: "Cart (1)" })).toBeVisible();
});

test("signed-in user can place an order on desktop", async ({ page }) => {
  await page.goto("./#/login");
  await page.getByLabel("Email").fill("demo@shop.test");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Add Steel Bottle to cart" }).click();
  await page.goto("./#/checkout");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("status")).toHaveText("Your order has been placed.");
});
