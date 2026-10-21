import { expect, test } from "@playwright/test";

test("C1: home page header shows My Pocket Shop", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "My Pocket Shop", exact: true })).toBeVisible();
});

test("C2: Products page header shows My Pocket Shop", async ({ page }) => {
  await page.goto("/#/products");
  await expect(page.getByRole("banner").getByRole("link", { name: "My Pocket Shop", exact: true })).toBeVisible();
});

test("C3: browser tab title on home page contains My Pocket Shop", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/My Pocket Shop/);
});

test("C4: admin dashboard shows My Pocket Shop in the header", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByLabel("Email").fill("admin@shop.test");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto("/#/admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "My Pocket Shop", exact: true })).toBeVisible();
});
