import { expect, test } from "@playwright/test";

async function addProducts(page: import("@playwright/test").Page, names: string[]) {
  await page.goto("/#/");
  for (const name of names) {
    await page.getByRole("button", { name: `Add ${name} to cart` }).click();
  }
  await page.goto("/#/cart");
  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
}

test("C1: changing quantity to 3 makes the total 3 times the unit price", async ({ page }) => {
  await addProducts(page, ["Canvas Tote"]);
  await page.getByLabel("Quantity of Canvas Tote").fill("3");
  await expect(page.getByTestId("cart-total")).toHaveText("$72.00");
});

test("C2: total sums unit price x quantity across two lines", async ({ page }) => {
  await addProducts(page, ["Canvas Tote", "Steel Bottle"]);
  await page.getByLabel("Quantity of Steel Bottle").fill("2");
  await expect(page.getByTestId("cart-total")).toHaveText("$60.00");
});

test("C3: setting quantity back to 1 returns the total to the unit price", async ({ page }) => {
  await addProducts(page, ["Canvas Tote"]);
  const qty = page.getByLabel("Quantity of Canvas Tote");
  await qty.fill("3");
  await expect(page.getByTestId("cart-total")).toHaveText("$72.00");
  await qty.fill("1");
  await expect(page.getByTestId("cart-total")).toHaveText("$24.00");
});

test("C4: product added from Products page appears with quantity 1 and total equals its price", async ({ page }) => {
  await addProducts(page, ["Steel Bottle"]);
  await expect(page.getByRole("cell", { name: "Steel Bottle" })).toBeVisible();
  await expect(page.getByLabel("Quantity of Steel Bottle")).toHaveValue("1");
  await expect(page.getByTestId("cart-total")).toHaveText("$18.00");
});

test("C5: checkout link stays visible after a quantity change", async ({ page }) => {
  await addProducts(page, ["Canvas Tote"]);
  await page.getByLabel("Quantity of Canvas Tote").fill("2");
  await expect(page.getByLabel("Quantity of Canvas Tote")).toHaveValue("2");
  await expect(page.getByRole("link", { name: "Go to checkout" })).toBeVisible();
});

test("C6: removing a line updates the total, and removing the last shows $0.00", async ({ page }) => {
  await addProducts(page, ["Canvas Tote", "Steel Bottle"]);
  await page.getByLabel("Quantity of Steel Bottle").fill("2");
  await page.getByRole("button", { name: /remove/i }).first().click();
  await expect(page.getByLabel("Quantity of Canvas Tote")).toHaveCount(0);
  await expect(page.getByTestId("cart-total")).toHaveText("$36.00");
  await page.getByRole("button", { name: /remove/i }).first().click();
  await expect(page.getByText("$0.00")).toBeVisible();
});
